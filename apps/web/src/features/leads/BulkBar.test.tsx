// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { bulkLeadsResult, leadsListResponse } from "@vernacular/contracts";
import { describeResult } from "@/features/leads/BulkBar";
import { LeadsPage } from "@/features/leads/LeadsPage";
import { validateLeadsSearch } from "@/features/leads/leads-search";
import { SessionContext, type Session } from "@/lib/session";
import type { ViewerRole } from "@/lib/sitemap";
import { ME, mockApi } from "@/test/utils";

// Fixtures parsed with the REAL leads contract (the list is live) and the proposed bulk contract.
const lead = (i: number) => ({
  id: `01a14679-0000-7000-8000-0000000020${String(i).padStart(2, "0")}`,
  person: {
    id: `01a14679-0000-7000-8000-0000000021${String(i).padStart(2, "0")}`,
    fullName: `Student ${i}`,
    phone: "+91******0000",
    city: null,
  },
  stage: "interested",
  subStage: null,
  temperature: "warm",
  nextStep: null,
  nextStepDueAt: null,
  owner: null,
  aiAgent: null,
  source: null,
  program: null,
  callCount: 0,
  lastCallAt: null,
  lastRejectCode: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});
const list = leadsListResponse.parse({
  page: 1,
  pageSize: 25,
  total: 214,
  items: [lead(1), lead(2), lead(3)],
});
const C1 = "01a14679-1cc4-7b7a-980d-5cec851fd541";
const filters = {
  sources: [],
  agents: [],
  counsellors: [{ id: C1, name: "Chitra", isActive: true }],
};

/** The real /leads/ route (LeadsPage reads its URL state), in a memory router. */
function renderLeads(role: ViewerRole, path = "/leads/?stage=interested") {
  const root = createRootRoute({ component: Outlet });
  const leads = createRoute({
    getParentRoute: () => root,
    path: "/leads/",
    validateSearch: validateLeadsSearch,
    component: LeadsPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([leads]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const session: Session = { status: "ready", source: "api", me: ME(role), viewerRole: role };
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={{ session, setDevRole: () => {}, signOut: async () => {} }}>
        <RouterProvider router={router} />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

const routes = (extra = {}) => ({
  "GET /api/leads": () => ({ body: list }),
  "GET /api/leads/filters": () => ({ body: filters }),
  "GET /api/saved-views": () => ({ body: { items: [] } }),
  ...extra,
});

describe("bulk actions on /leads (D6-I4-04b)", () => {
  it("result text from the server's numbers", () => {
    expect(
      describeResult(
        bulkLeadsResult.parse({
          action: "assign",
          affected: 198,
          skipped: [
            { leadId: lead(1).id, reason: "Not in your scope" },
            { leadId: lead(2).id, reason: "Not in your scope" },
          ],
          exportId: null,
        }),
      ),
    ).toBe("198 leads assigned; 2 skipped (Not in your scope).");
    expect(
      describeResult(
        bulkLeadsResult.parse({
          action: "export",
          affected: 3,
          skipped: [],
          exportId: "01a14679-0000-7000-8000-0000000022a1",
        }),
      ),
    ).toMatch(/Reports → Exports/);
  });

  it("select rows → assign posts the ids; the bar reports the server's result", async () => {
    const calls = mockApi(
      routes({
        "POST /api/leads/bulk": () => ({
          body: { action: "assign", affected: 2, skipped: [], exportId: null },
        }),
      }),
    );
    renderLeads("admission_head");
    await userEvent.click(
      (await screen.findAllByRole("checkbox", { name: "Select Student 1" }))[0]!,
    );
    await userEvent.click(screen.getAllByRole("checkbox", { name: "Select Student 3" })[0]!);
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(within(bar).getByText("2 selected")).toBeTruthy();
    await userEvent.click(within(bar).getByRole("button", { name: /Assign/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.selectOptions(await within(dialog).findByLabelText("Counsellor"), C1);
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply to 2 leads" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/api/leads/bulk")?.body).toEqual({
        action: "assign",
        target: { leadIds: [lead(1).id, lead(3).id] },
        counsellorId: C1,
      }),
    );
    expect(await screen.findByText("2 leads assigned.")).toBeTruthy();
  });

  it("select all matching → stage change requires a reason and targets the filter with the expected count", async () => {
    const calls = mockApi(
      routes({
        "POST /api/leads/bulk": () => ({
          body: { action: "stage", affected: 214, skipped: [], exportId: null },
        }),
      }),
    );
    renderLeads("admin");
    await userEvent.click(
      (await screen.findAllByRole("checkbox", { name: "Select all leads on this page" }))[0]!,
    );
    await userEvent.click(screen.getByRole("button", { name: "Select all 214 matching" }));
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(within(bar).getByText("214 selected")).toBeTruthy();
    await userEvent.click(within(bar).getByRole("button", { name: /Change stage/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply to 214 leads" }));
    expect(within(dialog).getByText("Say why (it's recorded on every lead)")).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Joined another college");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply to 214 leads" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/api/leads/bulk")?.body).toEqual({
        action: "stage",
        target: { filter: { stage: ["interested"] }, expectedCount: 214 },
        to: "lost",
        reason: "Joined another college",
      }),
    );
  });

  it("missing bulk API says so; counsellors get no checkboxes or bar", async () => {
    mockApi(routes());
    const a = renderLeads("owner");
    await userEvent.click(
      (await screen.findAllByRole("checkbox", { name: "Select Student 2" }))[0]!,
    );
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(await screen.findByText("Bulk actions aren't available yet.")).toBeTruthy();
    a.unmount();

    mockApi(routes());
    renderLeads("counsellor");
    expect((await screen.findAllByText("Student 1")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("region", { name: "Bulk actions" })).toBeNull();
  });
});
