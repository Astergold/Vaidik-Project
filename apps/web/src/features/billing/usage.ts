import { USAGE_KINDS, type UsageKind, type UsageResponse } from "@vernacular/contracts";

/** Usage helpers (D6-I4-03). Pure: the server prices every event; the UI only groups its rows for display. */
export const KIND_LABEL: Record<UsageKind, string> = {
  call_minute: "Call minutes",
  whatsapp: "WhatsApp messages",
  analyst_run: "Call analyses",
  sms: "SMS",
};
export const KIND_UNIT: Record<UsageKind, string> = {
  call_minute: "min",
  whatsapp: "msgs",
  analyst_run: "runs",
  sms: "msgs",
};

export interface DayRow {
  date: string;
  quantity: Partial<Record<UsageKind, number>>;
  amountPaise: number;
}

/** Server rows (one per day+kind) → one row per day, newest first, with the day's charged amount. */
export function byDay(days: UsageResponse["days"]): DayRow[] {
  const map = new Map<string, DayRow>();
  for (const r of days) {
    const row = map.get(r.date) ?? { date: r.date, quantity: {}, amountPaise: 0 };
    row.quantity[r.kind] = (row.quantity[r.kind] ?? 0) + r.quantity;
    row.amountPaise += r.amountPaise;
    map.set(r.date, row);
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Totals in USAGE_KINDS order, zero-filled, so the table and chart always list every kind. */
export function totalsByKind(totals: UsageResponse["totals"]) {
  return USAGE_KINDS.map((kind) => {
    const t = totals.filter((x) => x.kind === kind);
    return {
      kind,
      quantity: t.reduce((s, x) => s + x.quantity, 0),
      amountPaise: t.reduce((s, x) => s + x.amountPaise, 0),
    };
  });
}

/** First day of the month of a YYYY-MM-DD key. */
export const monthStart = (key: string) => `${key.slice(0, 8)}01`;
