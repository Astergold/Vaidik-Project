import type { ProgramDetail, SeatBucket } from "@vernacular/contracts";

/** Seat/deadline matrix helpers (D6-I4-04d). Pure. */

/** Indian admission year starts in June: 17 Oct 2026 → "2026-27"; 10 Mar 2027 → "2026-27". */
export function academicYearOf(dateKey: string): string {
  const y = Number(dateKey.slice(0, 4));
  const m = Number(dateKey.slice(5, 7));
  const start = m >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export const nextYear = (ay: string) => {
  const start = Number(ay.slice(0, 4)) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};

export const seatFor = (p: ProgramDetail, ay: string): SeatBucket | null =>
  p.seats.find((s) => s.academicYear === ay)?.bucket ?? null;

/** Tuition for the year (the lowest, when there are several), else null. */
export function tuitionFor(p: ProgramDetail, ay: string): number | null {
  const fees = p.fees
    .filter((f) => f.academicYear === ay && f.kind === "tuition")
    .map((f) => f.amount);
  return fees.length ? Math.min(...fees) : null;
}

/** Deadlines from `nowIso` on, soonest first. */
export const upcomingDeadlines = (p: ProgramDetail, nowIso: string, n = 2) =>
  p.deadlines
    .filter((d) => d.dueAt >= nowIso)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, n);
