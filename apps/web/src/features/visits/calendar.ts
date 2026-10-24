import type { MeetingStatus, VisitStatus } from "@vernacular/contracts";
import { addDays } from "@/features/dashboard/dashboard-search";

/**
 * Calendar maths (D4-I4-02). Everything is keyed by TENANT-local calendar day (YYYY-MM-DD) — never the viewer's
 * timezone — and weeks start on Monday. Date keys are plain calendar days, so the arithmetic is done in UTC.
 */
export const dayKeyIn = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));

/** ISO weekday of a date key: 1 = Monday … 7 = Sunday. */
export const isoWeekday = (key: string) => ((new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

export const startOfWeek = (key: string) => addDays(key, 1 - isoWeekday(key));
export const weekKeys = (key: string) =>
  Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(key), i));

export interface GridDay {
  key: string;
  inMonth: boolean;
}

/** Month grid as full Monday-first weeks covering `YYYY-MM`. */
export function monthGrid(month: string): GridDay[][] {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const weeks: GridDay[][] = [];
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7)) {
    weeks.push(weekKeys(start).map((key) => ({ key, inMonth: key.slice(0, 7) === month })));
  }
  return weeks;
}

/** Events grouped by tenant-local day, each day sorted by time. */
export function bucketByDay<T extends { at: string }>(
  events: readonly T[],
  timeZone: string,
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const k = dayKeyIn(e.at, timeZone);
    out.set(k, [...(out.get(k) ?? []), e]);
  }
  return out;
}

export const monthOf = (key: string) => key.slice(0, 7);
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/* ---- per-status actions ---- */

export type OutcomeAction = "reschedule" | "attended" | "no_show" | "cancelled";

export function visitActions(s: VisitStatus): OutcomeAction[] {
  return s === "booked" || s === "rescheduled"
    ? ["reschedule", "attended", "no_show", "cancelled"]
    : [];
}
export function meetingActions(s: MeetingStatus): OutcomeAction[] {
  return s === "scheduled" ? ["reschedule", "attended", "no_show", "cancelled"] : [];
}
/** No-show and cancel need a note; attended may have one. */
export const needsNote = (a: OutcomeAction) => a === "no_show" || a === "cancelled";

export const ACTION_LABEL: Record<OutcomeAction, string> = {
  reschedule: "Reschedule",
  attended: "Mark attended",
  no_show: "No-show",
  cancelled: "Cancel",
};
