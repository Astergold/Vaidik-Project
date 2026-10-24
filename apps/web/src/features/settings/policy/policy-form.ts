import { policySettingsBody, type PolicySettings } from "@vernacular/contracts";
import type { FieldErrors } from "@/lib/forms";

/**
 * Policy form model (D6-I4-02, live API). Inputs are strings while editing; `fromForm` turns them into the PUT body
 * and validates with the same schema the API uses (policySettingsBody).
 */
export interface PolicyForm {
  callWindowStart: string;
  callWindowEnd: string;
  allowedDays: number[];
  maxAttemptsPerDay: string;
  maxAttemptsTotal: string;
  minGapMinutes: string;
  requireConsent: boolean;
  ndncCheck: boolean;
  promoRequires140: boolean;
  aiDisclosureText: string;
}

export const DAYS: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
];

export const toForm = (p: PolicySettings): PolicyForm => ({
  callWindowStart: p.callWindowStart,
  callWindowEnd: p.callWindowEnd,
  allowedDays: [...p.allowedDays].sort((a, b) => a - b),
  maxAttemptsPerDay: String(p.maxAttemptsPerDay),
  maxAttemptsTotal: String(p.maxAttemptsTotal),
  minGapMinutes: String(p.minGapMinutes),
  requireConsent: p.requireConsent,
  ndncCheck: p.ndncCheck,
  promoRequires140: p.promoRequires140,
  aiDisclosureText: p.aiDisclosureText ?? "",
});

/** "12" → 12; "", "1.5", "x" → NaN (the schema then says "expected number"). */
const int = (s: string) => (/^\s*\d+\s*$/.test(s) ? Number(s) : Number.NaN);

export type FromForm = { ok: true; body: PolicySettings } | { ok: false; errors: FieldErrors };

export function fromForm(f: PolicyForm): FromForm {
  const raw = {
    // <input type="time"> can give "09:00:00" with seconds; the API wants HH:MM.
    callWindowStart: f.callWindowStart.slice(0, 5),
    callWindowEnd: f.callWindowEnd.slice(0, 5),
    allowedDays: [...f.allowedDays].sort((a, b) => a - b),
    maxAttemptsPerDay: int(f.maxAttemptsPerDay),
    maxAttemptsTotal: int(f.maxAttemptsTotal),
    minGapMinutes: int(f.minGapMinutes),
    requireConsent: f.requireConsent,
    ndncCheck: f.ndncCheck,
    promoRequires140: f.promoRequires140,
    aiDisclosureText: f.aiDisclosureText.trim() || null,
  };
  const r = policySettingsBody.safeParse(raw);
  if (r.success) return { ok: true, body: r.data };
  const errors: FieldErrors = {};
  for (const i of r.error.issues) {
    const key = String(i.path[0] ?? "form");
    errors[key] ??= i.code === "invalid_type" ? "Enter a whole number" : i.message;
  }
  // Zod skips the cross-field refinements while any field fails; check them here too so all errors show at once.
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (
    hhmm.test(raw.callWindowStart) &&
    hhmm.test(raw.callWindowEnd) &&
    raw.callWindowStart >= raw.callWindowEnd
  )
    errors.callWindowEnd ??= "Window start must be before window end";
  if (raw.maxAttemptsPerDay > raw.maxAttemptsTotal)
    errors.maxAttemptsPerDay ??= "Per-day cap cannot exceed the total cap";
  return { ok: false, errors };
}

export const toggleDay = (days: number[], d: number, on: boolean) =>
  (on ? [...new Set([...days, d])] : days.filter((x) => x !== d)).sort((a, b) => a - b);
