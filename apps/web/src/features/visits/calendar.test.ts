import { describe, expect, it } from "vitest";
import { MEETING_STATUSES, VISIT_STATUSES } from "@vernacular/contracts";
import {
  addMonths,
  bucketByDay,
  dayKeyIn,
  isoWeekday,
  meetingActions,
  monthGrid,
  needsNote,
  visitActions,
  weekKeys,
} from "@/features/visits/calendar";

describe("calendar maths (D4-I4-02)", () => {
  it("weekdays and Monday-first weeks", () => {
    expect(isoWeekday("2026-10-19")).toBe(1); // Monday
    expect(isoWeekday("2026-10-25")).toBe(7); // Sunday
    expect(weekKeys("2026-10-22")).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
  });

  it("month grid covers the month in whole Monday-first weeks", () => {
    const oct = monthGrid("2026-10"); // 1 Oct 2026 is a Thursday, 31 Oct a Saturday
    expect(oct[0]!.map((d) => d.key)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(oct[0]![2]!.inMonth).toBe(false);
    expect(oct[0]![3]!.inMonth).toBe(true);
    expect(oct.at(-1)!.map((d) => d.key)).toContain("2026-10-31");
    expect(oct.flat().filter((d) => d.inMonth)).toHaveLength(31);
    expect(
      monthGrid("2027-02")
        .flat()
        .filter((d) => d.inMonth),
    ).toHaveLength(28);
  });

  it("buckets by the TENANT's day: a late-night UTC visit on 31 Oct is 1 Nov in Kolkata", () => {
    const events = [
      { id: "b", at: "2026-10-31T20:00:00.000Z" }, // 1 Nov 01:30 IST
      { id: "a", at: "2026-10-31T05:00:00.000Z" }, // 31 Oct 10:30 IST
      { id: "c", at: "2026-10-31T19:00:00.000Z" }, // 1 Nov 00:30 IST
    ];
    const ist = bucketByDay(events, "Asia/Kolkata");
    expect(ist.get("2026-10-31")?.map((e) => e.id)).toEqual(["a"]);
    expect(ist.get("2026-11-01")?.map((e) => e.id)).toEqual(["c", "b"]); // sorted by time
    expect(bucketByDay(events, "UTC").get("2026-10-31")).toHaveLength(3); // the viewer's zone would be wrong
    expect(dayKeyIn("2026-10-31T20:00:00.000Z", "Asia/Kolkata")).toBe("2026-11-01");
  });

  it("month navigation crosses years", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("per-status action matrix", () => {
  it("open visits/meetings can be rescheduled or closed; closed ones can't", () => {
    for (const s of VISIT_STATUSES) {
      expect(visitActions(s).length > 0, s).toBe(s === "booked" || s === "rescheduled");
    }
    for (const s of MEETING_STATUSES) {
      expect(meetingActions(s).length > 0, s).toBe(s === "scheduled");
    }
    expect(visitActions("booked")).toEqual(["reschedule", "attended", "no_show", "cancelled"]);
  });
  it("no-show and cancel need a note", () => {
    expect(needsNote("no_show") && needsNote("cancelled")).toBe(true);
    expect(needsNote("attended") || needsNote("reschedule")).toBe(false);
  });
});
