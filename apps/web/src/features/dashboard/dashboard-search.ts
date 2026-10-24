import type { QueryValue } from "@/lib/api";
import { optionalDate, optionalUuid } from "@/lib/search";

/**
 * /dashboard URL state + formatting (D2-I4-04, D3-I4-02). Dates are LOCAL dates in the tenant's
 * timezone, like the API: they are sent and shown as YYYY-MM-DD strings and never pass through UTC.
 * No dates = the API default (last 30 days, today inclusive), which is also the "30 days" preset.
 */
export interface DashboardSearch {
  from?: string;
  to?: string;
  sourceId?: string;
  agentId?: string;
}

export function validateDashboardSearch(s: Record<string, unknown>): DashboardSearch {
  let from = optionalDate(s.from);
  let to = optionalDate(s.to);
  // A reversed range is the API's 422; drop it here instead of rendering an error page from a URL.
  if (from && to && from > to) from = to = undefined;
  return { from, to, sourceId: optionalUuid(s.sourceId), agentId: optionalUuid(s.agentId) };
}

/** URL state → `GET /api/dashboard` query (`dashboardQuery` in contracts). Every panel uses this one slice. */
export const toDashboardQuery = (s: DashboardSearch): Record<string, QueryValue> => ({
  from: s.from,
  to: s.to,
  sourceId: s.sourceId,
  agentId: s.agentId,
});

export const PRESETS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

/** Today's date (YYYY-MM-DD) in a timezone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Last N days including today (same rule as the API default: from = to - (N - 1)). */
export function presetRange(
  days: number,
  timeZone: string,
  now = new Date(),
): { from: string; to: string } {
  const to = todayIn(timeZone, now);
  return { from: addDays(to, -(days - 1)), to };
}

/** Which preset (if any) the current dates equal. No dates = the API default = 30 days. */
export function activePreset(
  s: DashboardSearch,
  timeZone: string,
  now = new Date(),
): number | null {
  if (!s.from && !s.to) return 30;
  for (const p of PRESETS) {
    const r = presetRange(p.days, timeZone, now);
    if (r.from === s.from && r.to === s.to) return p.days;
  }
  return null;
}

/** "2026-09-18" → "18 Sep 2026". A date key is a calendar day, so it is formatted as-is (UTC = no shift). */
export function formatDateKey(key: string, withYear = true): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00Z`));
}

/** "18 Sep – 17 Oct 2026" (first year only when the range crosses years). */
export function formatRange(from: string, to: string): string {
  if (from === to) return formatDateKey(from);
  return `${formatDateKey(from, from.slice(0, 4) !== to.slice(0, 4))} – ${formatDateKey(to)}`;
}

/** 0.4567 → "45.7%"; null (no calls) → "—", never 0. */
export function formatPercent(ratio: number | null): string {
  if (ratio === null) return "—";
  return `${Math.round(ratio * 1000) / 10}%`;
}

/** Share of a total, safe for 0. */
export const share = (part: number, total: number) => (total > 0 ? part / total : 0);
