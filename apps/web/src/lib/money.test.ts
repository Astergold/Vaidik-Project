import { describe, expect, it } from "vitest";
import { formatPaise, paiseToInput, parseRupees } from "@/lib/money";

describe("money (paise)", () => {
  it("formats paise as rupees", () => {
    expect(formatPaise(12345)).toBe("₹123.45");
    expect(formatPaise(10_000)).toBe("₹100");
    expect(formatPaise(12_500_000)).toBe("₹1,25,000");
    expect(formatPaise(-5000)).toBe("-₹50");
    expect(formatPaise(null)).toBe("—");
  });

  it("parses typed rupees exactly (no float drift)", () => {
    expect(parseRupees("1,250.50")).toBe(125050);
    expect(parseRupees("₹ 1250")).toBe(125000);
    expect(parseRupees("0.1")).toBe(10);
    expect(parseRupees("19.99")).toBe(1999);
    expect(parseRupees("1.234")).toBeNull();
    expect(parseRupees("-5")).toBeNull();
    expect(parseRupees("abc")).toBeNull();
    expect(parseRupees("")).toBeNull();
  });

  it("round-trips to an input value", () => {
    expect(paiseToInput(125050)).toBe("1250.50");
    expect(paiseToInput(10000)).toBe("100");
    expect(paiseToInput(5)).toBe("0.05");
    expect(parseRupees(paiseToInput(125050))).toBe(125050);
  });
});
