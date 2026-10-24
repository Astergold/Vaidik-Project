import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  isoWeekdayOf,
  isValidTimeZone,
  localParts,
  parseClock,
  startOfLocalDay,
  zonedTimeToUtc,
} from "../src/tz.js";

const IST = "Asia/Kolkata";
const NY = "America/New_York";

describe("localParts", () => {
  it("converts a UTC instant to IST wall clock (+05:30)", () => {
    const p = localParts(new Date("2026-10-07T04:30:00Z"), IST);
    expect(p).toMatchObject({
      year: 2026,
      month: 10,
      day: 7,
      hour: 10,
      minute: 0,
      dateKey: "2026-10-07",
      minutesOfDay: 600,
    });
    expect(p.isoWeekday).toBe(3); // Wednesday
  });

  it("rolls the local DATE forward when UTC is still the previous day", () => {
    const p = localParts(new Date("2026-10-07T20:00:00Z"), IST); // 01:30 next day in IST
    expect(p.dateKey).toBe("2026-10-08");
    expect(p.hour).toBe(1);
  });

  it("midnight is hour 0, never 24", () => {
    expect(localParts(new Date("2026-10-06T18:30:00Z"), IST).hour).toBe(0);
  });
});

describe("isoWeekdayOf", () => {
  it("1 = Monday ... 7 = Sunday", () => {
    expect(isoWeekdayOf(2026, 10, 12)).toBe(1);
    expect(isoWeekdayOf(2026, 10, 10)).toBe(6);
    expect(isoWeekdayOf(2026, 10, 11)).toBe(7);
  });
});

describe("zonedTimeToUtc", () => {
  it("IST has no DST: 09:00 IST is 03:30Z all year", () => {
    expect(zonedTimeToUtc(2026, 10, 7, 9, 0, IST).toISOString()).toBe("2026-10-07T03:30:00.000Z");
    expect(zonedTimeToUtc(2026, 3, 15, 9, 0, IST).toISOString()).toBe("2026-03-15T03:30:00.000Z");
  });

  it("handles winter and summer offsets in a DST zone", () => {
    expect(zonedTimeToUtc(2026, 1, 15, 9, 0, NY).toISOString()).toBe("2026-01-15T14:00:00.000Z"); // EST -5
    expect(zonedTimeToUtc(2026, 7, 15, 9, 0, NY).toISOString()).toBe("2026-07-15T13:00:00.000Z"); // EDT -4
  });

  it("an ambiguous local time (clocks go back) resolves to the earlier instant", () => {
    // 2026-11-01 01:30 happens twice in New York (EDT then EST)
    expect(zonedTimeToUtc(2026, 11, 1, 1, 30, NY).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("a local time just AFTER a spring-forward gap needs the second offset guess", () => {
    // 2026-03-08 03:30 NY is EDT (-4): 07:30Z. The first guess (offset at 03:30Z) is still EST and is wrong.
    expect(zonedTimeToUtc(2026, 3, 8, 3, 30, NY).toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("a non-existent local time (clocks go forward) resolves to the first valid moment after the gap", () => {
    // 2026-03-08 02:30 does not exist in New York; 03:30 EDT = 07:30Z
    expect(zonedTimeToUtc(2026, 3, 8, 2, 30, NY).toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });
});

describe("startOfLocalDay", () => {
  it("is local midnight as a UTC instant", () => {
    expect(startOfLocalDay(new Date("2026-10-07T04:30:00Z"), IST).toISOString()).toBe(
      "2026-10-06T18:30:00.000Z",
    );
  });
  it("uses the LOCAL day, not the UTC day", () => {
    // 20:00Z on Oct 7 is already Oct 8 in IST
    expect(startOfLocalDay(new Date("2026-10-07T20:00:00Z"), IST).toISOString()).toBe(
      "2026-10-07T18:30:00.000Z",
    );
  });
});

describe("addDaysToDateKey", () => {
  it("handles month, year and leap-day rollover", () => {
    expect(addDaysToDateKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("parseClock", () => {
  it("accepts HH:MM and HH:MM:SS", () => {
    expect(parseClock("09:00")).toBe(540);
    expect(parseClock("21:00:00")).toBe(1260);
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("23:59")).toBe(1439);
  });
  it("rejects malformed or out-of-range values", () => {
    for (const bad of ["9:00", "24:00", "12:60", "noon", "", "09:00pm"]) {
      expect(() => parseClock(bad), bad).toThrow(/invalid clock time/);
    }
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone(IST)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
