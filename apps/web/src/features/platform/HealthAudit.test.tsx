// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { auditLogResponse, platformHealth } from "@vernacular/contracts";
import { AuditLogPage } from "@/features/platform/AuditLogPage";
import { ageSince, HealthPage } from "@/features/platform/HealthPage";
import { tenantFixture, TENANT_ID } from "@/test/fixtures/platform";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

const T = { id: TENANT_ID, name: "Demo College" };
const health = platformHealth.parse({
  generatedAt: "2026-10-17T06:00:00.000Z",
  queues: [
    {
      name: "call.dial",
      queued: 12,
      active: 3,
      failed24h: 0,
      oldestQueuedAt: "2026-10-17T05:57:00.000Z",
    },
    { name: "webhook.deliver", queued: 0, active: 0, failed24h: 4, oldestQueuedAt: null },
  ],
  syncHealth: [
    { tenant: T, date: "2026-10-16", engineRuns: 120, crmAttempts: 120 },
    {
      tenant: { id: "01a14679-0000-7000-8000-0000000007a2", name: "MIT-ADT" },
      date: "2026-10-16",
      engineRuns: 300,
      crmAttempts: 298,
    },
  ],
  recentErrors: [
    {
      id: "j1",
      queue: "webhook.deliver",
      tenant: T,
      message: "Receiver answered 500",
      attempts: 5,
      failedAt: "2026-10-17T05:30:00.000Z",
    },
  ],
});
const audit = auditLogResponse.parse({
  nextCursor: null,
  items: [
    {
      id: "01a14679-0000-7000-8000-0000000008a1",
      at: "2026-10-17T05:00:00.000Z",
      tenant: T,
      actor: { id: "01a14679-0000-7000-8000-0000000008b1", name: "Owner One" },
      impersonator: { id: "01a14679-0000-7000-8000-0000000008c1", name: "Laveric Admin" },
      action: "policy.update",
      entity: "tenant_policy",
      entityId: null,
      diff: { maxAttemptsPerDay: [3, 4] },
      ip: "203.0.113.9",
    },
  ],
});

describe("/platform/health (D6-I4-01)", () => {
  it("queues (failed highlighted, age vs server time), sync parity with difference, recent errors", async () => {
    mockApi({ "GET /api/platform/health": () => ({ body: health }) });
    const { container } = renderUI(<HealthPage />, { role: "super_admin" });
    const dial = (await screen.findByText("call.dial")).closest("tr")!;
    expect(within(dial).getByText("3 min")).toBeTruthy();
    expect(screen.getByText("1 mismatched")).toBeTruthy();
    const mit = screen.getByText("MIT-ADT").closest("tr")!;
    expect(within(mit).getByText("-2")).toBeTruthy();
    expect(screen.getByText("Receiver answered 500")).toBeTruthy();
    expect(screen.getByText(/Updated 17 Oct, 11:30 am/)).toBeTruthy();
    expectSmallScreenSafe(container);
  });

  it("clean state + age helper", async () => {
    mockApi({
      "GET /api/platform/health": () => ({
        body: { ...health, syncHealth: [health.syncHealth[0]], recentErrors: [] },
      }),
    });
    renderUI(<HealthPage />, { role: "super_admin" });
    expect(await screen.findByText("All matching")).toBeTruthy();
    expect(screen.getByText("No failed jobs recently.")).toBeTruthy();
    expect(ageSince("2026-10-17T00:00:00Z", "2026-10-17T05:00:00Z")).toBe("5 h");
    expect(ageSince("2026-10-10T00:00:00Z", "2026-10-17T00:00:00Z")).toBe("7 d");
  });

  it("not available; other roles gated", async () => {
    mockApi({});
    const a = renderUI(<HealthPage />, { role: "super_admin" });
    expect(await screen.findByText("Platform service not available yet")).toBeTruthy();
    a.unmount();
    const calls = mockApi({});
    renderUI(<HealthPage />, { role: "owner" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});

describe("/platform/audit-log (D6-I4-01)", () => {
  it("entries show both people for impersonated actions and the JSON diff; filters go to the server", async () => {
    const calls = mockApi({
      "GET /api/admin/audit-log": () => ({ body: audit }),
      "GET /api/platform/tenants": () => ({ body: { items: [tenantFixture()] } }),
    });
    renderUI(<AuditLogPage />, { role: "super_admin" });
    const entry = (await screen.findByText("policy.update")).closest("li")!;
    expect(within(entry).getByText("Impersonated")).toBeTruthy();
    expect(within(entry).getByText(/by Owner One \(impersonated by Laveric Admin\)/)).toBeTruthy();
    expect(within(entry).getByText(/"maxAttemptsPerDay"/)).toBeTruthy();

    await userEvent.selectOptions(await screen.findByRole("combobox"), TENANT_ID);
    await waitFor(() =>
      expect(
        calls
          .filter((c) => c.path === "/api/admin/audit-log")
          .at(-1)!
          .query.get("tenantId"),
      ).toBe(TENANT_ID),
    );
    await userEvent.type(screen.getByLabelText("Search the audit log"), "policy{Enter}");
    await waitFor(() =>
      expect(
        calls
          .filter((c) => c.path === "/api/admin/audit-log")
          .at(-1)!
          .query.get("q"),
      ).toBe("policy"),
    );
  });

  it("empty and not available", async () => {
    mockApi({ "GET /api/admin/audit-log": () => ({ body: { items: [], nextCursor: null } }) });
    const a = renderUI(<AuditLogPage />, { role: "super_admin" });
    expect(await screen.findByText("No entries")).toBeTruthy();
    expect(screen.getByText("All tenants (list unavailable)")).toBeTruthy();
    a.unmount();
    mockApi({});
    renderUI(<AuditLogPage />, { role: "super_admin" });
    expect(await screen.findByText("Platform service not available yet")).toBeTruthy();
  });
});
