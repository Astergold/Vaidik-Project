// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { proposal, type Proposal } from "@vernacular/contracts";
import { PlannerPage } from "@/features/planner/PlannerPage";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

const P1 = "01a14679-0000-7000-8000-000000004aa1";
const P2 = "01a14679-0000-7000-8000-000000004aa2";
const P3 = "01a14679-0000-7000-8000-000000004aa3";
const mk = (id: string, over: Partial<Proposal> = {}): Proposal =>
  proposal.parse({
    id,
    lead: { id: "01a14679-0000-7000-8000-000000004ab1", name: "Asha Rao", phone: "+91******4321" },
    action: "callback",
    scheduledFor: "2026-10-18T05:30:00.000Z",
    rationale:
      "Said she will decide after the JEE result on 17 Oct; a callback after that is likely welcome.",
    status: "permitted",
    rejectCode: null,
    approval: "pending",
    decidedBy: null,
    decidedAt: null,
    effect: null,
    createdAt: "2026-10-17T00:00:00.000Z",
    ...over,
  });

/** A tiny stateful server for proposals. */
function server(initial: Proposal[]) {
  let items = initial;
  const decide = (id: string, approval: Proposal["approval"]) => {
    items = items.map((p) => (p.id === id ? { ...p, approval, decidedBy: "Head" } : p));
    return items.find((p) => p.id === id)!;
  };
  return {
    "GET /api/settings/planner": () => ({
      body: { mode: "approval", updatedAt: null, updatedBy: "Owner One" },
    }),
    "PUT /api/settings/planner": ({ body }: { body: unknown }) => ({
      body: { ...(body as object), updatedAt: null, updatedBy: "Owner One" },
    }),
    "GET /api/planner/proposals": ({ query }: { query: URLSearchParams }) => {
      const list =
        query.get("approval") === "pending" ? items.filter((p) => p.approval === "pending") : items;
      return {
        body: {
          items: list,
          nextCursor: null,
          pendingApproval: items.filter((p) => p.approval === "pending").length,
        },
      };
    },
    [`POST /api/planner/proposals/${P1}/approve`]: () => ({ body: decide(P1, "approved") }),
    [`POST /api/planner/proposals/${P2}/approve`]: () => ({ body: decide(P2, "approved") }),
    [`POST /api/planner/proposals/${P1}/reject`]: () => ({ body: decide(P1, "declined") }),
  };
}

describe("/ai/planner (D6-I4-04e)", () => {
  it("mode card; pending proposals with rationale; policy-blocked ones show the typed code + explanation", async () => {
    mockApi(
      server([
        mk(P1),
        mk(P3, { status: "rejected", rejectCode: "OUTSIDE_WINDOW", approval: "not_required" }),
      ]),
    );
    const { container } = renderUI(<PlannerPage />, { role: "admission_head" });
    expect(await screen.findByText("An admission head approves each action")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull(); // heads read the mode
    expect(await screen.findByText(/decide after the JEE result/)).toBeTruthy();
    expect(within(screen.getByRole("tab", { name: /Needs approval/ })).getByText("1")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "All proposals" }));
    expect(await screen.findByText("OUTSIDE_WINDOW")).toBeTruthy();
    expect(screen.getByText("Blocked by policy")).toBeTruthy();
    expectSmallScreenSafe(container);
  });

  it("bulk approve sends one request per proposal and the list refreshes from the server", async () => {
    const calls = mockApi(server([mk(P1), mk(P2)]));
    renderUI(<PlannerPage />, { role: "admission_head" });
    await screen.findAllByText(/decide after the JEE result/);
    await userEvent.click(screen.getByRole("checkbox", { name: /Select all 2 shown/ }));
    await userEvent.click(screen.getByRole("button", { name: "Approve 2" }));
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith("/approve"))).toHaveLength(2));
    expect(await screen.findByText("2 approved.")).toBeTruthy();
    expect(await screen.findByText("Nothing waiting for approval")).toBeTruthy();
  });

  it("reject needs a reason", async () => {
    const calls = mockApi(server([mk(P1)]));
    renderUI(<PlannerPage />, { role: "owner" });
    await userEvent.click(await screen.findByRole("button", { name: /Reject/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(within(dialog).getByText("Say why (it's recorded)")).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText("Reason"),
      "Parent asked not to call before Monday",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith("/reject"))?.body).toEqual({
        reason: "Parent asked not to call before Monday",
      }),
    );
  });

  it("owner/admin flip the mode; missing API states; counsellors gated", async () => {
    const calls = mockApi(server([]));
    const a = renderUI(<PlannerPage />, { role: "owner" });
    await userEvent.click(
      await screen.findByRole("switch", { name: "Require approval for planner actions" }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ mode: "auto" }),
    );
    expect(await screen.findByText("Actions run automatically")).toBeTruthy();
    a.unmount();

    mockApi({});
    const b = renderUI(<PlannerPage />, { role: "admin" });
    expect(await screen.findByText("Planner service not available yet")).toBeTruthy();
    expect(screen.getByText("The planner setting isn't available yet.")).toBeTruthy();
    b.unmount();

    const none = mockApi({});
    renderUI(<PlannerPage />, { role: "counsellor" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(none).toHaveLength(0);
  });
});
