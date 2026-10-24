import { describe, expect, it } from "vitest";
import { usageResponse } from "@vernacular/contracts";
import { byDay, monthStart, totalsByKind } from "@/features/billing/usage";

const u = usageResponse.parse({
  from: "2026-10-01",
  to: "2026-10-31",
  days: [
    { date: "2026-10-01", kind: "call_minute", quantity: 120.5, amountPaise: 0 },
    { date: "2026-10-02", kind: "call_minute", quantity: 80, amountPaise: 20_000 },
    { date: "2026-10-02", kind: "whatsapp", quantity: 40, amountPaise: 3_200 },
  ],
  totals: [
    { kind: "call_minute", quantity: 200.5, amountPaise: 20_000 },
    { kind: "whatsapp", quantity: 40, amountPaise: 3_200 },
  ],
});

describe("billing usage helpers (D6-I4-03)", () => {
  it("groups the server's rows per day, newest first, summing the server's amounts", () => {
    expect(byDay(u.days)).toEqual([
      { date: "2026-10-02", quantity: { call_minute: 80, whatsapp: 40 }, amountPaise: 23_200 },
      { date: "2026-10-01", quantity: { call_minute: 120.5 }, amountPaise: 0 },
    ]);
  });

  it("totals: every kind in contract order, zero-filled; day sums match the server totals", () => {
    const t = totalsByKind(u.totals);
    expect(t.map((x) => x.kind)).toEqual(["call_minute", "whatsapp", "analyst_run", "sms"]);
    expect(t[2]).toEqual({ kind: "analyst_run", quantity: 0, amountPaise: 0 });
    const daySum = byDay(u.days).reduce((s, d) => s + d.amountPaise, 0);
    expect(daySum).toBe(t.reduce((s, x) => s + x.amountPaise, 0));
  });

  it("month start", () => {
    expect(monthStart("2026-10-17")).toBe("2026-10-01");
  });
});
