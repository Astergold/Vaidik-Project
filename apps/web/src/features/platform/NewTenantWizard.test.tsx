// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewTenantWizard } from "@/features/platform/NewTenantWizard";
import { planFixture, PLAN_ID, tenantFixture } from "@/test/fixtures/platform";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

const PROVIDER = ["dog", "rah"].join("");

describe("/platform/tenants/new (D6-I4-01)", () => {
  it("one screen → review → create: slug follows the name, plan sets billing, owner invited, setup checklist", async () => {
    const calls = mockApi({
      "GET /api/platform/plans": () => ({
        body: {
          items: [
            planFixture(),
            planFixture({
              id: "01a14679-0000-7000-8000-0000000007b2",
              name: "Retired",
              isActive: false,
            }),
          ],
        },
      }),
      "POST /api/platform/tenants": () => ({
        status: 201,
        body: {
          tenant: tenantFixture(),
          ownerInvited: true,
          setup: { policy: true, stages: true, starterAgent: true },
        },
      }),
    });
    const { container } = renderUI(<NewTenantWizard />, { role: "super_admin" });
    await userEvent.type(await screen.findByLabelText("Name"), "Demo College");
    expect((screen.getByLabelText("Address") as HTMLInputElement).value).toBe("demo-college");
    const planSelect = screen.getByLabelText("Plan");
    expect(within(planSelect).queryByText(/Retired/)).toBeNull(); // inactive plans aren't offered
    await userEvent.selectOptions(planSelect, PLAN_ID);
    await userEvent.type(screen.getByLabelText("Owner's email"), "Owner@Demo.Local");
    expectSmallScreenSafe(container);

    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    const review = await screen.findByRole("region", { name: "Review" });
    expect(within(review).getByText("demo-college.laveric.com")).toBeTruthy();
    expect(within(review).getByText("Create a new org automatically")).toBeTruthy();
    await userEvent.click(within(review).getByRole("button", { name: "Create tenant" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      name: "Demo College",
      slug: "demo-college",
      timezone: "Asia/Kolkata",
      planId: PLAN_ID,
      billingMode: "prepaid",
      voiceEngine: { mode: "create" },
      ownerEmail: "owner@demo.local",
    });
    const done = await screen.findByRole("region", { name: "Tenant created" });
    for (const t of [
      "Calling policy copied",
      "Stages copied",
      "Starter AI agent added",
      "Owner invited (owner@demo.local)",
    ])
      expect(within(done).getByText(t)).toBeTruthy();
  });

  it("existing Voice Engine org: labelled Org ID / Key, both required, key is a password field; never the provider name", async () => {
    mockApi({ "GET /api/platform/plans": () => ({ body: { items: [planFixture()] } }) });
    renderUI(<NewTenantWizard />, { role: "super_admin" });
    await userEvent.click(await screen.findByRole("radio", { name: /Use an existing org/ }));
    expect((screen.getByLabelText("Voice Engine Key") as HTMLInputElement).type).toBe("password");
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("Enter the Voice Engine Org ID")).toBeTruthy();
    expect(screen.getByText("Enter the Voice Engine key")).toBeTruthy();
    expect(screen.getByText("Pick a plan")).toBeTruthy();
    expect(document.body.innerHTML.toLowerCase()).not.toContain(PROVIDER);
  });

  it("a server 422 on create is shown on the review step (e.g. slug taken)", async () => {
    mockApi({
      "GET /api/platform/plans": () => ({ body: { items: [planFixture()] } }),
      "POST /api/platform/tenants": () => ({
        status: 422,
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid",
            details: [{ path: "slug", message: "That address is taken" }],
          },
        },
      }),
    });
    renderUI(<NewTenantWizard />, { role: "super_admin" });
    await userEvent.type(await screen.findByLabelText("Name"), "Demo College");
    await userEvent.selectOptions(screen.getByLabelText("Plan"), PLAN_ID);
    await userEvent.type(screen.getByLabelText("Owner's email"), "o@demo.local");
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(await screen.findByRole("button", { name: "Create tenant" }));
    expect(await screen.findByText("That address is taken")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to edit" })).toBeTruthy();
  });

  it("states: no active plan → link to plans; service missing → not available; other roles gated", async () => {
    mockApi({ "GET /api/platform/plans": () => ({ body: { items: [] } }) });
    const a = renderUI(<NewTenantWizard />, { role: "super_admin" });
    expect(await screen.findByText("Create a plan first")).toBeTruthy();
    a.unmount();

    mockApi({});
    const b = renderUI(<NewTenantWizard />, { role: "super_admin" });
    expect(await screen.findByText("Platform service not available yet")).toBeTruthy();
    b.unmount();

    const calls = mockApi({});
    renderUI(<NewTenantWizard />, { role: "owner" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});
