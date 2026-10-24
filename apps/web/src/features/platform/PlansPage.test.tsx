// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlansPage } from "@/features/platform/PlansPage";
import { planFixture, PLAN_ID } from "@/test/fixtures/platform";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

describe("/platform/plans (D6-I4-01)", () => {
  it("lists fee, included, overage (paise → ₹), seats and tenant count", async () => {
    mockApi({ "GET /api/platform/plans": () => ({ body: { items: [planFixture()] } }) });
    const { container } = renderUI(<PlansPage />, { role: "super_admin" });
    const row = (await screen.findByText("Starter")).closest("tr")!;
    for (const t of [
      "₹15,000",
      "2,000 min",
      "1,000 WhatsApp",
      "₹2.5/min",
      "₹0.8/message",
      "₹1.5/analysis",
      "10",
      "3",
    ])
      expect(within(row).getByText(t)).toBeTruthy();
    expectSmallScreenSafe(container);
  });

  it("edit: rupee inputs round-trip to exact paise in the PATCH; the row shows the server's plan", async () => {
    const calls = mockApi({
      "GET /api/platform/plans": () => ({ body: { items: [planFixture()] } }),
      [`PATCH /api/platform/plans/${PLAN_ID}`]: ({ body }) => ({
        body: { ...planFixture(), ...(body as object) },
      }),
    });
    renderUI(<PlansPage />, { role: "super_admin" });
    await userEvent.click(await screen.findByRole("button", { name: "Edit Starter" }));
    const sheet = await screen.findByRole("dialog");
    const minute = within(sheet).getByLabelText("Per extra call minute (₹)") as HTMLInputElement;
    expect(minute.value).toBe("2.50");
    await userEvent.clear(minute);
    await userEvent.type(minute, "2.75");
    await userEvent.clear(within(sheet).getByLabelText("Seat limit"));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({
      name: "Starter",
      billingMode: "prepaid",
      monthlyFeePaise: 1_500_000,
      includedMinutes: 2000,
      includedWhatsapp: 1000,
      overage: { callMinutePaise: 275, whatsappPaise: 80, analystRunPaise: 150 },
      seatLimit: null,
      isActive: true,
    });
    const row = screen.getByText("Starter").closest("tr")!;
    expect(within(row).getByText("₹2.75/min")).toBeTruthy();
    expect(within(row).getByText("Unlimited")).toBeTruthy();
  });

  it("new plan validates amounts and whole numbers before posting", async () => {
    const calls = mockApi({
      "GET /api/platform/plans": () => ({ body: { items: [planFixture()] } }),
    });
    renderUI(<PlansPage />, { role: "super_admin" });
    await userEvent.click(await screen.findByRole("button", { name: /New plan/ }));
    const sheet = await screen.findByRole("dialog");
    await userEvent.type(within(sheet).getByLabelText("Included call minutes"), "1.5");
    await userEvent.click(within(sheet).getByRole("button", { name: "Create plan" }));
    expect(within(sheet).getByText("Name the plan")).toBeTruthy();
    expect(within(sheet).getAllByText("Enter an amount, e.g. 2.50")).toHaveLength(4);
    expect(within(sheet).getAllByText("Enter a whole number").length).toBeGreaterThanOrEqual(2);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("states and roles", async () => {
    mockApi({});
    const a = renderUI(<PlansPage />, { role: "super_admin" });
    expect(await screen.findByText("Platform service not available yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /New plan/ })).toBeNull();
    a.unmount();
    mockApi({ "GET /api/platform/plans": () => ({ body: { items: [] } }) });
    const b = renderUI(<PlansPage />, { role: "super_admin" });
    expect(await screen.findByText("No plans yet")).toBeTruthy();
    b.unmount();
    const calls = mockApi({});
    renderUI(<PlansPage />, { role: "admin" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});
