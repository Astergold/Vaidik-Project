// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  kbDocument,
  kbSearchResponse,
  programDetail,
  type ProgramDetail,
} from "@vernacular/contracts";
import { KbPage } from "@/features/programs/KbPage";
import { ProgramsPage } from "@/features/programs/ProgramsPage";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract.
const PID = "01a14679-1d0a-7b30-97ae-d2d0f02f35b0";
const base: ProgramDetail = programDetail.parse({
  id: PID,
  name: "B.Tech Computer Science",
  code: "BTCS",
  isActive: true,
  fees: [],
  seats: [],
  deadlines: [],
  eligibility: null,
  updatedAt: "2026-10-17T00:00:00.000Z",
});
const year = (() => {
  const y = new Date().getFullYear();
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
})();

/** A tiny in-memory "server" that applies each editor call to the program and returns it. */
function programServer() {
  let p = structuredClone(base);
  const routes: Parameters<typeof mockApi>[0] = {
    "GET /api/programs": () => ({ body: { items: [p] } }),
    "POST /api/programs": ({ body }) => {
      p = { ...p, ...(body as object) };
      return { status: 201, body: p };
    },
    [`POST /api/programs/${PID}/fees`]: ({ body }) => {
      p = {
        ...p,
        fees: [
          ...p.fees,
          {
            id: "01a14679-0000-7000-8000-000000000601",
            currency: "INR",
            ...(body as object),
          } as ProgramDetail["fees"][number],
        ],
      };
      return { body: p };
    },
    [`PUT /api/programs/${PID}/seat`]: ({ body }) => {
      p = { ...p, seats: [body as ProgramDetail["seats"][number]] };
      return { body: p };
    },
    [`POST /api/programs/${PID}/deadlines`]: ({ body }) => {
      p = {
        ...p,
        deadlines: [
          {
            id: "01a14679-0000-7000-8000-000000000701",
            ...(body as object),
          } as ProgramDetail["deadlines"][number],
        ],
      };
      return { body: p };
    },
    [`PUT /api/programs/${PID}/eligibility`]: ({ body }) => {
      p = { ...p, eligibility: body as ProgramDetail["eligibility"] };
      return { body: p };
    },
  };
  return routes;
}

describe("ProgramsPage + editor (D4-I4-03)", () => {
  it("states: loading, empty, error, not available", async () => {
    mockApi({ "GET /api/programs": () => new Promise(() => {}) });
    const a = renderUI(<ProgramsPage />, { role: "admin" });
    expect(screen.getByLabelText("Loading programs")).toBeTruthy();
    a.unmount();
    mockApi({ "GET /api/programs": () => ({ body: { items: [] } }) });
    const b = renderUI(<ProgramsPage />, { role: "admin" });
    expect(await screen.findByText("No programs yet")).toBeTruthy();
    b.unmount();
    mockApi({
      "GET /api/programs": () => ({
        status: 500,
        body: { error: { code: "INTERNAL", message: "Server error" } },
      }),
    });
    const c = renderUI(<ProgramsPage />, { role: "admin" });
    expect(await screen.findByText("Couldn't load programs")).toBeTruthy();
    c.unmount();
    mockApi({});
    renderUI(<ProgramsPage />, { role: "admin" });
    expect(await screen.findByText("Programs service not available yet")).toBeTruthy();
  });

  it("adds a fee, a seat bucket, a deadline and eligibility; each call refreshes the program from the server", async () => {
    const calls = mockApi(programServer());
    renderUI(<ProgramsPage />, { role: "admin" });
    await userEvent.click(
      await screen.findByRole("button", { name: /Open B.Tech Computer Science/ }),
    );
    const sheet = await screen.findByRole("dialog");

    await userEvent.type(within(sheet).getByLabelText("Amount (₹)"), "245000");
    await userEvent.click(within(sheet).getByRole("button", { name: "Add fee" }));
    await waitFor(() => expect(within(sheet).getByText("₹2,45,000")).toBeTruthy());

    await userEvent.selectOptions(within(sheet).getByLabelText("Availability"), "limited");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(sheet).getByText(`${year}: Limited seats`)).toBeTruthy());

    await userEvent.type(within(sheet).getByLabelText(/Date \(/), "2027-05-31");
    await userEvent.click(within(sheet).getByRole("button", { name: "Add deadline" }));
    await waitFor(() => expect(within(sheet).getByText(/Application — 31 May/)).toBeTruthy());

    await userEvent.type(within(sheet).getByLabelText("Who can apply"), "12th pass with PCM");
    await userEvent.click(within(sheet).getByRole("button", { name: "Add a minimum" }));
    await userEvent.type(within(sheet).getByLabelText("Requirement 1"), "12th marks");
    await userEvent.type(within(sheet).getByLabelText("Minimum 1"), "60%");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save eligibility" }));

    await waitFor(() => expect(calls.filter((c) => c.method !== "GET")).toHaveLength(4));
    const writes = calls
      .filter((c) => c.method !== "GET")
      .map((c) => [c.method, c.path.replace(PID, ":id"), c.body]);
    expect(writes).toEqual([
      [
        "POST",
        "/api/programs/:id/fees",
        { amount: 245000, kind: "tuition", academicYear: year, currency: "INR" },
      ],
      ["PUT", "/api/programs/:id/seat", { academicYear: year, bucket: "limited" }],
      [
        "POST",
        "/api/programs/:id/deadlines",
        { kind: "application", dueAt: "2027-05-31T18:29:00.000Z" },
      ], // 23:59 IST
      [
        "PUT",
        "/api/programs/:id/eligibility",
        { summary: "12th pass with PCM", minimums: [{ label: "12th marks", value: "60%" }] },
      ],
    ]);
  });

  it("never asks for a seat count — only the bucket", async () => {
    mockApi(programServer());
    renderUI(<ProgramsPage />, { role: "admin" });
    await userEvent.click(
      await screen.findByRole("button", { name: /Open B.Tech Computer Science/ }),
    );
    const seat = within(await screen.findByRole("region", { name: "Seat availability" }));
    expect(seat.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(seat.getByLabelText("Availability").tagName).toBe("SELECT");
    expect(document.body.textContent).not.toMatch(/seats? (available|left|remaining)\s*:?\s*\d/i);
  });

  it("create a program", async () => {
    const calls = mockApi({
      ...programServer(),
      "GET /api/programs": () => ({ body: { items: [] } }),
    });
    renderUI(<ProgramsPage />, { role: "owner" });
    await userEvent.click((await screen.findAllByRole("button", { name: /New program/ }))[0]!);
    await userEvent.type(screen.getByLabelText("Name"), "MBA");
    await userEvent.click(screen.getByRole("button", { name: "Create program" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")!.body).toEqual({ name: "MBA", isActive: true }),
    );
  });

  it("roles: admission head sees the data without editing; admin can edit", async () => {
    mockApi(programServer());
    const head = renderUI(<ProgramsPage />, { role: "admission_head" });
    expect(await screen.findByText(/View only/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /New program/ })).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: /Open B.Tech/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByRole("button", { name: /Add fee|Save|Add deadline/ })).toBeNull();
    head.unmount();
    renderUI(<ProgramsPage />, { role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: /Open B.Tech/ }));
    expect(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Add fee" }),
    ).toBeTruthy();
  });

  it("small-screen structure: editor rows wrap, no fixed widths over 200px, min-w-0 sections", async () => {
    mockApi(programServer());
    const { container } = renderUI(<ProgramsPage />, { role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: /Open B.Tech/ }));
    const sheet = await screen.findByRole("dialog");
    for (const f of sheet.querySelectorAll('form[aria-label]:not([aria-label="Eligibility"])'))
      expect(f.className).toContain("flex-wrap");
    for (const s of sheet.querySelectorAll("section")) expect(s.className).toContain("min-w-0");
    expect(document.body.innerHTML + container.innerHTML).not.toMatch(
      /\bw-\[\d{3,}px\]|min-w-\[\d{3,}px\]/,
    );
  });
});

describe("KbPage (D4-I4-03)", () => {
  const results = kbSearchResponse.parse({
    items: [
      {
        id: "01a14679-0000-7000-8000-000000000801",
        title: "Hostel fees",
        snippet: "Hostel fees are ₹90,000 a year including mess.",
        tags: ["fees", "hostel"],
        programId: null,
      },
    ],
  });

  it("states: loading, empty, error, not available", async () => {
    mockApi({ "GET /api/kb": () => new Promise(() => {}) });
    const a = renderUI(<KbPage />, { role: "admin" });
    expect(screen.getByLabelText("Loading articles")).toBeTruthy();
    a.unmount();
    mockApi({ "GET /api/kb": () => ({ body: { items: [] } }) });
    const b = renderUI(<KbPage />, { role: "admin" });
    expect(await screen.findByText("No articles yet")).toBeTruthy();
    b.unmount();
    mockApi({
      "GET /api/kb": () => ({
        status: 500,
        body: { error: { code: "INTERNAL", message: "Server error" } },
      }),
    });
    const c = renderUI(<KbPage />, { role: "admin" });
    expect(await screen.findByText("Couldn't load articles")).toBeTruthy();
    c.unmount();
    mockApi({});
    renderUI(<KbPage />, { role: "admin" });
    expect(await screen.findByText("Knowledge base not available yet")).toBeTruthy();
  });

  it("typing a keyword searches GET /api/kb?q= and shows the server's snippet; a tag filters", async () => {
    const calls = mockApi({ "GET /api/kb": () => ({ body: results }) });
    renderUI(<KbPage />, { role: "admin" });
    await screen.findByText("Hostel fees");
    await userEvent.type(screen.getByLabelText("Search articles"), "hostel");
    await waitFor(() => expect(calls.some((c) => c.query.get("q") === "hostel")).toBe(true));
    expect(screen.getByTestId("snippet").textContent).toBe(
      "Hostel fees are ₹90,000 a year including mess.",
    );
    await userEvent.click(screen.getByRole("button", { name: "#hostel" }));
    await waitFor(() =>
      expect(
        calls.some((c) => c.query.get("tag") === "hostel" && c.query.get("q") === "hostel"),
      ).toBe(true),
    );
  });

  it("create with live preview (raw HTML stays text) and POST", async () => {
    const calls = mockApi({
      "GET /api/kb": () => ({ body: { items: [] } }),
      "GET /api/programs": () => ({ body: { items: [base] } }),
      "POST /api/kb": ({ body }) => ({
        status: 201,
        body: kbDocument.parse({
          id: "01a14679-0000-7000-8000-000000000802",
          updatedAt: "2026-10-17T00:00:00.000Z",
          ...(body as object),
        }),
      }),
    });
    renderUI(<KbPage />, { role: "admin" });
    await userEvent.click((await screen.findAllByRole("button", { name: /New article/ }))[0]!);
    const sheet = await screen.findByRole("dialog");
    await userEvent.type(within(sheet).getByLabelText("Title"), "Scholarships");
    await userEvent.type(within(sheet).getByLabelText("Tags (comma-separated)"), "fees, merit");
    await userEvent.type(
      within(sheet).getByLabelText("Article (Markdown)"),
      "# Merit{Enter}{Enter}**Up to 50%** off <b>tuition</b>",
    );
    const preview = within(sheet).getByLabelText("Preview");
    expect(preview.querySelector("h1")!.textContent).toBe("Merit");
    expect(preview.querySelector("strong")!.textContent).toBe("Up to 50%");
    expect(preview.querySelector("b")).toBeNull(); // raw HTML is text
    expect(preview.textContent).toContain("<b>tuition</b>");
    await userEvent.click(within(sheet).getByRole("button", { name: "Create article" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toBeTruthy());
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      title: "Scholarships",
      programId: null,
      tags: ["fees", "merit"],
      body: "# Merit\n\n**Up to 50%** off <b>tuition</b>",
    });
  });

  it("roles: admission head reads, no create/edit", async () => {
    const { container } = (() => {
      mockApi({
        "GET /api/kb": () => ({ body: results }),
        [`GET /api/kb/${results.items[0]!.id}`]: () => ({
          body: kbDocument.parse({
            id: results.items[0]!.id,
            title: "Hostel fees",
            programId: null,
            tags: [],
            body: "Hostel is **₹90,000**.",
            updatedAt: "2026-10-17T00:00:00.000Z",
          }),
        }),
      });
      return renderUI(<KbPage />, { role: "admission_head" });
    })();
    await screen.findByText("Hostel fees");
    expect(screen.queryByRole("button", { name: /New article/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Hostel fees/ }));
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("₹90,000")).toBeTruthy();
    expect(within(sheet).queryByRole("textbox")).toBeNull();
    expect(container).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
