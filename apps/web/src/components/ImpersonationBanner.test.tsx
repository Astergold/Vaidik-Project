// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatCountdown, ImpersonationBanner } from "@/components/ImpersonationBanner";
import { TenantsPage } from "@/features/platform/TenantsPage";
import { hardNavigate } from "@/lib/navigation";
import { tenantFixture, TENANT_ID } from "@/test/fixtures/platform";
import { mockApi, renderUI } from "@/test/utils";

vi.mock("@/lib/navigation", () => ({ hardNavigate: vi.fn() }));

const ADMIN = "01a14679-0000-7000-8000-0000000008c1";
const session = (expiresInMs: number) => ({
  session: {
    tenant: { id: TENANT_ID, name: "Demo College" },
    user: {
      id: "01a14679-0000-7000-8000-0000000008b1",
      name: "Owner One",
      email: "owner@demo.local",
    },
    reason: "Ticket #142",
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  },
});

describe("impersonation banner (D6-I4-01)", () => {
  beforeEach(() => vi.mocked(hardNavigate).mockClear());

  it("hidden unless /api/me says we're impersonating (and makes no request)", () => {
    const calls = mockApi({});
    const { container } = renderUI(<ImpersonationBanner />, { role: "owner" });
    expect(container.innerHTML).toBe("");
    expect(calls).toHaveLength(0);
  });

  it("shows who, which tenant, the reason and a countdown from the server's expiresAt; Exit ends it with a full reload", async () => {
    const calls = mockApi({
      "GET /api/platform/impersonate": () => ({ body: session(30 * 60_000) }),
      "DELETE /api/platform/impersonate": () => ({ status: 200, body: {} }),
    });
    renderUI(<ImpersonationBanner />, { role: "owner", impersonatedBy: ADMIN });
    const banner = await screen.findByRole("region", { name: "Impersonation" });
    expect(await within(banner).findByText("Acting as Owner One · Demo College")).toBeTruthy();
    expect(within(banner).getByText(/reason: Ticket #142/)).toBeTruthy();
    expect(within(banner).getByText(/^Ends in (29:5\d|30:00)$/)).toBeTruthy();
    await userEvent.click(within(banner).getByRole("button", { name: /Exit impersonation/ }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/platform/tenants"));
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("expired → says so and offers a reload; missing details route → still shows the banner and Exit", async () => {
    mockApi({ "GET /api/platform/impersonate": () => ({ body: session(-1000) }) });
    const a = renderUI(<ImpersonationBanner />, { role: "owner", impersonatedBy: ADMIN });
    expect(await screen.findByText("Expired")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(hardNavigate).toHaveBeenCalledWith("/");
    a.unmount();

    mockApi({});
    renderUI(<ImpersonationBanner />, { role: "owner", impersonatedBy: ADMIN });
    expect(await screen.findByText(/session details aren't available yet/)).toBeTruthy();
    expect(screen.getByText("Acting as Chitra Counsellor · MIT-ADT University")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Exit impersonation/ })).toBeTruthy();
  });

  it("countdown format", () => {
    expect(formatCountdown(30 * 60_000)).toBe("30:00");
    expect(formatCountdown(65_400)).toBe("1:05");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

describe("start impersonating from /platform/tenants", () => {
  beforeEach(() => vi.mocked(hardNavigate).mockClear());

  it("asks for a reason, posts tenantId + reason, then reloads into the tenant", async () => {
    const calls = mockApi({
      "GET /api/platform/tenants": () => ({ body: { items: [tenantFixture()] } }),
      "POST /api/platform/impersonate": () => ({ body: session(30 * 60_000).session }),
    });
    renderUI(<TenantsPage />, { role: "super_admin" });
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Demo College" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Impersonate owner" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/owner@demo.local for up to 30 minutes/)).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText("Reason"), "no");
    await userEvent.click(within(dialog).getByRole("button", { name: "Start impersonating" }));
    expect(within(dialog).getByText(/at least 5 characters/)).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText("Reason"), "pe, ticket #142");
    await userEvent.click(within(dialog).getByRole("button", { name: "Start impersonating" }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/"));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      tenantId: TENANT_ID,
      reason: "nope, ticket #142",
    });
  });

  it("suspended tenants can't be impersonated", async () => {
    mockApi({
      "GET /api/platform/tenants": () => ({
        body: { items: [tenantFixture({ status: "suspended", suspendedReason: "x" })] },
      }),
    });
    renderUI(<TenantsPage />, { role: "super_admin" });
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Demo College" }));
    expect(await screen.findByRole("menuitem", { name: "Activate" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Impersonate owner" })).toBeNull();
  });
});
