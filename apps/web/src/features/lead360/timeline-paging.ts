import type { TimelineEvent, TimelineResponse } from "@vernacular/contracts";

/** Timeline paging + grouping (D3-I4-01). The cursor is opaque: we only ever pass back `nextCursor`. */
export const TIMELINE_PAGE_SIZE = 20;

/** For `useInfiniteQuery.getNextPageParam`: `undefined` means "no more pages". */
export const nextPageParam = (last: TimelineResponse): string | undefined =>
  last.nextCursor ?? undefined;

/** Pages → one newest-first list. An event that appears on two pages (new activity shifted them) shows once. */
export function flattenTimeline(pages: readonly TimelineResponse[]): TimelineEvent[] {
  const seen = new Set<string>();
  const out: TimelineEvent[] = [];
  for (const page of pages) {
    for (const e of page.items) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
  }
  return out;
}

const dayKey = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));

/** Groups by the tenant-local day, keeping order. Labels: "Today", "Yesterday", or "16 Oct 2026". */
export function groupByDay(
  events: readonly TimelineEvent[],
  timeZone: string,
  now = new Date(),
): { day: string; label: string; events: TimelineEvent[] }[] {
  const today = dayKey(now.toISOString(), timeZone);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000).toISOString(), timeZone);
  const groups: { day: string; label: string; events: TimelineEvent[] }[] = [];
  for (const e of events) {
    const day = dayKey(e.at, timeZone);
    let g = groups[groups.length - 1];
    if (!g || g.day !== day) {
      const label =
        day === today
          ? "Today"
          : day === yesterday
            ? "Yesterday"
            : new Intl.DateTimeFormat("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone,
              }).format(new Date(e.at));
      g = { day, label, events: [] };
      groups.push(g);
    }
    g.events.push(e);
  }
  return groups;
}

/** Call statuses are free strings from the dialler; "no_answer" → "No answer". */
export const humanize = (s: string) => {
  const t = s.replace(/_/g, " ").trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : s;
};
