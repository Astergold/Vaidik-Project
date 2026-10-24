// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BillingPage } from "@/features/billing/BillingPage";
import { walletFixture } from "@/test/fixtures/billing";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

const routes = (wallet = walletFixture()) => ({
  "GET /api/billing/wallet": () => ({ body: wallet }),
  "GET /api/billing/usage": () => ({
    body: { from: "2026-10-01", to: "2026-10-31", days: [], totals: [] },
  }),
  "GET /api/billing/statements": () => ({ body: { items: [] } }),
});

describe("/settings/billing wallet + ledger (D6-I4-03)", () => {
  it("balance from paise, no banners when healthy; ledger with signed amounts, balance after, reference", async () => {
    mockApi(routes());
    const { container } = renderUI(<BillingPage />, { role: "owner" });
    expect(
      within(await screen.findByRole("region", { name: "Wallet" })).getByText("₹12,500.5"),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    const ledger = screen.getByRole("region", { name: "Transactions" });
    const top = within(ledger).getByText("UTR123").closest("tr")!;
    expect(within(top).getByText("+₹10,000")).toBeTruthy();
    expect(within(top).getByText("by Laveric Admin")).toBeTruthy();
    const use = within(ledger).getByText("call_minute").closest("tr")!;
    expect(within(use).getByText("-₹25")).toBeTruthy();
    expectSmallScreenSafe(container);
  });

  it("zero balance → WALLET_EMPTY banner; below threshold → low-balance warning", async () => {
    mockApi(routes(walletFixture({ balancePaise: 0 })));
    const a = renderUI(<BillingPage />, { role: "owner" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("WALLET_EMPTY");
    expect(alert.textContent).toContain("calls and WhatsApp messages have stopped");
    a.unmount();

    mockApi(routes(walletFixture({ balancePaise: 150_000 })));
    renderUI(<BillingPage />, { role: "owner" });
    expect(await screen.findByText(/Low balance: below ₹2,000/)).toBeTruthy();
    expect(screen.queryByText(/WALLET_EMPTY/)).toBeNull();
  });

  it("postpaid: no balance or banners", async () => {
    mockApi(routes(walletFixture({ billingMode: "postpaid", balancePaise: null })));
    renderUI(<BillingPage />, { role: "admin" });
    expect(await screen.findByText("Monthly, with overage")).toBeTruthy();
    expect(screen.queryByText("Prepaid wallet balance")).toBeNull();
  });

  it("ledger pages with Load older", async () => {
    const calls = mockApi({
      ...routes(),
      "GET /api/billing/wallet": ({ query }) => ({
        body:
          query.get("cursor") === "p2"
            ? walletFixture({
                transactions: [
                  {
                    id: "01a14679-0000-7000-8000-000000000fa3",
                    at: "2026-09-30T05:00:00.000Z",
                    kind: "plan_fee",
                    amountPaise: -1_500_000,
                    balanceAfterPaise: 252_550,
                    reference: "2026-10",
                    createdBy: null,
                  },
                ],
              })
            : walletFixture({ nextCursor: "p2" }),
      }),
    });
    renderUI(<BillingPage />, { role: "owner" });
    await userEvent.click(await screen.findByRole("button", { name: /Load older/ }));
    expect(await screen.findByText("Plan fee")).toBeTruthy();
    expect(calls.some((c) => c.query.get("cursor") === "p2")).toBe(true);
  });

  it("states and roles", async () => {
    mockApi({});
    const a = renderUI(<BillingPage />, { role: "owner" });
    expect(
      (await screen.findAllByText("Billing service not available yet")).length,
    ).toBeGreaterThan(0);
    a.unmount();
    for (const role of ["admission_head", "counsellor", "super_admin"] as const) {
      const calls = mockApi({});
      const r = renderUI(<BillingPage />, { role });
      expect(screen.getByText("Not available for your role")).toBeTruthy();
      expect(calls).toHaveLength(0);
      r.unmount();
    }
  });
});
