// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { holidaysResponse, policySettings } from "@vernacular/contracts";
import { PolicyPage } from "@/features/settings/policy/PolicyPage";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

// Fixtures parsed with the REAL contract the Day-3 API serves (apps/api/src/modules/policy).
const policy = policySettings.parse({
  callWindowStart: "09:00",
  callWindowEnd: "21:00",
  allowedDays: [1, 2, 3, 4, 5, 6],
  maxAttemptsPerDay: 3,
  maxAttemptsTotal: 8,
  minGapMinutes: 60,
  requireConsent: true,
  ndncCheck: true,
  promoRequires140: false,
  aiDisclosureText: null,
});
const HOLIDAY = "01a14679-0000-7000-8000-0000000009a1";
const holidays = holidaysResponse.parse({
  items: [{ id: HOLIDAY, date: "2026-11-08", name: "Diwali" }],
});
const routes = (extra = {}) => ({
  "GET /api/settings/policy": () => ({ body: policy }),
  "GET /api/settings/holidays": () => ({ body: holidays }),
  ...extra,
});

describe("/settings/policy (D6-I4-02, live API)", () => {
  it("shows the saved policy and holidays in the tenant timezone", async () => {
    mockApi(routes());
    const { container } = renderUI(<PolicyPage />, { role: "admin" });
    expect(((await screen.findByLabelText("From")) as HTMLInputElement).value).toBe("09:00");
    expect((screen.getByLabelText("Until") as HTMLInputElement).value).toBe("21:00");
    expect((screen.getByRole("checkbox", { name: "Sun" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Sat" }) as HTMLInputElement).checked).toBe(true);
    expect(
      screen
        .getByRole("switch", { name: "Require consent before calling" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByText(/Times are in Asia\/Kolkata/)).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "Holiday list" })).getByText("8 Nov"),
    ).toBeTruthy();
    expectSmallScreenSafe(container);
  });

  it("save sends the full PUT body and shows the server's reply", async () => {
    const calls = mockApi(
      routes({
        "PUT /api/settings/policy": ({ body }: { body: unknown }) => ({ body }),
      }),
    );
    renderUI(<PolicyPage />, { role: "owner" });
    await userEvent.click(await screen.findByRole("checkbox", { name: "Sun" }));
    const perDay = screen.getByLabelText("Max calls per day");
    await userEvent.clear(perDay);
    await userEvent.type(perDay, "4");
    await userEvent.click(screen.getByRole("switch", { name: "Check the NDNC registry" }));
    await userEvent.type(screen.getByLabelText(/AI disclosure/), "This is an automated assistant.");
    await userEvent.click(screen.getByRole("button", { name: "Save policy" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
      ...policy,
      allowedDays: [1, 2, 3, 4, 5, 6, 7],
      maxAttemptsPerDay: 4,
      ndncCheck: false,
      aiDisclosureText: "This is an automated assistant.",
    });
    expect(await screen.findByText(/Saved — applies to the next dial/)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Sun" }) as HTMLInputElement).checked).toBe(true);
  });

  it("client validation mirrors the API; a server 422 maps onto the field", async () => {
    const calls = mockApi(
      routes({
        "PUT /api/settings/policy": () => ({
          status: 422,
          body: {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid",
              details: [{ path: "minGapMinutes", message: "Too large" }],
            },
          },
        }),
      }),
    );
    renderUI(<PolicyPage />, { role: "admin" });
    const total = await screen.findByLabelText("Max calls in total");
    await userEvent.clear(total);
    await userEvent.type(total, "2");
    await userEvent.click(screen.getByRole("button", { name: "Save policy" }));
    expect(screen.getByText("Per-day cap cannot exceed the total cap")).toBeTruthy();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);

    await userEvent.clear(total);
    await userEvent.type(total, "8");
    await userEvent.click(screen.getByRole("button", { name: "Save policy" }));
    expect(await screen.findByText("Too large")).toBeTruthy();
  });

  it("holidays: add (upsert by date) and remove use the server's replies", async () => {
    const calls = mockApi(
      routes({
        "POST /api/settings/holidays": () => ({
          status: 201,
          body: {
            id: "01a14679-0000-7000-8000-0000000009a2",
            date: "2026-10-02",
            name: "Gandhi Jayanti",
          },
        }),
        [`DELETE /api/settings/holidays/${HOLIDAY}`]: () => ({ status: 200, body: {} }),
      }),
    );
    renderUI(<PolicyPage />, { role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: "Add holiday" }));
    expect(screen.getByText("Pick a date")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Date"), "2026-10-02");
    await userEvent.type(screen.getByLabelText("Name"), "Gandhi Jayanti");
    await userEvent.click(screen.getByRole("button", { name: "Add holiday" }));
    const list = screen.getByRole("list", { name: "Holiday list" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(2));
    expect(within(list).getAllByRole("listitem")[0]!.textContent).toContain("Gandhi Jayanti"); // sorted by date
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      date: "2026-10-02",
      name: "Gandhi Jayanti",
    });
    await userEvent.click(screen.getByRole("button", { name: "Remove Diwali" }));
    await waitFor(() => expect(within(list).queryByText(/Diwali/)).toBeNull());
  });

  it("states and roles: error, empty holidays, heads/counsellors gated (sitemap: owner/admin)", async () => {
    mockApi({
      "GET /api/settings/policy": () => ({
        status: 500,
        body: { error: { code: "INTERNAL", message: "Down" } },
      }),
      "GET /api/settings/holidays": () => ({ body: { items: [] } }),
    });
    const a = renderUI(<PolicyPage />, { role: "admin" });
    expect(await screen.findByText("Couldn't load the calling policy")).toBeTruthy();
    expect(await screen.findByText("No holidays yet.")).toBeTruthy();
    a.unmount();
    for (const role of ["admission_head", "counsellor"] as const) {
      const calls = mockApi({});
      const r = renderUI(<PolicyPage />, { role });
      expect(screen.getByText("Not available for your role")).toBeTruthy();
      expect(calls).toHaveLength(0);
      r.unmount();
    }
  });
});
