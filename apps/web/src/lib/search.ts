/** Helpers for route `validateSearch`: URL params are untrusted input, so bad values become undefined. */

export const optionalString = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 && v.length <= 2048 ? v : undefined;

/** Accepts `x` or `[x, y]` (TanStack serialises arrays as JSON); keeps only allowed values. */
export function optionalList<T extends string>(v: unknown, allowed: readonly T[]): T[] | undefined {
  const raw = Array.isArray(v) ? v : v === undefined ? [] : [v];
  const list = allowed.filter((a) => raw.includes(a));
  return list.length ? list : undefined;
}

export function optionalEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return allowed.find((a) => a === v);
}

export function optionalInt(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/** `YYYY-MM-DD` that is a real calendar date. */
export function optionalDate(v: unknown): string | undefined {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const optionalUuid = (v: unknown): string | undefined =>
  typeof v === "string" && UUID.test(v) ? v : undefined;

/** One uuid or several (`[a, b]`): invalid values and duplicates are dropped; empty → undefined. */
export function optionalUuidList(v: unknown): string[] | undefined {
  const raw = Array.isArray(v) ? v : v === undefined ? [] : [v];
  const out = [
    ...new Set(
      raw
        .map(optionalUuid)
        .filter((x): x is string => x !== undefined)
        .map((x) => x.toLowerCase()),
    ),
  ];
  return out.length ? out : undefined;
}
