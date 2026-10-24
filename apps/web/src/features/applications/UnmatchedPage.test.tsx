// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { leadsListResponse, unmatchedListResponse } from "@vernacular/contracts";
import { UnmatchedPage } from "@/features/applications/UnmatchedPage";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract (unmatched) and the real one (leads).
const ROW = "01a14679-0000-7000-8000-0000000000b1";
const LEAD = "01a14679-0000-7000-8000-0000000000c1";
const unmatched = unmatchedListResponse.parse({
  nextCursor: null,
  total: 1,
  items: [
    {
      id: ROW,
      externalApplicationNo: "APP-77",
      fullName: "Ravi Kumar",
      phone: "+91******4321",
      email: null,
      program: "B.Des",
      status: "fee_paid",
      feeAmount: 50000,
      paidAt: "2026-10-01T05:00:00.000Z",
      source: "csv",
      receivedAt: "2026-10-02T05:00:00.000Z",
      reason: "no_match",
    },
  ],
});
const leads = leadsListResponse.parse({
  page: 1,
  pageSize: 10,
  total: 1,
  items: [
    {
      id: LEAD,
      person: {
        id: "01a14679-0000-7000-8000-0000000000d1",
        fullName: "Ravi K.",
        phone: "+91******4321",
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
      callCount: 2,
      lastCallAt: null,
      lastRejectCode: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    },
  ],
});

describe("UnmatchedPage (D5-I4-01)", () => {
  it("states: loading, nothing to review, not available", async () => {
    mockApi({ "GET /api/applications/unmatched": () => new Promise(() => {}) });
    const a = renderUI(<UnmatchedPage />, { role: "admission_head" });
    expect(screen.getByLabelText("Loading unmatched applications")).toBeTruthy();
    a.unmount();

    mockApi({
      "GET /api/applications/unmatched": () => ({
        body: { items: [], nextCursor: null, total: 0 },
      }),
    });
    const b = renderUI(<UnmatchedPage />, { role: "admission_head" });
    expect(await screen.findByText("Nothing to review")).toBeTruthy();
    b.unmount();

    mockApi({});
    renderUI(<UnmatchedPage />, { role: "admission_head" });
    expect(await screen.findByText("Applications service not available yet")).toBeTruthy();
  });

  it("link: searches real leads (by the row's phone digits), posts the picked id, row leaves after the server confirms", async () => {
    const calls = mockApi({
      "GET /api/applications/unmatched": () => ({ body: unmatched }),
      "GET /api/leads": () => ({ body: leads }),
      [`POST /api/applications/${ROW}/link`]: () => ({
        body: {
          id: ROW,
          lead: { id: LEAD, name: "Ravi K.", phone: "+91******4321" },
          program: null,
          externalApplicationNo: "APP-77",
          status: "fee_paid",
          feeAmount: 50000,
          paidAt: "2026-10-01T05:00:00.000Z",
          source: "csv",
          createdAt: "2026-10-02T05:00:00.000Z",
          updatedAt: "2026-10-17T05:00:00.000Z",
        },
      }),
    });
    renderUI(<UnmatchedPage />, { role: "admin" });
    const card = await screen.findByRole("article", { name: "Ravi Kumar" });
    expect(within(card).getByText("+91******4321")).toBeTruthy(); // rendered as received
    await userEvent.click(within(card).getByRole("button", { name: /Link to lead/ }));
    expect((screen.getByLabelText("Search leads") as HTMLInputElement).value).toBe("4321");
    await userEvent.click(await screen.findByRole("button", { name: /Ravi K\./ }));
    await userEvent.click(screen.getByRole("button", { name: "Link application" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith("/link"))?.body).toEqual({ leadId: LEAD }),
    );
    expect(calls.find((c) => c.path === "/api/leads")!.query.get("q")).toBe("4321");
    expect(await screen.findByText("Nothing to review")).toBeTruthy();
  });

  it("dismiss: optional reason; a server error keeps the row and shows the message", async () => {
    const calls = mockApi({
      "GET /api/applications/unmatched": () => ({ body: unmatched }),
      [`POST /api/applications/${ROW}/dismiss`]: () => ({
        status: 409,
        body: { error: { code: "ALREADY_LINKED", message: "Already linked to a lead" } },
      }),
    });
    renderUI(<UnmatchedPage />, { role: "admin" });
    const card = await screen.findByRole("article", { name: "Ravi Kumar" });
    await userEvent.click(within(card).getByRole("button", { name: /Dismiss/ }));
    await userEvent.type(within(card).getByLabelText(/Why dismiss/), "Test entry");
    await userEvent.click(within(card).getByRole("button", { name: "Dismiss row" }));
    expect(await within(card).findByText("Already linked to a lead")).toBeTruthy();
    expect(calls.find((c) => c.path.endsWith("/dismiss"))!.body).toEqual({ reason: "Test entry" });
    expect(screen.getByRole("article", { name: "Ravi Kumar" })).toBeTruthy();
  });
});
