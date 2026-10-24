// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { performanceResponse } from "@vernacular/contracts";
import { addDays, todayIn } from "@/features/dashboard/dashboard-search";
import { PerformancePage, sortRows } from "@/features/reports/PerformancePage";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

const row = (n: number, over: object) => ({
  counsellor: { id: `01a14679-0000-7000-8000-00000000300${n}`, name: `Counsellor ${n}` },
  callsReviewed: 40,
  overrides: 10,
  queueResolved: 12,
  slaBreaches: 0,
  visitsBooked: 5,
  visitsAttended: 3,
  conversions: 2,
  medianResponseMinutes: 35,
  ...over,
});
const perf = performanceResponse.parse({
  from: "2026-09-18",
  to: "2026-10-17",
  rows: [
    row(1, { conversions: 1, slaBreaches: 3, medianResponseMinutes: null }),
    row(2, { conversions: 6, medianResponseMinutes: 90 }),
  ],
});

describe("/reports/performance (D6-I4-04d)", () => {
  it("ordering is presentational: higher-is-better desc, breaches/response asc, nulls last", () => {
    expect(sortRows(perf.rows, "conversions").map((r) => r.counsellor.name)).toEqual([
      "Counsellor 2",
      "Counsellor 1",
    ]);
    expect(sortRows(perf.rows, "slaBreaches")[0]!.counsellor.name).toBe("Counsellor 2");
    expect(sortRows(perf.rows, "medianResponseMinutes").at(-1)!.counsellor.name).toBe(
      "Counsellor 1",
    );
  });

  it("last 30 days by default (tenant tz); rows with override rate, breaches flagged, response time", async () => {
    const calls = mockApi({ "GET /api/reports/performance": () => ({ body: perf }) });
    const { container } = renderUI(<PerformancePage />, { role: "admission_head" });
    const r2 = (await screen.findByText("Counsellor 2")).closest("tr")!;
    expect(within(r2).getByText("25%")).toBeTruthy();
    expect(within(r2).getByText("1.5 h")).toBeTruthy();
    const r1 = screen.getByText("Counsellor 1").closest("tr")!;
    expect(within(r1).getByText("—")).toBeTruthy();
    const today = todayIn("Asia/Kolkata");
    expect(calls[0]!.query.get("from")).toBe(addDays(today, -29));
    expect(calls[0]!.query.get("to")).toBe(today);
    await userEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    await waitFor(() => expect(calls.at(-1)!.query.get("from")).toBe(addDays(today, -6)));
    expectSmallScreenSafe(container);
  });

  it("states and roles", async () => {
    mockApi({ "GET /api/reports/performance": () => ({ body: { ...perf, rows: [] } }) });
    const a = renderUI(<PerformancePage />, { role: "admin" });
    expect(await screen.findByText("No counsellor activity in this period")).toBeTruthy();
    a.unmount();
    mockApi({});
    const b = renderUI(<PerformancePage />, { role: "admin" });
    expect(await screen.findByText("Reports service not available yet")).toBeTruthy();
    b.unmount();
    const calls = mockApi({});
    renderUI(<PerformancePage />, { role: "counsellor" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});
