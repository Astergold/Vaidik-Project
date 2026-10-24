// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { applicationsListResponse } from "@vernacular/contracts";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import { LeadApplicationsPanel } from "@/features/applications/LeadApplicationsPanel";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract.
const LEAD = "01a14679-0000-7000-8000-0000000000c1";
const list = applicationsListResponse.parse({
  nextCursor: null,
  total: 1,
  items: [
    {
      id: "01a14679-0000-7000-8000-0000000000e1",
      lead: { id: LEAD, name: "Asha Rao", phone: "+91******3210" },
      program: { id: "01a14679-0000-7000-8000-0000000000f1", name: "B.Des" },
      externalApplicationNo: "APP-12",
      status: "fee_paid",
      feeAmount: 125000,
      paidAt: "2026-10-01T20:00:00.000Z", // 2 Oct in Asia/Kolkata
      source: "portal",
      createdAt: "2026-09-20T05:00:00.000Z",
      updatedAt: "2026-10-01T20:00:00.000Z",
    },
  ],
});
const programs = { items: [] };

describe("ApplicationsPage (D5-I4-01)", () => {
  it("rows: lead link, application no., status chip, fee in ₹, paid date in tenant tz, source; phone as received", async () => {
    mockApi({
      "GET /api/applications": () => ({ body: list }),
      "GET /api/programs": () => ({ body: programs }),
    });
    renderUI(<ApplicationsPage search={{}} onSearch={() => {}} />, { role: "admission_head" });
    const row = (await screen.findByRole("link", { name: "Asha Rao" })).closest("tr")!;
    for (const text of ["APP-12", "B.Des", "Fee paid", "₹1,25,000", "Portal", "+91******3210"])
      expect(within(row).getByText(text)).toBeTruthy();
    expect(within(row).getAllByText("2 Oct")).toHaveLength(2); // paid on + updated, tenant timezone
    expect(screen.getByText("1 in total")).toBeTruthy();
  });

  it("who has paid in two clicks: the Fee paid chip sets paid=yes; that URL state sends feePaid=true", async () => {
    const onSearch = vi.fn();
    const calls = mockApi({
      "GET /api/applications": () => ({ body: list }),
      "GET /api/programs": () => ({ body: programs }),
    });
    const a = renderUI(<ApplicationsPage search={{}} onSearch={onSearch} />, {
      role: "admission_head",
    });
    await userEvent.click(screen.getByRole("button", { name: "Fee paid" }));
    expect(onSearch).toHaveBeenCalledWith({ paid: "yes" });
    a.unmount();

    renderUI(<ApplicationsPage search={{ paid: "yes" }} onSearch={onSearch} />, {
      role: "admission_head",
    });
    expect(screen.getByRole("button", { name: "Fee paid" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await waitFor(() =>
      expect(
        calls.some((c) => c.path === "/api/applications" && c.query.get("feePaid") === "true"),
      ).toBe(true),
    );
    expect(await screen.findByText("1 matching")).toBeTruthy();
  });

  it("states: loading, empty, filtered-empty with clear, error, not available", async () => {
    mockApi({ "GET /api/applications": () => new Promise(() => {}) });
    const a = renderUI(<ApplicationsPage search={{}} onSearch={() => {}} />, { role: "admin" });
    expect(screen.getByLabelText("Loading applications")).toBeTruthy();
    a.unmount();

    const empty = { items: [], nextCursor: null, total: 0 };
    mockApi({ "GET /api/applications": () => ({ body: empty }) });
    const b = renderUI(<ApplicationsPage search={{}} onSearch={() => {}} />, { role: "admin" });
    expect(await screen.findByText("No applications yet")).toBeTruthy();
    b.unmount();

    const onSearch = vi.fn();
    mockApi({ "GET /api/applications": () => ({ body: empty }) });
    const c = renderUI(<ApplicationsPage search={{ paid: "no" }} onSearch={onSearch} />, {
      role: "admin",
    });
    await userEvent.click(await screen.findByRole("button", { name: "Clear filters" }));
    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({ paid: undefined, status: undefined }),
    );
    c.unmount();

    mockApi({
      "GET /api/applications": () => ({
        status: 500,
        body: { error: { code: "INTERNAL", message: "Down" } },
      }),
    });
    const d = renderUI(<ApplicationsPage search={{}} onSearch={() => {}} />, { role: "admin" });
    expect(await screen.findByText("Couldn't load applications")).toBeTruthy();
    d.unmount();

    mockApi({});
    renderUI(<ApplicationsPage search={{}} onSearch={() => {}} />, { role: "admin" });
    expect(await screen.findByText("Applications service not available yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Programs unavailable" })).toBeTruthy();
    expect(document.querySelector("tbody")).toBeNull();
  });

  it("roles: counsellors get the role gate (and no request); only owner/admin see Import", async () => {
    const calls = mockApi({});
    const a = renderUI(<ApplicationsPage search={{}} onSearch={() => {}} />, {
      role: "counsellor",
    });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
    a.unmount();
    const b = renderUI(<ApplicationsPage search={{}} onSearch={() => {}} />, {
      role: "admission_head",
    });
    expect(screen.queryByRole("link", { name: /Import/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Unmatched/ })).toBeTruthy();
    b.unmount();
    renderUI(<ApplicationsPage search={{}} onSearch={() => {}} />, { role: "owner" });
    expect(screen.getByRole("link", { name: /Import/ })).toBeTruthy();
  });

  it("small-screen structure: table scrolls inside its container, no fixed widths", async () => {
    mockApi({
      "GET /api/applications": () => ({ body: list }),
      "GET /api/programs": () => ({ body: programs }),
    });
    const { container } = renderUI(<ApplicationsPage search={{}} onSearch={() => {}} />, {
      role: "admin",
    });
    await screen.findByRole("link", { name: "Asha Rao" });
    expectSmallScreenSafe(container);
    expect(container.firstElementChild!.className).toContain("min-w-0");
  });
});

describe("Lead 360 → Applications panel", () => {
  it("live data, empty, not available, error with retry", async () => {
    const calls = mockApi({ "GET /api/applications": () => ({ body: list }) });
    const a = renderUI(<LeadApplicationsPanel leadId={LEAD} />, { role: "counsellor" });
    const panel = await screen.findByRole("region", { name: "Applications" });
    expect(await within(panel).findByText("APP-12")).toBeTruthy();
    expect(within(panel).getByText("₹1,25,000")).toBeTruthy();
    expect(within(panel).getByText("2 Oct")).toBeTruthy();
    expect(calls[0]!.query.get("leadId")).toBe(LEAD);
    a.unmount();

    mockApi({
      "GET /api/applications": () => ({ body: { items: [], nextCursor: null, total: 0 } }),
    });
    const b = renderUI(<LeadApplicationsPanel leadId={LEAD} />);
    expect(await screen.findByText("No application received yet.")).toBeTruthy();
    b.unmount();

    mockApi({});
    const c = renderUI(<LeadApplicationsPanel leadId={LEAD} />);
    expect(await screen.findByText("Applications service not available yet.")).toBeTruthy();
    c.unmount();

    mockApi({
      "GET /api/applications": () => ({
        status: 503,
        body: { error: { code: "UNAVAILABLE", message: "Try later" } },
      }),
    });
    renderUI(<LeadApplicationsPanel leadId={LEAD} />);
    expect(await screen.findByText("Try later")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
