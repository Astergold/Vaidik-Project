import { describe, expect, it } from "vitest";
import { policySettings } from "@vernacular/contracts";
import { fromForm, toForm, toggleDay } from "@/features/settings/policy/policy-form";

const saved = policySettings.parse({
  callWindowStart: "09:00",
  callWindowEnd: "21:00",
  allowedDays: [6, 1, 2, 3, 4, 5],
  maxAttemptsPerDay: 3,
  maxAttemptsTotal: 8,
  minGapMinutes: 60,
  requireConsent: true,
  ndncCheck: true,
  promoRequires140: false,
  aiDisclosureText: null,
});

describe("policy form (D6-I4-02, live API)", () => {
  it("round-trips the server's policy (days sorted, empty disclosure ↔ null)", () => {
    const f = toForm(saved);
    expect(f.allowedDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(f.aiDisclosureText).toBe("");
    expect(fromForm(f)).toEqual({ ok: true, body: { ...saved, allowedDays: [1, 2, 3, 4, 5, 6] } });
  });

  it("strips seconds from time inputs and trims the disclosure", () => {
    const r = fromForm({
      ...toForm(saved),
      callWindowStart: "09:30:00",
      aiDisclosureText: "  This call is by an AI assistant.  ",
    });
    expect(r.ok && r.body.callWindowStart).toBe("09:30");
    expect(r.ok && r.body.aiDisclosureText).toBe("This call is by an AI assistant.");
  });

  it("mirrors the API rules: window order, per-day ≤ total, whole numbers, at least one day", () => {
    const r = fromForm({
      ...toForm(saved),
      callWindowStart: "21:00",
      callWindowEnd: "09:00",
      maxAttemptsPerDay: "9",
      maxAttemptsTotal: "8",
      minGapMinutes: "1.5",
      allowedDays: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors).toMatchObject({
        callWindowEnd: "Window start must be before window end",
        maxAttemptsPerDay: "Per-day cap cannot exceed the total cap",
        minGapMinutes: "Enter a whole number",
      });
    const noDays = fromForm({ ...toForm(saved), allowedDays: [] });
    expect(!noDays.ok && noDays.errors.allowedDays).toBeTruthy();
  });

  it("toggleDay keeps days unique and ordered", () => {
    expect(toggleDay([1, 3], 2, true)).toEqual([1, 2, 3]);
    expect(toggleDay([1, 2, 3], 2, false)).toEqual([1, 3]);
    expect(toggleDay([1], 1, true)).toEqual([1]);
  });
});
