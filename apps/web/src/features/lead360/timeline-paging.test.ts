import { describe, expect, it } from "vitest";
import { timelineResponse, type TimelineEvent, type TimelineResponse } from "@vernacular/contracts";
import {
  flattenTimeline,
  groupByDay,
  humanize,
  nextPageParam,
} from "@/features/lead360/timeline-paging";

const note = (id: string, at: string): TimelineEvent => ({
  id,
  at,
  type: "note",
  data: { body: id, kind: "note", authorName: null },
});

describe("timeline paging (D3-I4-01)", () => {
  it("passes nextCursor back verbatim and stops at null", () => {
    const cursor = "eyJhdCI6IjIwMjYtMTAtMTUifQ==|weird/opaque+chars";
    expect(nextPageParam({ items: [], nextCursor: cursor })).toBe(cursor);
    expect(nextPageParam({ items: [], nextCursor: null })).toBeUndefined();
  });

  it("merges pages newest-first and drops an event repeated across pages", () => {
    const p1: TimelineResponse = {
      items: [note("c", "2026-10-17T10:00:00Z"), note("b", "2026-10-17T09:00:00Z")],
      nextCursor: "x",
    };
    const p2: TimelineResponse = {
      items: [note("b", "2026-10-17T09:00:00Z"), note("a", "2026-10-16T09:00:00Z")],
      nextCursor: null,
    };
    expect(flattenTimeline([p1, p2]).map((e) => e.id)).toEqual(["c", "b", "a"]);
  });

  it("test fixtures are valid contract events", () => {
    expect(
      timelineResponse.safeParse({
        items: [note("a", "2026-10-16T09:00:00.000Z")],
        nextCursor: null,
      }).success,
    ).toBe(true);
  });
});

describe("groupByDay", () => {
  it("groups by the tenant's local day, not UTC", () => {
    const now = new Date("2026-10-17T12:00:00Z"); // 17:30 in Kolkata
    const events = [
      note("late", "2026-10-16T20:00:00Z"), // 17 Oct 01:30 Kolkata → Today
      note("y", "2026-10-16T10:00:00Z"), // 16 Oct → Yesterday
      note("old", "2026-10-10T10:00:00Z"),
    ];
    const groups = groupByDay(events, "Asia/Kolkata", now);
    expect(groups.map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
      ["Today", ["late"]],
      ["Yesterday", ["y"]],
      ["10 Oct 2026", ["old"]],
    ]);
  });
});

describe("humanize", () => {
  it("turns dialler statuses into words", () => {
    expect(humanize("no_answer")).toBe("No answer");
    expect(humanize("completed")).toBe("Completed");
  });
});
