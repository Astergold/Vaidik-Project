// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { leadsListResponse } from "@vernacular/contracts";
import { PrivacyPage } from "@/features/settings/PrivacyPage";
import { ProfilePage } from "@/features/settings/ProfilePage";
import { saveBlob } from "@/lib/download";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

vi.mock("@/lib/download", () => ({ saveBlob: vi.fn() }));

const PERSON = "01a14679-0000-7000-8000-000000000ea1";
const leads = leadsListResponse.parse({
  page: 1,
  pageSize: 10,
  total: 1,
  items: [
    {
      id: "01a14679-0000-7000-8000-000000000eb1",
      person: { id: PERSON, fullName: "Asha Rao", phone: "+919876543210", city: null },
      stage: "lost",
      subStage: null,
      temperature: null,
      nextStep: null,
      nextStepDueAt: null,
      owner: null,
      aiAgent: null,
      source: null,
      program: null,
      callCount: 1,
      lastCallAt: null,
      lastRejectCode: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    },
  ],
});
const privacy = { retentionDays: 730, lastPurgeAt: "2026-10-17T21:30:00.000Z", nextPurgeAt: null };

describe("/settings/privacy (D6-I4-02)", () => {
  it("retention: shows the saved period and PUTs the new one", async () => {
    const calls = mockApi({
      "GET /api/settings/privacy": () => ({ body: privacy }),
      "PUT /api/settings/privacy": ({ body }) => ({ body: { ...privacy, ...(body as object) } }),
    });
    const { container } = renderUI(<PrivacyPage />, { role: "owner" });
    const select = (await screen.findByLabelText("Delete personal data")) as HTMLSelectElement;
    expect(select.value).toBe("730");
    expect(screen.getByText(/Last run 18 Oct, 3:00 am/)).toBeTruthy();
    await userEvent.selectOptions(select, "");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ retentionDays: null }),
    );
    expectSmallScreenSafe(container);
  });

  it("find a person (real leads search) → export JSON → erase only after typing their exact name", async () => {
    const calls = mockApi({
      "GET /api/settings/privacy": () => ({ body: privacy }),
      "GET /api/leads": () => ({ body: leads }),
      [`GET /api/persons/${PERSON}/export`]: () => ({ body: { person: { id: PERSON } } }),
      [`DELETE /api/persons/${PERSON}`]: () => ({ status: 200, body: {} }),
    });
    renderUI(<PrivacyPage />, { role: "owner" });
    await userEvent.click(await screen.findByRole("button", { name: /Find a person/ }));
    await userEvent.type(screen.getByLabelText("Search leads"), "asha");
    await userEvent.click(await screen.findByRole("button", { name: /Asha Rao/ }));
    await userEvent.click(screen.getByRole("button", { name: "Choose" }));
    const tools = screen.getByRole("region", { name: "Person requests" });
    await userEvent.click(within(tools).getByRole("button", { name: /Export data/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(vi.mocked(saveBlob).mock.calls[0]![1]).toBe(`person-${PERSON}.json`);

    const erase = within(tools).getByRole("button", {
      name: /Erase permanently/,
    }) as HTMLButtonElement;
    await userEvent.type(within(tools).getByLabelText(/Erase this person/), "asha rao");
    expect(erase.disabled).toBe(true);
    await userEvent.clear(within(tools).getByLabelText(/Erase this person/));
    await userEvent.type(within(tools).getByLabelText(/Erase this person/), "Asha Rao");
    expect(erase.disabled).toBe(false);
    await userEvent.click(erase);
    expect(await screen.findByText("Personal data erased.")).toBeTruthy();
    expect(calls.some((c) => c.method === "DELETE" && c.path === `/api/persons/${PERSON}`)).toBe(
      true,
    );
  });

  it("states and roles", async () => {
    mockApi({});
    const a = renderUI(<PrivacyPage />, { role: "owner" });
    expect(await screen.findByText("Privacy service not available yet")).toBeTruthy();
    a.unmount();
    const calls = mockApi({});
    renderUI(<PrivacyPage />, { role: "admission_head" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});

describe("/profile (D6-I4-02, live Better Auth endpoints)", () => {
  it("everyone can open it; shows identity from /api/me", () => {
    for (const role of ["super_admin", "owner", "counsellor"] as const) {
      mockApi({});
      const r = renderUI(<ProfilePage />, { role });
      expect(screen.getByText("c1@mit-adt.local")).toBeTruthy();
      r.unmount();
    }
  });

  it("name: POST /api/auth/update-user with the trimmed name", async () => {
    const calls = mockApi({ "POST /api/auth/update-user": () => ({ body: { status: true } }) });
    renderUI(<ProfilePage />, { role: "counsellor" });
    const name = screen.getByLabelText("Your name");
    await userEvent.clear(name);
    await userEvent.type(name, "  Chitra K  ");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(calls[0]?.body).toEqual({ name: "Chitra K" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
  });

  it("password: checks length and match, maps a wrong current password, clears on success", async () => {
    let wrong = true;
    const calls = mockApi({
      "POST /api/auth/change-password": () =>
        wrong
          ? { status: 400, body: { code: "INVALID_PASSWORD", message: "Invalid password" } }
          : { body: { status: true } },
    });
    renderUI(<ProfilePage />, { role: "admin" });
    await userEvent.type(screen.getByLabelText("Current password"), "old-password");
    await userEvent.type(screen.getByLabelText("New password"), "short");
    await userEvent.type(screen.getByLabelText("Repeat new password"), "different");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("Use at least 10 characters")).toBeTruthy();
    expect(screen.getByText("The two new passwords don't match")).toBeTruthy();
    expect(calls).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText("New password"));
    await userEvent.type(screen.getByLabelText("New password"), "a-much-longer-pass");
    await userEvent.clear(screen.getByLabelText("Repeat new password"));
    await userEvent.type(screen.getByLabelText("Repeat new password"), "a-much-longer-pass");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Your current password is wrong.")).toBeTruthy();
    expect(calls[0]!.body).toEqual({
      currentPassword: "old-password",
      newPassword: "a-much-longer-pass",
      revokeOtherSessions: true,
    });

    wrong = false;
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Password changed")).toBeTruthy();
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("");
  });
});
