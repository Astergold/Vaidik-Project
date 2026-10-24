import { describe, expect, it } from "vitest";
import type { PolicyRejectCode } from "@vernacular/contracts";
import { DEFAULT_POLICY, evaluate, type PolicyFacts } from "../src/index.js";

/** IST wall-clock -> Date, e.g. ist("2026-10-07T10:00") */
const ist = (s: string, sec = "00") => new Date(`${s}:${sec}+05:30`);
const WED_10 = ist("2026-10-07T10:00"); // Wednesday
const iso = (d: Date | undefined) => d?.toISOString();

function facts(over: Partial<PolicyFacts> = {}): PolicyFacts {
  return {
    tenant: { status: "active", timezone: "Asia/Kolkata" },
    policy: { ...DEFAULT_POLICY },
    wallet: { mode: "unmetered" },
    suppressed: false,
    ndnc: "clear",
    consent: "granted",
    holidays: [],
    attempts: { today: 0, total: 0, lastAttemptAt: null },
    activeCall: false,
    promotional: true,
    callerId140: false,
    ...over,
  };
}
const withPolicy = (p: Partial<PolicyFacts["policy"]>, over: Partial<PolicyFacts> = {}) =>
  facts({ policy: { ...DEFAULT_POLICY, ...p }, ...over });

const reject = (f: PolicyFacts, now: Date, action: "dial" | "whatsapp" | "planner" = "dial") => {
  const d = evaluate(action, f, now);
  if (d.allow) throw new Error("expected a rejection but the engine allowed");
  return d;
};

describe("happy path", () => {
  it("allows a clean dial on a Wednesday at 10:00 IST", () => {
    expect(evaluate("dial", facts(), WED_10)).toEqual({ allow: true });
  });
  it("is deterministic and does not mutate its input", () => {
    const f = facts({ holidays: ["2026-10-08"] });
    const frozen = JSON.stringify(f);
    const a = evaluate("dial", f, WED_10);
    const b = evaluate("dial", f, WED_10);
    expect(a).toEqual(b);
    expect(JSON.stringify(f)).toBe(frozen);
  });
});

describe("rule 6: calling window (end is EXCLUSIVE)", () => {
  it("08:59:59 is outside; retryAt is 09:00 the same day", () => {
    const d = reject(facts(), ist("2026-10-07T08:59", "59"));
    expect(d.code).toBe("OUTSIDE_WINDOW");
    expect(iso(d.retryAt)).toBe("2026-10-07T03:30:00.000Z");
  });
  it("09:00:00 is inside", () => {
    expect(evaluate("dial", facts(), ist("2026-10-07T09:00")).allow).toBe(true);
  });
  it("20:59:59 is inside", () => {
    expect(evaluate("dial", facts(), ist("2026-10-07T20:59", "59")).allow).toBe(true);
  });
  it("21:00:00 is outside; retryAt is 09:00 the next day", () => {
    const d = reject(facts(), ist("2026-10-07T21:00"));
    expect(d.code).toBe("OUTSIDE_WINDOW");
    expect(iso(d.retryAt)).toBe("2026-10-08T03:30:00.000Z");
  });
  it("Friday 21:05 -> retry Saturday 09:00 (Saturday is allowed)", () => {
    expect(iso(reject(facts(), ist("2026-10-09T21:05")).retryAt)).toBe("2026-10-10T03:30:00.000Z");
  });
  it("Saturday daytime is allowed", () => {
    expect(evaluate("dial", facts(), ist("2026-10-10T12:00")).allow).toBe(true);
  });
  it("Saturday 21:05 -> Sunday is skipped, retry Monday 09:00", () => {
    expect(iso(reject(facts(), ist("2026-10-10T21:05")).retryAt)).toBe("2026-10-12T03:30:00.000Z");
  });
  it("Sunday midday is rejected with retry Monday 09:00", () => {
    const d = reject(facts(), ist("2026-10-11T12:00"));
    expect(d.code).toBe("OUTSIDE_WINDOW");
    expect(iso(d.retryAt)).toBe("2026-10-12T03:30:00.000Z");
  });
  it("a holiday blocks the whole day; retry is the next allowed morning", () => {
    const d = reject(facts({ holidays: ["2026-10-07"] }), WED_10);
    expect(d.code).toBe("OUTSIDE_WINDOW");
    expect(iso(d.retryAt)).toBe("2026-10-08T03:30:00.000Z");
  });
  it("Sunday + Monday holiday chain -> Tuesday", () => {
    const d = reject(facts({ holidays: ["2026-10-12"] }), ist("2026-10-10T21:05"));
    expect(iso(d.retryAt)).toBe("2026-10-13T03:30:00.000Z");
  });
  it("holidays are LOCAL dates: 01:30 IST on Oct 8 (= Oct 7 UTC) is judged against Oct 8", () => {
    const now = new Date("2026-10-07T20:00:00Z"); // Oct 8 01:30 IST
    expect(iso(reject(facts(), now).retryAt)).toBe("2026-10-08T03:30:00.000Z");
    expect(iso(reject(facts({ holidays: ["2026-10-08"] }), now).retryAt)).toBe(
      "2026-10-09T03:30:00.000Z",
    );
    expect(iso(reject(facts({ holidays: ["2026-10-07"] }), now).retryAt)).toBe(
      "2026-10-08T03:30:00.000Z",
    ); // UTC date is irrelevant
  });
  it("a custom 10:00-18:00 window changes behaviour immediately", () => {
    const f = withPolicy({ callWindowStart: "10:00", callWindowEnd: "18:00" });
    expect(reject(f, ist("2026-10-07T09:30")).code).toBe("OUTSIDE_WINDOW");
    expect(evaluate("dial", f, ist("2026-10-07T17:59", "59")).allow).toBe(true);
    expect(reject(f, ist("2026-10-07T18:00")).code).toBe("OUTSIDE_WINDOW");
  });
  it("custom allowed days (Mon-Fri only): Saturday rejected", () => {
    expect(reject(withPolicy({ allowedDays: [1, 2, 3, 4, 5] }), ist("2026-10-10T12:00")).code).toBe(
      "OUTSIDE_WINDOW",
    );
  });
  it("no allowed days at all: rejected with no retryAt", () => {
    const d = reject(withPolicy({ allowedDays: [] }), WED_10);
    expect(d.code).toBe("OUTSIDE_WINDOW");
    expect(d.retryAt).toBeUndefined();
  });
  it("every day a holiday for over a year: rejected with no retryAt", () => {
    const holidays: string[] = [];
    for (let i = 0; i < 400; i++)
      holidays.push(new Date(Date.UTC(2026, 9, 7 + i)).toISOString().slice(0, 10));
    const d = reject(facts({ holidays }), WED_10);
    expect(d.retryAt).toBeUndefined();
  });
  it("a misconfigured window (start >= end) never dials and gives no retry time", () => {
    for (const [s, e] of [
      ["21:00", "09:00"],
      ["10:00", "10:00"],
    ] as const) {
      const d = reject(withPolicy({ callWindowStart: s, callWindowEnd: e }), WED_10);
      expect(d.code).toBe("OUTSIDE_WINDOW");
      expect(d.retryAt).toBeUndefined();
    }
  });
  it("works for a DST tenant: Saturday 22:00 EST -> Sunday 09:00 EDT (clocks changed overnight)", () => {
    const f = withPolicy(
      { allowedDays: [1, 2, 3, 4, 5, 6, 7] },
      { tenant: { status: "active", timezone: "America/New_York" } },
    );
    const d = reject(f, new Date("2026-03-08T03:00:00Z")); // Mar 7 22:00 EST; Mar 8 is a Sunday, allowed here
    expect(iso(d.retryAt)).toBe("2026-03-08T13:00:00.000Z"); // 09:00 EDT
  });
  it("a window that opens inside a DST gap opens at the first valid moment", () => {
    const f = withPolicy(
      { callWindowStart: "02:30", callWindowEnd: "05:00", allowedDays: [1, 2, 3, 4, 5, 6, 7] },
      { tenant: { status: "active", timezone: "America/New_York" } },
    );
    const d = reject(f, new Date("2026-03-08T05:30:00Z")); // 00:30 EST
    expect(iso(d.retryAt)).toBe("2026-03-08T07:30:00.000Z"); // 03:30 EDT
    expect(evaluate("dial", f, new Date("2026-03-08T07:30:00Z")).allow).toBe(true);
  });
});

describe("rule 1-5: tenant, wallet, suppression, NDNC, consent", () => {
  it("1 suspended tenant", () =>
    expect(
      reject(facts({ tenant: { status: "suspended", timezone: "Asia/Kolkata" } }), WED_10).code,
    ).toBe("TENANT_SUSPENDED"));
  it("2 prepaid wallet at 0 or negative is WALLET_EMPTY", () => {
    expect(reject(facts({ wallet: { mode: "prepaid", balance: 0 } }), WED_10).code).toBe(
      "WALLET_EMPTY",
    );
    expect(reject(facts({ wallet: { mode: "prepaid", balance: -3 } }), WED_10).code).toBe(
      "WALLET_EMPTY",
    );
  });
  it("2 prepaid with balance and unmetered tenants pass", () => {
    expect(
      evaluate("dial", facts({ wallet: { mode: "prepaid", balance: 0.01 } }), WED_10).allow,
    ).toBe(true);
    expect(evaluate("dial", facts({ wallet: { mode: "unmetered" } }), WED_10).allow).toBe(true);
  });
  it("3 suppressed identifier", () =>
    expect(reject(facts({ suppressed: true }), WED_10).code).toBe("SUPPRESSED"));
  it("4 NDNC listed / unknown / clear", () => {
    expect(reject(facts({ ndnc: "listed" }), WED_10).code).toBe("NDNC_LISTED");
    expect(reject(facts({ ndnc: "unknown" }), WED_10).code).toBe("NDNC_UNKNOWN");
    expect(evaluate("dial", facts({ ndnc: "clear" }), WED_10).allow).toBe(true);
  });
  it("4 NDNC rules are skipped when the tenant turns ndnc_check off", () => {
    expect(
      evaluate("dial", withPolicy({ ndncCheck: false }, { ndnc: "listed" }), WED_10).allow,
    ).toBe(true);
  });
  it("5 consent missing or revoked", () => {
    expect(reject(facts({ consent: "none" }), WED_10).code).toBe("NO_CONSENT");
    expect(reject(facts({ consent: "revoked" }), WED_10).code).toBe("NO_CONSENT");
  });
  it("5 consent is not required when the tenant turns it off", () => {
    expect(
      evaluate("dial", withPolicy({ requireConsent: false }, { consent: "none" }), WED_10).allow,
    ).toBe(true);
  });
});

describe("rule 7: attempt caps", () => {
  it("per-day: 2 of 3 allowed, 3 of 3 rejected with retry at the next window", () => {
    expect(
      evaluate("dial", facts({ attempts: { today: 2, total: 2, lastAttemptAt: null } }), WED_10)
        .allow,
    ).toBe(true);
    const d = reject(facts({ attempts: { today: 3, total: 3, lastAttemptAt: null } }), WED_10);
    expect(d.code).toBe("CAP_REACHED");
    expect(iso(d.retryAt)).toBe("2026-10-08T03:30:00.000Z"); // tomorrow 09:00 IST
  });
  it("per-day cap on Saturday retries Monday (Sunday skipped)", () => {
    const d = reject(
      facts({ attempts: { today: 3, total: 3, lastAttemptAt: null } }),
      ist("2026-10-10T10:00"),
    );
    expect(iso(d.retryAt)).toBe("2026-10-12T03:30:00.000Z");
  });
  it("total: 7 of 8 allowed, 8 of 8 rejected permanently (no retryAt)", () => {
    expect(
      evaluate("dial", facts({ attempts: { today: 0, total: 7, lastAttemptAt: null } }), WED_10)
        .allow,
    ).toBe(true);
    const d = reject(facts({ attempts: { today: 0, total: 8, lastAttemptAt: null } }), WED_10);
    expect(d.code).toBe("CAP_REACHED");
    expect(d.retryAt).toBeUndefined();
  });
  it("when both caps are hit, the total cap wins (it is permanent)", () => {
    expect(
      reject(facts({ attempts: { today: 9, total: 9, lastAttemptAt: null } }), WED_10).retryAt,
    ).toBeUndefined();
  });
});

describe("rule 8: minimum gap", () => {
  const last = ist("2026-10-07T09:00");
  const at = (min: number, sec = 0) => new Date(last.getTime() + min * 60_000 + sec * 1000);
  it("exactly the gap later is allowed", () => {
    expect(
      evaluate("dial", facts({ attempts: { today: 1, total: 1, lastAttemptAt: last } }), at(60))
        .allow,
    ).toBe(true);
  });
  it("one second early is TOO_SOON with retryAt = last + gap", () => {
    const d = reject(facts({ attempts: { today: 1, total: 1, lastAttemptAt: last } }), at(59, 59));
    expect(d.code).toBe("TOO_SOON");
    expect(iso(d.retryAt)).toBe(at(60).toISOString());
  });
  it("a zero gap never blocks", () => {
    expect(
      evaluate(
        "dial",
        withPolicy({ minGapMinutes: 0 }, { attempts: { today: 1, total: 1, lastAttemptAt: last } }),
        last,
      ).allow,
    ).toBe(true);
  });
});

describe("rules 9-10: promotional caller id, active call", () => {
  it("9 promotional call without a 140-series id is rejected only when the tenant requires it", () => {
    expect(
      reject(
        withPolicy({ promoRequires140: true }, { promotional: true, callerId140: false }),
        WED_10,
      ).code,
    ).toBe("PROMO_NUMBER_REQUIRED");
    expect(
      evaluate(
        "dial",
        withPolicy({ promoRequires140: true }, { promotional: true, callerId140: true }),
        WED_10,
      ).allow,
    ).toBe(true);
    expect(
      evaluate(
        "dial",
        withPolicy({ promoRequires140: true }, { promotional: false, callerId140: false }),
        WED_10,
      ).allow,
    ).toBe(true);
    expect(
      evaluate(
        "dial",
        withPolicy({ promoRequires140: false }, { promotional: true, callerId140: false }),
        WED_10,
      ).allow,
    ).toBe(true);
  });
  it("10 a call already in progress", () => {
    expect(reject(facts({ activeCall: true }), WED_10).code).toBe("CALL_IN_PROGRESS");
  });
});

describe("rule order: the FIRST failing rule decides the code", () => {
  // Everything is wrong at once; fix one problem at a time from the top and the next code appears.
  const allBad = (): PolicyFacts =>
    withPolicy(
      { promoRequires140: true },
      {
        tenant: { status: "suspended", timezone: "Asia/Kolkata" },
        wallet: { mode: "prepaid", balance: 0 },
        suppressed: true,
        ndnc: "listed",
        consent: "none",
        attempts: { today: 3, total: 8, lastAttemptAt: WED_10 },
        promotional: true,
        callerId140: false,
        activeCall: true,
      },
    );
  const SUNDAY = ist("2026-10-11T12:00"); // outside window
  const steps: [string, (f: PolicyFacts) => void, PolicyRejectCode][] = [
    ["start", () => undefined, "TENANT_SUSPENDED"],
    ["tenant fixed", (f) => (f.tenant.status = "active"), "WALLET_EMPTY"],
    ["wallet fixed", (f) => (f.wallet = { mode: "unmetered" }), "SUPPRESSED"],
    ["suppression fixed", (f) => (f.suppressed = false), "NDNC_LISTED"],
    ["ndnc fixed", (f) => (f.ndnc = "clear"), "NO_CONSENT"],
    ["consent fixed", (f) => (f.consent = "granted"), "OUTSIDE_WINDOW"],
  ];
  it("walks tenant -> wallet -> suppression -> NDNC -> consent -> window", () => {
    const f = allBad();
    for (const [label, fix, expected] of steps) {
      fix(f);
      expect(reject(f, SUNDAY).code, label).toBe(expected);
    }
  });
  it("then (inside the window) window -> cap -> gap -> promo -> active call", () => {
    const f = allBad();
    f.tenant.status = "active";
    f.wallet = { mode: "unmetered" };
    f.suppressed = false;
    f.ndnc = "clear";
    f.consent = "granted";
    const now = ist("2026-10-07T10:30"); // 30 min after the last attempt
    expect(reject(f, now).code).toBe("CAP_REACHED");
    f.attempts.total = 0;
    f.attempts.today = 0;
    expect(reject(f, now).code).toBe("TOO_SOON");
    f.attempts.lastAttemptAt = null;
    expect(reject(f, now).code).toBe("PROMO_NUMBER_REQUIRED");
    f.callerId140 = true;
    expect(reject(f, now).code).toBe("CALL_IN_PROGRESS");
    f.activeCall = false;
    expect(evaluate("dial", f, now).allow).toBe(true);
  });
});

describe("WhatsApp and planner actions", () => {
  const bad = facts({
    ndnc: "listed",
    activeCall: true,
    promotional: true,
    attempts: { today: 99, total: 99, lastAttemptAt: WED_10 },
  });
  it("call-only rules (NDNC, caps, gap, promo caller-id, active call) do not apply to WhatsApp", () => {
    expect(evaluate("whatsapp", bad, WED_10).allow).toBe(true);
  });
  it("shared rules still apply to WhatsApp: tenant, wallet, suppression, consent", () => {
    expect(
      reject(facts({ wallet: { mode: "prepaid", balance: 0 } }), WED_10, "whatsapp").code,
    ).toBe("WALLET_EMPTY");
    expect(reject(facts({ suppressed: true }), WED_10, "whatsapp").code).toBe("SUPPRESSED");
    expect(reject(facts({ consent: "none" }), WED_10, "whatsapp").code).toBe("NO_CONSENT");
  });
  it("marketing WhatsApp respects the calling window; transactional (visit reminder) does not", () => {
    const night = ist("2026-10-07T23:00");
    expect(reject(facts(), night, "whatsapp").code).toBe("OUTSIDE_WINDOW");
    expect(evaluate("whatsapp", facts({ transactional: true }), night).allow).toBe(true);
  });
  it("planner is judged as the channel it would use (default: voice)", () => {
    expect(reject(facts({ activeCall: true }), WED_10, "planner").code).toBe("CALL_IN_PROGRESS");
    expect(reject(facts(), ist("2026-10-11T12:00"), "planner").code).toBe("OUTSIDE_WINDOW"); // Planner proposal outside window
    expect(
      evaluate("planner", facts({ activeCall: true, plannerChannel: "whatsapp" }), WED_10).allow,
    ).toBe(true);
  });
});
