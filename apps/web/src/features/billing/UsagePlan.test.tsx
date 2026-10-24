// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usageResponse } from "@vernacular/contracts";
import { BillingPage } from "@/features/billing/BillingPage";
import { monthStart } from "@/features/billing/usage";
import { addDays, todayIn } from "@/features/dashboard/dashboard-search";
import { walletFixture } from "@/test/fixtures/billing";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

const usage = usageResponse.parse({
  from: "2026-10-01",
  to: "2026-10-17",
  days: [
    { date: "2026-10-16", kind: "call_minute", quantity: 95.5, amountPaise: 23_875 },
    { date: "2026-10-16", kind: "whatsapp", quantity: 40, amountPaise: 3_200 },
    { date: "2026-10-15", kind: "analyst_run", quantity: 12, amountPaise: 1_800 },
  ],
  totals: [
    { kind: "call_minute", quantity: 95.5, amountPaise: 23_875 },
    { kind: "whatsapp", quantity: 40, amountPaise: 3_200 },
    { kind: "analyst_run", quantity: 12, amountPaise: 1_800 },
  ],
});
const routes = (u = usage) => ({
  "GET /api/billing/wallet": () => ({ body: walletFixture() }),
  "GET /api/billing/usage": () => ({ body: u }),
  "GET /api/billing/statements": () => ({ body: { items: [] } }),
});

describe("/settings/billing plan + usage (D6-I4-03)", () => {
  it("plan: fee, included vs used with overage highlighted, overage rates", async () => {
    mockApi(routes());
    renderUI(<BillingPage />, { role: "owner" });
    const plan = await screen.findByRole("region", { name: "Plan" });
    expect(within(plan).getByText("Starter")).toBeTruthy();
    expect(within(plan).getByText("1,500 of 2,000 min")).toBeTruthy();
    expect(within(plan).getByText("1,200 of 1,000 msgs · 200 over")).toBeTruthy();
    expect(within(plan).getByText(/₹2.5\/min · ₹0.8\/message · ₹1.5\/analysis/)).toBeTruthy();
  });

  it("usage: this month by default (tenant tz), totals per kind incl. zero ones, per-day table; total = sum of the server's rows", async () => {
    const calls = mockApi(routes());
    const { container } = renderUI(<BillingPage />, { role: "owner" });
    const today = todayIn("Asia/Kolkata");
    await waitFor(() => expect(calls.some((c) => c.path === "/api/billing/usage")).toBe(true));
    const req = calls.find((c) => c.path === "/api/billing/usage")!;
    expect([req.query.get("from"), req.query.get("to")]).toEqual([monthStart(today), today]);
    const totals = await screen.findByRole("region", { name: "Totals" });
    expect(within(totals).getByText("95.5 min · ₹238.75")).toBeTruthy();
    expect(within(totals).getByText("0 msgs · ₹0")).toBeTruthy(); // SMS, zero-filled
    expect(screen.getByText(/₹288.75 in total/)).toBeTruthy();
    const row = screen.getByText("16 Oct").closest("tr")!;
    expect(within(row).getByText("₹270.75")).toBeTruthy();
    expectSmallScreenSafe(container);
  });

  it("Last 30 days asks the server for that range; empty period has its own state", async () => {
    const calls = mockApi(routes({ ...usage, days: [], totals: [] }));
    renderUI(<BillingPage />, { role: "admin" });
    expect(await screen.findByText("No usage in this period")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Last 30 days" }));
    const today = todayIn("Asia/Kolkata");
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.path === "/api/billing/usage" && c.query.get("from") === addDays(today, -29),
        ),
      ).toBe(true),
    );
  });
});
