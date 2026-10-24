import {
  createCampaignBody,
  DEFAULT_CAMPAIGN_CIRCUIT_BREAKER,
  DEFAULT_CAMPAIGN_RETRY,
  type Campaign,
  type CampaignLeadFilter,
  type CampaignSchedule,
  type CampaignStatus,
  type CreateCampaignBody,
} from "@vernacular/contracts";
import type { QueryValue } from "@/lib/api";
import type { FieldErrors } from "@/lib/forms";
import { toLeadsApiQuery, type LeadsSearch } from "@/features/leads/leads-search";

/** Campaigns UI logic (D3-I4-04). Pure, unit-tested; components only render it. */

/** Which buttons a status allows. The server is the judge (409 INVALID_TRANSITION); this only hides nonsense. */
export function actionsFor(status: CampaignStatus) {
  return {
    start: status === "draft",
    resume: status === "paused",
    pause: status === "running",
    stop: status === "running" || status === "paused",
    edit: status === "draft" || status === "paused",
  };
}

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  running: "Running",
  paused: "Paused",
  stopped: "Stopped",
  completed: "Completed",
};

/* ---- lead filter ↔ Leads-list vocabulary (one vocabulary, not a second one) ---- */

export const filterToLeadsSearch = (f: CampaignLeadFilter): LeadsSearch => ({
  stage: f.stage?.length ? f.stage : undefined,
  temperature: f.temperature?.length ? f.temperature : undefined,
  sourceId: f.sourceId?.length ? f.sourceId : undefined,
  counsellorId: f.counsellorId?.length ? f.counsellorId : undefined,
  createdFrom: f.createdFrom,
  createdTo: f.createdTo,
});

export const leadsSearchToFilter = (s: LeadsSearch): CampaignLeadFilter => {
  const f: CampaignLeadFilter = {};
  if (s.stage?.length) f.stage = s.stage;
  if (s.temperature?.length) f.temperature = s.temperature;
  if (s.sourceId?.length) f.sourceId = s.sourceId;
  if (s.counsellorId?.length) f.counsellorId = s.counsellorId;
  if (s.createdFrom) f.createdFrom = s.createdFrom;
  if (s.createdTo) f.createdTo = s.createdTo;
  return f;
};

/** "How many leads match right now" via the existing GET /api/leads (total only). */
export const matchCountQuery = (f: CampaignLeadFilter): Record<string, QueryValue> => ({
  ...toLeadsApiQuery(filterToLeadsSearch(f)),
  page: 1,
  pageSize: 1,
});

/* ---- form ---- */

/** Text inputs stay strings while typing; validateCampaignForm turns them into the API body. */
export interface CampaignFormValues {
  name: string;
  workflowId: string;
  telephonyConfigId: string;
  aiAgentId: string;
  filter: CampaignLeadFilter;
  batchSize: "100" | "200";
  /** "" = the platform default */
  maxConcurrent: string;
  retryEnabled: boolean;
  maxRetries: string;
  retryDelaySeconds: string;
  retryOnBusy: boolean;
  retryOnNoAnswer: boolean;
  retryOnVoicemail: boolean;
  scheduleEnabled: boolean;
  days: number[];
  windowStart: string;
  windowEnd: string;
  breakerEnabled: boolean;
  failureThresholdPct: string;
  windowSeconds: string;
  minCallsInWindow: string;
}

const R = DEFAULT_CAMPAIGN_RETRY;
const B = DEFAULT_CAMPAIGN_CIRCUIT_BREAKER;

export const emptyCampaignForm = (): CampaignFormValues => ({
  name: "",
  workflowId: "",
  telephonyConfigId: "",
  aiAgentId: "",
  filter: {},
  batchSize: "100",
  maxConcurrent: "",
  retryEnabled: R.enabled,
  maxRetries: String(R.maxRetries),
  retryDelaySeconds: String(R.retryDelaySeconds),
  retryOnBusy: R.onBusy,
  retryOnNoAnswer: R.onNoAnswer,
  retryOnVoicemail: R.onVoicemail,
  scheduleEnabled: false,
  days: [1, 2, 3, 4, 5],
  windowStart: "10:00",
  windowEnd: "18:00",
  breakerEnabled: B.enabled,
  failureThresholdPct: String(B.failureThresholdPct),
  windowSeconds: String(B.windowSeconds),
  minCallsInWindow: String(B.minCallsInWindow),
});

export const formFromCampaign = (c: Campaign): CampaignFormValues => ({
  name: c.name,
  workflowId: c.workflow.id ? String(c.workflow.id) : "",
  telephonyConfigId: c.telephonyConfigId === null ? "" : String(c.telephonyConfigId),
  aiAgentId: c.aiAgent?.id ?? "",
  filter: c.leadFilter,
  batchSize: c.batchSize === 200 ? "200" : "100",
  maxConcurrent: c.maxConcurrent === null ? "" : String(c.maxConcurrent),
  retryEnabled: c.retry.enabled,
  maxRetries: String(c.retry.maxRetries),
  retryDelaySeconds: String(c.retry.retryDelaySeconds),
  retryOnBusy: c.retry.onBusy,
  retryOnNoAnswer: c.retry.onNoAnswer,
  retryOnVoicemail: c.retry.onVoicemail,
  scheduleEnabled: c.scheduleEnabled,
  days: [...c.schedule.days].sort(),
  windowStart: c.schedule.windowStart,
  windowEnd: c.schedule.windowEnd,
  breakerEnabled: c.circuitBreaker.enabled,
  failureThresholdPct: String(c.circuitBreaker.failureThresholdPct),
  windowSeconds: String(c.circuitBreaker.windowSeconds),
  minCallsInWindow: String(c.circuitBreaker.minCallsInWindow),
});

export type CampaignFormResult =
  { ok: true; body: CreateCampaignBody } | { ok: false; errors: FieldErrors };

const toInt = (s: string) => (/^\s*\d+\s*$/.test(s) ? Number(s) : NaN);
const optInt = (s: string) => (s.trim() === "" ? null : toInt(s));

/** Error keys match the form's field ids, so each message shows under its own input. */
const KEY_FOR: Record<string, string> = {
  "schedule.days": "days",
  "schedule.windowStart": "windowStart",
  "schedule.windowEnd": "windowEnd",
  "retry.maxRetries": "maxRetries",
  "retry.retryDelaySeconds": "retryDelaySeconds",
  "circuitBreaker.failureThresholdPct": "failureThresholdPct",
  "circuitBreaker.windowSeconds": "windowSeconds",
  "circuitBreaker.minCallsInWindow": "minCallsInWindow",
};

/** Same rules as the API (createCampaignBody). */
export function validateCampaignForm(v: CampaignFormValues): CampaignFormResult {
  const candidate = {
    name: v.name,
    workflowId: optInt(v.workflowId) ?? NaN,
    telephonyConfigId: optInt(v.telephonyConfigId),
    aiAgentId: v.aiAgentId || null,
    leadFilter: v.filter,
    batchSize: Number(v.batchSize),
    maxConcurrent: optInt(v.maxConcurrent),
    retry: {
      enabled: v.retryEnabled,
      maxRetries: toInt(v.maxRetries),
      retryDelaySeconds: toInt(v.retryDelaySeconds),
      onBusy: v.retryOnBusy,
      onNoAnswer: v.retryOnNoAnswer,
      onVoicemail: v.retryOnVoicemail,
    },
    scheduleEnabled: v.scheduleEnabled,
    schedule: {
      days: [...v.days].sort(),
      windowStart: v.windowStart,
      windowEnd: v.windowEnd,
    },
    circuitBreaker: {
      enabled: v.breakerEnabled,
      failureThresholdPct: toInt(v.failureThresholdPct),
      windowSeconds: toInt(v.windowSeconds),
      minCallsInWindow: toInt(v.minCallsInWindow),
    },
  };
  const r = createCampaignBody.safeParse(candidate);
  if (r.success) return { ok: true, body: r.data };
  const errors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const path = issue.path.map(String);
    // a hidden (disabled) section can't show its errors: only report schedule problems when it is on
    if (path[0] === "schedule" && !v.scheduleEnabled) continue;
    const key =
      KEY_FOR[path.slice(0, 2).join(".")] ??
      (path[0] === "leadFilter" ? "filter" : (path[0] ?? "form"));
    const message =
      key === "workflowId"
        ? "Choose a workflow"
        : key === "maxConcurrent"
          ? "Leave empty for the default, or 1–100"
          : Number.isNaN(issue.input as number) || issue.code === "invalid_type"
            ? "Enter a whole number"
            : issue.message;
    errors[key] ??= message;
  }
  if (Object.keys(errors).length === 0) {
    // only schedule errors, and the schedule is off: send it with a valid placeholder
    return validateCampaignForm({
      ...v,
      days: [1, 2, 3, 4, 5],
      windowStart: "10:00",
      windowEnd: "18:00",
    });
  }
  return { ok: false, errors };
}

/* ---- display ---- */

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function formatDays(days: readonly number[]): string {
  const d = [...new Set(days)].sort();
  if (d.length === 7) return "Every day";
  const contiguous = d.every((x, i) => i === 0 || x === d[i - 1]! + 1);
  return contiguous && d.length > 2
    ? `${DAY[d[0]!]}–${DAY[d[d.length - 1]!]}`
    : d.map((x) => DAY[x]).join(", ");
}
export const formatSchedule = (s: CampaignSchedule, tz: string) =>
  `${formatDays(s.days)}, ${s.windowStart}–${s.windowEnd} (${tz})`;

export const progressPct = (p: Campaign["progress"]) =>
  p.total > 0 ? Math.min(100, Math.round((p.dialed / p.total) * 100)) : 0;
