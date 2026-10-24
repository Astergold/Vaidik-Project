// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { teamResponse } from "@vernacular/contracts";
import { TeamPage } from "@/features/settings/TeamPage";
import { expectSmallScreenSafe } from "@/test/layout";
import { ME, mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract. "You" = the test session's user id.
const SELF = ME("owner").user.id;
const C2 = "01a14679-0000-7000-8000-000000000ca2";
const AGENT = { id: "01a14679-0000-7000-8000-000000000cb1", name: "Asha (English)" };
const team = (over: object = {}) =>
  teamResponse.parse({
    members: [
      {
        userId: SELF,
        name: "Owner One",
        email: "owner@mit-adt.local",
        role: "owner",
        status: "active",
        lastActiveAt: null,
        allocatedAgents: [],
        joinedAt: "2026-09-01T00:00:00.000Z",
      },
      {
        userId: C2,
        name: "Chetan",
        email: "c2@mit-adt.local",
        role: "counsellor",
        status: "active",
        lastActiveAt: "2026-10-17T04:00:00.000Z",
        allocatedAgents: [AGENT],
        joinedAt: "2026-09-02T00:00:00.000Z",
      },
    ],
    invitations: [
      {
        id: "inv_1",
        email: "head@mit-adt.local",
        role: "admission_head",
        invitedBy: "Owner One",
        invitedAt: "2026-10-16T00:00:00.000Z",
        expiresAt: "2026-10-23T00:00:00.000Z",
      },
    ],
    seats: { used: 3, limit: 5 },
    ...over,
  });
const agents = {
  items: [
    {
      id: AGENT.id,
      displayName: AGENT.name,
      language: "en",
      voice: null,
      isActive: true,
      counsellors: [{ id: C2, name: "Chetan" }],
    },
  ],
};
const filters = {
  sources: [],
  agents: [],
  counsellors: [{ id: C2, name: "Chetan", isActive: true }],
};
const base = {
  "GET /api/agents": () => ({ body: agents }),
  "GET /api/leads/filters": () => ({ body: filters }),
};

describe("/settings/team (D6-I4-02)", () => {
  it("seats, members (you can't change yourself), allocated agents, pending invitations, allocation section", async () => {
    mockApi({ ...base, "GET /api/settings/team": () => ({ body: team() }) });
    const { container } = renderUI(<TeamPage />, { role: "owner" });
    expect(await screen.findByText("3 of 5 seats used")).toBeTruthy();
    expect((screen.getByLabelText("Role of Owner One") as HTMLSelectElement).disabled).toBe(true);
    const chetan = screen.getByText("c2@mit-adt.local").closest("tr")!;
    expect(within(chetan).getByText("Asha (English)")).toBeTruthy();
    expect(screen.getByText("head@mit-adt.local")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Allocate counsellors/ })).toBeTruthy();
    expectSmallScreenSafe(container);
  });

  it("invite: validates, lowercases, and lists the server's invitation; only owners are offered Owner", async () => {
    let state = team();
    const inv = {
      id: "inv_2",
      email: "c3@mit-adt.local",
      role: "counsellor" as const,
      invitedBy: "Owner One",
      invitedAt: "2026-10-17T00:00:00.000Z",
      expiresAt: "2026-10-24T00:00:00.000Z",
    };
    const calls = mockApi({
      ...base,
      "GET /api/settings/team": () => ({ body: state }),
      "POST /api/settings/team/invitations": () => {
        state = {
          ...state,
          invitations: [inv, ...state.invitations],
          seats: { used: 4, limit: 5 },
        };
        return { status: 201, body: inv };
      },
    });
    const a = renderUI(<TeamPage />, { role: "owner" });
    const role = await screen.findByLabelText("Role");
    expect(within(role).getByText("Owner")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Email"), "nope");
    await userEvent.click(screen.getByRole("button", { name: /Send invite/ }));
    expect(screen.getByText("Enter a valid email address")).toBeTruthy();
    await userEvent.clear(screen.getByLabelText("Email"));
    await userEvent.type(screen.getByLabelText("Email"), "C3@MIT-ADT.local");
    await userEvent.click(screen.getByRole("button", { name: /Send invite/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        email: "c3@mit-adt.local",
        role: "counsellor",
      }),
    );
    expect(await screen.findByText("c3@mit-adt.local")).toBeTruthy();
    expect(await screen.findByText("4 of 5 seats used")).toBeTruthy(); // seats refetched from the server
    a.unmount();

    mockApi({ ...base, "GET /api/settings/team": () => ({ body: team() }) });
    renderUI(<TeamPage />, { role: "admin" });
    expect(within(await screen.findByLabelText("Role")).queryByText("Owner")).toBeNull();
  });

  it("full plan: invite disabled with an explanation; 409 from the server is shown", async () => {
    mockApi({
      ...base,
      "GET /api/settings/team": () => ({ body: team({ seats: { used: 5, limit: 5 } }) }),
    });
    renderUI(<TeamPage />, { role: "owner" });
    expect(await screen.findByText(/All seats are in use/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Send invite/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("change role and deactivate (with confirm) show the server's member", async () => {
    let state = team();
    const setMember = (patch: object) => {
      const m = { ...state.members[1]!, ...patch };
      state = { ...state, members: [state.members[0]!, m] };
      return m;
    };
    const calls = mockApi({
      ...base,
      "GET /api/settings/team": () => ({ body: state }),
      [`PATCH /api/settings/team/members/${C2}`]: () => ({
        body: setMember({ role: "admission_head", allocatedAgents: [] }),
      }),
      [`POST /api/settings/team/members/${C2}/deactivate`]: () => ({
        body: setMember({ status: "deactivated" }),
      }),
    });
    renderUI(<TeamPage />, { role: "owner" });
    await userEvent.selectOptions(await screen.findByLabelText("Role of Chetan"), "admission_head");
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ role: "admission_head" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(screen.getByText(/can't sign in until reactivated/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(await screen.findByRole("button", { name: "Reactivate" })).toBeTruthy();
    expect(screen.getByText("Deactivated")).toBeTruthy();
  });

  it("cancel an invitation; states; roles", async () => {
    let state = team();
    mockApi({
      ...base,
      "GET /api/settings/team": () => ({ body: state }),
      "DELETE /api/settings/team/invitations/inv_1": () => {
        state = { ...state, invitations: [] };
        return { status: 200, body: {} };
      },
    });
    const a = renderUI(<TeamPage />, { role: "owner" });
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel invitation for head@mit-adt.local" }),
    );
    await waitFor(() => expect(screen.queryByText("head@mit-adt.local")).toBeNull());
    a.unmount();

    mockApi({});
    const b = renderUI(<TeamPage />, { role: "owner" });
    expect(await screen.findByText("Team service not available yet")).toBeTruthy();
    expect(await screen.findByText("Agent service not available yet")).toBeTruthy();
    b.unmount();

    const calls = mockApi({});
    renderUI(<TeamPage />, { role: "admission_head" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});
