import { describe, expect, it } from "vitest";
import {
  optionalDate,
  optionalEnum,
  optionalInt,
  optionalList,
  optionalString,
} from "@/lib/search";

describe("URL search validators", () => {
  it("strings: non-empty, bounded", () => {
    expect(optionalString("abc")).toBe("abc");
    expect(optionalString("")).toBeUndefined();
    expect(optionalString(5)).toBeUndefined();
    expect(optionalString("x".repeat(3000))).toBeUndefined();
  });

  it("lists accept one value or many, and drop unknown values", () => {
    const allowed = ["new", "attempting", "lost"] as const;
    expect(optionalList("new", allowed)).toEqual(["new"]);
    expect(optionalList(["lost", "bogus", "new"], allowed)).toEqual(["new", "lost"]);
    expect(optionalList(["bogus"], allowed)).toBeUndefined();
    expect(optionalList(undefined, allowed)).toBeUndefined();
  });

  it("enums and ints", () => {
    expect(optionalEnum("asc", ["asc", "desc"])).toBe("asc");
    expect(optionalEnum("drop table", ["asc", "desc"])).toBeUndefined();
    expect(optionalInt(3, 1, 10)).toBe(3);
    expect(optionalInt("4", 1, 10)).toBe(4);
    expect(optionalInt(0, 1, 10)).toBeUndefined();
    expect(optionalInt(2.5, 1, 10)).toBeUndefined();
  });

  it("dates must be real YYYY-MM-DD days", () => {
    expect(optionalDate("2026-10-17")).toBe("2026-10-17");
    expect(optionalDate("2026-02-30")).toBeUndefined();
    expect(optionalDate("17/10/2026")).toBeUndefined();
  });
});
