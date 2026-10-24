// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { complianceReport } from "@vernacular/contracts";
import { addDays, todayIn } from "@/features/dashboard/dashboard-search";
import { CompliancePage } from "@/features/planner/CompliancePage";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

const report = (violations: object[]) =>
  complianceReport.parse({
    date: "2026-10-16",
    generatedAt: "2026-10-17T21:30:00.000Z",
    checkedCalls: 412,
    violations,
  });
const v = {
  id: "01a14679-0000-7000-8000-000000004ba1",
  kind: "outside_window",
  callId: "01a14679-0000-7000-8000-000000004bb1",
  lead: { id: "01a14679-0000-7000-8000-000000004bc1", name: "Ravi Kumar" },
  occurredAt: "2026-10-16T15:44:00.000Z",
  detail: "Called at 21:14, window ends 21:00",
};

describe("/ai/compliance (D6-I4-04e)", () => {
  it("clean night → green '0 violations' with calls checked; asks for yesterday (tenant tz) by default", async () => {
    const calls = mockApi({ "GET /api/admin/compliance-report": () => ({ body: report([]) }) });
    renderUI(<CompliancePage />, { role: "owner" });
    expect(await screen.findByText("0 violations")).toBeTruthy();
    expect(screen.getByText(/412 calls checked for 16 Oct 2026/)).toBeTruthy();
    expect(calls[0]!.query.get("date")).toBe(addDays(todayIn("Asia/Kolkata"), -1));
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("violations: count per rule and a row per violation with the server's detail; another night re-queries", async () => {
    const calls = mockApi({
      "GET /api/admin/compliance-report": () => ({
        body: report([
          v,
          {
            ...v,
            id: "01a14679-0000-7000-8000-000000004ba2",
            kind: "suppressed",
            detail: "Number opted out on 12 Oct",
          },
        ]),
      }),
    });
    const { container } = renderUI(<CompliancePage />, { role: "admission_head" });
    expect(await screen.findByText("2 violations")).toBeTruthy();
    const byRule = screen.getByRole("list", { name: "By rule" });
    expect(within(byRule).getByText(/Outside calling hours/).textContent).toContain("1");
    expect(within(byRule).getByText(/No consent/).textContent).toContain("0");
    const row = screen.getByText("Called at 21:14, window ends 21:00").closest("tr")!;
    expect(within(row).getByRole("link", { name: "Ravi Kumar" })).toBeTruthy();
    expect(within(row).getByText("16 Oct, 9:14 pm")).toBeTruthy();
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-10-10" } });
    await waitFor(() => expect(calls.some((c) => c.query.get("date") === "2026-10-10")).toBe(true));
    expectSmallScreenSafe(container);
  });

  it("not available; counsellors gated", async () => {
    mockApi({});
    const a = renderUI(<CompliancePage />, { role: "admin" });
    expect(await screen.findByText("Compliance report service not available yet")).toBeTruthy();
    a.unmount();
    const calls = mockApi({});
    renderUI(<CompliancePage />, { role: "counsellor" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});
