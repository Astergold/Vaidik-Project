// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TenantsPage } from "@/features/platform/TenantsPage";
import { tenantFixture, TENANT_ID } from "@/test/fixtures/platform";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

const PROVIDER = ["dog", "rah"].join("");
const list = (items = [tenantFixture()]) => ({ body: { items } });

describe("/platform/tenants (D6-I4-01)", () => {
  it("rows: status, plan + billing mode, usage, wallet in ₹ from paise, owner; Voice Engine wording only", async () => {
    mockApi({
      "GET /api/platform/tenants": () =>
        list([
          tenantFixture(),
          tenantFixture({
            id: "01a14679-0000-7000-8000-0000000007a2",
            name: "Old Institute",
            slug: "old",
            status: "suspended",
            suspendedReason: "Unpaid invoice",
            voiceEngineConnected: false,
            billingMode: "postpaid",
            walletBalancePaise: null,
          }),
        ]),
    });
    const { container } = renderUI(<TenantsPage />, { role: "super_admin" });
    const row = (await screen.findByText("Demo College")).closest("tr")!;
    for (const t of [
      "active",
      "Starter",
      "1,235 min",
      "560 WhatsApp",
      "₹12,500.5",
      "owner@demo.local",
    ])
      expect(within(row).getByText(t)).toBeTruthy();
    const old = screen.getByText("Old Institute").closest("tr")!;
    expect(within(old).getByText("Unpaid invoice")).toBeTruthy();
    expect(within(old).getByText("Voice Engine not connected")).toBeTruthy();
    expect(within(old).getByText("Postpaid")).toBeTruthy();
    expect(document.body.innerHTML.toLowerCase()).not.toContain(PROVIDER);
    expectSmallScreenSafe(container);
  });

  it("filters go to the server: status chip and search", async () => {
    const calls = mockApi({ "GET /api/platform/tenants": () => list() });
    renderUI(<TenantsPage />, { role: "super_admin" });
    await screen.findByText("Demo College");
    await userEvent.click(screen.getByRole("button", { name: "Suspended" }));
    await waitFor(() => expect(calls.at(-1)!.query.get("status")).toBe("suspended"));
    await userEvent.type(screen.getByLabelText("Search tenants"), "demo{Enter}");
    await waitFor(() => expect(calls.at(-1)!.query.get("q")).toBe("demo"));
  });

  it("suspend needs a reason and shows the server's tenant afterwards", async () => {
    const calls = mockApi({
      "GET /api/platform/tenants": () => list(),
      [`POST /api/platform/tenants/${TENANT_ID}/suspend`]: () => ({
        body: tenantFixture({ status: "suspended", suspendedReason: "Contract ended" }),
      }),
    });
    renderUI(<TenantsPage />, { role: "super_admin" });
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Demo College" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Suspend" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Suspend tenant" }));
    expect(within(dialog).getByText("Say why (it's audit-logged)")).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText("Reason"), "Contract ended");
    await userEvent.click(within(dialog).getByRole("button", { name: "Suspend tenant" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ reason: "Contract ended" });
    expect(screen.getByText("Contract ended")).toBeTruthy();
    expect(screen.getByText("suspended")).toBeTruthy();
  });

  it("top up converts typed rupees to exact paise and requires a reference", async () => {
    const calls = mockApi({
      "GET /api/platform/tenants": () => list(),
      [`POST /api/platform/tenants/${TENANT_ID}/top-up`]: () => ({
        body: tenantFixture({ walletBalancePaise: 1_500_100 }),
      }),
    });
    renderUI(<TenantsPage />, { role: "super_admin" });
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Demo College" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Top up wallet" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Amount (₹)"), "2,500.50");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add to wallet" }));
    expect(within(dialog).getByText("Add a payment reference")).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText("Payment reference"), "UTR123");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add to wallet" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      amountPaise: 250050,
      reference: "UTR123",
    });
    expect(screen.getByText("₹15,001")).toBeTruthy();
  });

  it("states: loading, empty, not available; super-admin only (no request for others)", async () => {
    mockApi({ "GET /api/platform/tenants": () => new Promise(() => {}) });
    const a = renderUI(<TenantsPage />, { role: "super_admin" });
    expect(screen.getByLabelText("Loading tenants")).toBeTruthy();
    a.unmount();

    mockApi({ "GET /api/platform/tenants": () => list([]) });
    const b = renderUI(<TenantsPage />, { role: "super_admin" });
    expect(await screen.findByText("No tenants yet")).toBeTruthy();
    b.unmount();

    mockApi({});
    const c = renderUI(<TenantsPage />, { role: "super_admin" });
    expect(await screen.findByText("Platform service not available yet")).toBeTruthy();
    c.unmount();

    for (const role of ["owner", "admin", "admission_head", "counsellor"] as const) {
      const calls = mockApi({});
      const r = renderUI(<TenantsPage />, { role });
      expect(screen.getByText("Not available for your role")).toBeTruthy();
      expect(calls).toHaveLength(0);
      r.unmount();
    }
  });
});
