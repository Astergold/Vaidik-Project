import { describe, expect, it } from "vitest";
import { POLICY_REJECT_CODES } from "@vernacular/contracts";
import { describeRejection, REJECT_COPY } from "@/features/lead360/reject-codes";

describe("reject-code rendering (D3-I4-01)", () => {
  it("has plain-language copy for every policy code", () => {
    expect(Object.keys(REJECT_COPY).sort()).toEqual([...POLICY_REJECT_CODES].sort());
    for (const c of POLICY_REJECT_CODES) {
      expect(REJECT_COPY[c].title.length, c).toBeGreaterThan(5);
      expect(REJECT_COPY[c].title, c).not.toMatch(/_/); // never the raw code as the headline
    }
  });

  it("OUTSIDE_WINDOW shows retryAt in the tenant timezone", () => {
    // 03:30 UTC = 09:00 in Kolkata
    const v = describeRejection("OUTSIDE_WINDOW", "2026-10-18T03:30:00.000Z", "Asia/Kolkata");
    expect(v.title).toBe("Outside calling hours");
    expect(v.retry).toBe("Can try again 18 Oct, 9:00 am");
    expect(v.code).toBe("OUTSIDE_WINDOW");
  });

  it("no retryAt → no retry line", () => {
    expect(describeRejection("NO_CONSENT", undefined, "Asia/Kolkata").retry).toBeNull();
  });

  it("unknown codes (lastRejectCode is a free string) fall back but keep the code", () => {
    const v = describeRejection("SOMETHING_NEW", null, "Asia/Kolkata");
    expect(v.title).toBe("The call wasn't placed");
    expect(v.code).toBe("SOMETHING_NEW");
  });
});
