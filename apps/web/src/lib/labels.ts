import {
  CORE_STAGES,
  type CoreStage,
  type NextStep,
  type Temperature,
} from "@vernacular/contracts";

/** Human labels for contract enums. Keys are checked against the contract types. */
export const STAGE_LABEL: Record<CoreStage, string> = {
  new: "New",
  attempting: "Attempting",
  connected: "Connected",
  interested: "Interested",
  visit_booked: "Visit booked",
  visited: "Visited",
  applied: "Applied",
  fee_paid: "Fee paid",
  enrolled: "Enrolled",
  lost: "Lost",
  invalid: "Invalid",
};

export const TEMPERATURE_LABEL: Record<Temperature | "unrated", string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  invalid: "Invalid",
  unrated: "Not rated",
};

/** Token classes per temperature (see `--temp-*` in styles.css). */
export const TEMPERATURE_DOT: Record<Temperature | "unrated", string> = {
  hot: "bg-temp-hot",
  warm: "bg-temp-warm",
  cold: "bg-temp-cold",
  invalid: "bg-temp-invalid",
  unrated: "bg-temp-none",
};

export const NEXT_STEP_LABEL: Record<NextStep, string> = {
  book_visit: "Book visit",
  fill_form: "Fill form",
  pay_fee: "Pay fee",
  callback: "Call back",
  counsellor_call: "Counsellor call",
  send_info: "Send info",
  none: "None",
};

/** Dates are shown in the tenant's timezone, not the viewer's. */
export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export const formatCount = (n: number) => new Intl.NumberFormat("en-IN").format(n);

/** Seconds as m:ss ("1:35", "12:04"); null → "—" (never 0 for "no data"). */
export function formatMinSec(seconds: number | null): string {
  if (seconds === null) return "—";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Stage names arrive as free strings on timeline events; known ones get their label. */
export function stageLabel(s: string | null): string {
  if (s === null) return "—";
  const known = CORE_STAGES.find((c) => c === s);
  return known ? STAGE_LABEL[known] : s;
}
