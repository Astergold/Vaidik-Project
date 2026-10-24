import { describe, expect, it } from "vitest";
import { dashboardQuery } from "@vernacular/contracts";
import {
  activePreset,
  addDays,
  formatDateKey,
  formatPercent,
  formatRange,
  presetRange,
  share,
  toDashboardQuery,
  todayIn,
  validateDashboardSearch,
} from "@/features/dashboard/dashboard-search";
import { toQueryString } from "@/lib/api";
import { formatMinSec } from "@/lib/labels";

// 2026-10-16 20:00 UTC is already 17 Oct in Kolkata (UTC+5:30).
const now = new Date("2026-10-16T20:00:00Z");
const SRC = "01a14679-1d11-775e-86f3-891dd1d80a60";
const AGENT = "01a14679-1d0e-7a18-bf77-11f3cd23feba";

describe("dashboard range → query (D3-I4-02)", () => {
  it("today is the tenant's local date, not UTC", () => {
    expect(todayIn("Asia/Kolkata", now)).toBe("2026-10-17");
    expect(todayIn("UTC", now)).toBe("2026-10-16");
  });

  it("presets include today, like the API default (from = to - 29 for 30 days)", () => {
    expect(presetRange(30, "Asia/Kolkata", now)).toEqual({ from: "2026-09-18", to: "2026-10-17" });
    expect(presetRange(7, "Asia/Kolkata", now)).toEqual({ from: "2026-10-11", to: "2026-10-17" });
  });

  it("sends from/to as YYYY-MM-DD plus the filters, and the API contract accepts it", () => {
    const q = toDashboardQuery({
      ...presetRange(7, "Asia/Kolkata", now),
      sourceId: SRC,
      agentId: AGENT,
    });
    expect(toQueryString(q)).toBe(
      `?from=2026-10-11&to=2026-10-17&sourceId=${SRC}&agentId=${AGENT}`,
    );
    expect(dashboardQuery.safeParse(q).success).toBe(true);
    expect(toQueryString(toDashboardQuery({}))).toBe(""); // API default range
  });

  it("no dates means the 30-day preset; custom ranges match none", () => {
    expect(activePreset({}, "Asia/Kolkata", now)).toBe(30);
    expect(activePreset({ sourceId: SRC }, "Asia/Kolkata", now)).toBe(30);
    expect(activePreset(presetRange(7, "Asia/Kolkata", now), "Asia/Kolkata", now)).toBe(7);
    expect(activePreset({ from: "2026-01-01", to: "2026-01-31" }, "Asia/Kolkata", now)).toBeNull();
  });

  it("drops bad dates, reversed ranges and non-uuid filters from the URL", () => {
    expect(validateDashboardSearch({ from: "2026-02-31", to: "2026-03-01" })).toEqual({
      from: undefined,
      to: "2026-03-01",
      sourceId: undefined,
      agentId: undefined,
    });
    expect(
      validateDashboardSearch({ from: "2026-03-02", to: "2026-03-01", sourceId: SRC }),
    ).toEqual({
      from: undefined,
      to: undefined,
      sourceId: SRC,
      agentId: undefined,
    });
    expect(validateDashboardSearch({ agentId: "1 or 1=1" }).agentId).toBeUndefined();
  });

  it("date math crosses month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("dashboard formatting", () => {
  it("null connect rate / duration → '—', never 0", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatMinSec(null)).toBe("—");
  });

  it("percent and m:ss", () => {
    expect(formatPercent(0.4567)).toBe("45.7%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatMinSec(0)).toBe("0:00");
    expect(formatMinSec(95.4)).toBe("1:35");
    expect(formatMinSec(3725)).toBe("62:05");
    expect(share(1, 0)).toBe(0);
    expect(share(1, 4)).toBe(0.25);
  });

  it("date keys display as local dates without a timezone shift", () => {
    expect(formatDateKey("2026-09-18")).toMatch(/^18 Sept? 2026$/);
    expect(formatDateKey("2026-01-01")).toMatch(/^1 Jan 2026$/);
    expect(formatRange("2026-09-18", "2026-10-17")).toMatch(/^18 Sep\w* – 17 Oct 2026$/);
    expect(formatRange("2025-12-20", "2026-01-05")).toMatch(/^20 Dec 2025 – 5 Jan 2026$/);
    expect(formatRange("2026-10-17", "2026-10-17")).toBe("17 Oct 2026");
  });
});
