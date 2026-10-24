/**
 * Timezone helpers on top of Intl only (no dependencies, no I/O). All policy decisions are made in the
 * TENANT's timezone, never the server's.
 */

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  /** ISO weekday: 1 = Monday ... 7 = Sunday */
  isoWeekday: number;
  /** YYYY-MM-DD in the local zone */
  dateKey: string;
  minutesOfDay: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
export const dateKeyOf = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** ISO weekday (1=Mon..7=Sun) of a calendar date; independent of any timezone. */
export function isoWeekdayOf(y: number, m: number, d: number): number {
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return js === 0 ? 7 : js;
}

export function localParts(date: Date, timeZone: string): LocalParts {
  const p: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const { year, month, day, hour, minute, second } = p as Record<
    "year" | "month" | "day" | "hour" | "minute" | "second",
    number
  >;
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    isoWeekday: isoWeekdayOf(year, month, day),
    dateKey: dateKeyOf(year, month, day),
    minutesOfDay: hour * 60 + minute,
  };
}

/** Offset of the zone from UTC at an instant, in ms (local wall clock minus UTC). */
function offsetMs(date: Date, timeZone: string): number {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `timeZone` reads y-m-d hh:mm.
 * DST edge cases: an ambiguous time (clocks go back) resolves to the EARLIER instant;
 * a non-existent time (clocks go forward) resolves to the first valid moment after the gap.
 * (IST has no DST, so for MIT-ADT this is a straight offset; the general case is for other tenants.)
 */
export function zonedTimeToUtc(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = offsetMs(new Date(wall), timeZone);
  const c1 = wall - off1;
  const off2 = offsetMs(new Date(c1), timeZone);
  const c2 = wall - off2;
  const matches = (t: number) => {
    const p = localParts(new Date(t), timeZone);
    return p.year === y && p.month === m && p.day === d && p.hour === hh && p.minute === mm;
  };
  // If c1 is a correct instant then off2 === off1, so c2 === c1 and both match: "only c1 matches" cannot happen.
  const ok1 = matches(c1);
  const ok2 = matches(c2);
  if (ok1 && ok2) return new Date(Math.min(c1, c2)); // normal (c1 === c2) or ambiguous (earlier)
  if (ok2) return new Date(c2); // first guess used the pre-transition offset
  return new Date(Math.max(c1, c2)); // in a gap: move forward
}

/** Midnight (00:00 local) of the local day containing `date`, as a UTC instant. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const p = localParts(date, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, timeZone);
}

/** Calendar arithmetic on a YYYY-MM-DD key (no timezone involved). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return dateKeyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** "09:00" or "09:00:00" -> minutes since midnight. Throws on garbage (settings are validated on write). */
export function parseClock(value: string): number {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!m) throw new Error(`invalid clock time "${value}" (expected HH:MM)`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`invalid clock time "${value}"`);
  return h * 60 + min;
}
