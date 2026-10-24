/**
 * Pure CRM ⇄ calling-platform mappings for campaigns. No I/O; unit-tested in test/campaign-mapping.test.ts.
 */
import type {
  CampaignCircuitBreaker,
  CampaignRetry,
  CampaignSchedule,
  PolicyRejectCode,
} from "@vernacular/contracts";
import type {
  PlatformCircuitBreaker,
  PlatformRetryConfig,
  PlatformRun,
  PlatformScheduleConfig,
} from "@vernacular/integration-dograh";
import type { TenantPolicy } from "@vernacular/policy";

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * The platform schedule is ALWAYS sent and is the intersection of the tenant calling policy (days + window,
 * end exclusive) and, when enabled, the campaign's own schedule. Returns null when nothing is left
 * (e.g. campaign only on Sunday, tenant never calls on Sunday) so the caller can refuse to start.
 * Platform weekdays are 0 = Monday … 6 = Sunday; the CRM uses ISO 1 = Monday … 7 = Sunday.
 */
export function toPlatformSchedule(
  campaign: { enabled: boolean; schedule: CampaignSchedule },
  policy: Pick<TenantPolicy, "allowedDays" | "callWindowStart" | "callWindowEnd">,
  timeZone: string,
): PlatformScheduleConfig | null {
  let days = [...new Set(policy.allowedDays)];
  let start = mins(policy.callWindowStart);
  let end = mins(policy.callWindowEnd);
  if (campaign.enabled) {
    const own = new Set(campaign.schedule.days);
    days = days.filter((d) => own.has(d));
    start = Math.max(start, mins(campaign.schedule.windowStart));
    end = Math.min(end, mins(campaign.schedule.windowEnd));
  }
  if (days.length === 0 || start >= end) return null;
  return {
    enabled: true,
    timezone: timeZone,
    slots: days
      .sort((a, b) => a - b)
      .map((d) => ({
        day_of_week: d - 1,
        start_time: hhmm(start),
        end_time: hhmm(end),
      })),
  };
}

export const toPlatformRetry = (r: CampaignRetry): PlatformRetryConfig => ({
  enabled: r.enabled,
  max_retries: r.maxRetries,
  retry_delay_seconds: r.retryDelaySeconds,
  retry_on_busy: r.onBusy,
  retry_on_no_answer: r.onNoAnswer,
  retry_on_voicemail: r.onVoicemail,
});

export const toPlatformCircuitBreaker = (c: CampaignCircuitBreaker): PlatformCircuitBreaker => ({
  enabled: c.enabled,
  failure_threshold: c.failureThresholdPct / 100,
  window_seconds: c.windowSeconds,
  min_calls_in_window: c.minCallsInWindow,
});

/**
 * Policy results at upload time. Time-based codes (window, gap, daily cap) are NOT skips: the platform
 * schedule + retry delay decide when. TENANT_SUSPENDED / WALLET_EMPTY stop the whole campaign instead.
 * Everything else (suppressed, NDNC, no consent, call in progress …) skips the lead with that reason.
 */
export const CAMPAIGN_STOP_CODES: ReadonlySet<PolicyRejectCode> = new Set([
  "TENANT_SUSPENDED",
  "WALLET_EMPTY",
]);
const SOFT_CODES: ReadonlySet<PolicyRejectCode> = new Set([
  "OUTSIDE_WINDOW",
  "TOO_SOON",
  "CAP_REACHED",
]);
export const isSkipCode = (c: PolicyRejectCode) =>
  !SOFT_CODES.has(c) && !CAMPAIGN_STOP_CODES.has(c);

/** Columns the platform exposes to the workflow as {{initial_context.<column>}}. phone_number is required. */
export const WAVE_CSV_COLUMNS = [
  "phone_number",
  "lead_id",
  "call_attempt_id",
  "crm_campaign_id",
  "person_name",
  "program",
  "language",
] as const;
export type WaveCsvRow = Record<(typeof WAVE_CSV_COLUMNS)[number], string | null>;

const cell = (v: string | null) => {
  const s = (v ?? "").replace(/\r?\n/g, " ");
  // neutralise spreadsheet formula injection in names typed by applicants (phone numbers like +91… stay as-is)
  const safe = /^[=+\-@]/.test(s) && !/^\+\d+$/.test(s) ? `'${s}` : s;
  return /[",]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function buildWaveCsv(rows: WaveCsvRow[]): string {
  const lines = [WAVE_CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push(WAVE_CSV_COLUMNS.map((c) => cell(r[c])).join(","));
  return `${lines.join("\n")}\n`;
}

/** Normalised result of one platform run, in CRM call_attempt vocabulary. */
export interface RunOutcome {
  callAttemptId: string | null;
  status: "in_progress" | "completed" | "failed" | "no_answer" | "busy";
  disposition: string | null;
  durationS: number | null;
}

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

const NO_ANSWER = new Set([
  "no_answer",
  "no-answer",
  "noanswer",
  "unanswered",
  "timeout",
  "voicemail",
  "machine",
]);
const BUSY = new Set(["busy", "user_busy"]);
const FAILED = new Set([
  "failed",
  "error",
  "invalid_number",
  "rejected",
  "canceled",
  "cancelled",
  "congestion",
]);

export function runOutcome(run: PlatformRun): RunOutcome {
  const ctx = run.initial_context ?? {};
  const g = run.gathered_context ?? {};
  const disposition = str(g.mapped_call_disposition) ?? str(g.call_disposition);
  const duration = run.cost_info?.call_duration_seconds;
  const durationS = typeof duration === "number" && duration >= 0 ? Math.round(duration) : null;
  const d = disposition?.toLowerCase() ?? "";
  let status: RunOutcome["status"];
  if (!run.is_completed) status = "in_progress";
  else if (BUSY.has(d)) status = "busy";
  else if (NO_ANSWER.has(d)) status = "no_answer";
  else if (FAILED.has(d)) status = "failed";
  else if (durationS === 0) status = "no_answer";
  else status = "completed";
  return {
    callAttemptId: str(ctx.call_attempt_id),
    status,
    disposition,
    durationS,
  };
}

/** Platform campaign state → wave state. Unknown states count as "running" (safe: sync keeps polling). */
export function waveStateOf(
  platformState: string,
): "created" | "running" | "paused" | "completed" | "failed" {
  switch (platformState.toLowerCase()) {
    case "created":
    case "draft":
      return "created";
    case "paused":
      return "paused";
    case "completed":
    case "finished":
    case "done":
      return "completed";
    case "failed":
    case "error":
    case "cancelled":
    case "canceled":
      return "failed";
    default:
      return "running";
  }
}
