import { z } from "zod";
import { isoDateTime } from "./common.js";
import { coreStage, temperature } from "./enums.js";

/**
 * Campaigns (D3-I4-04 UI ↔ D3-I3-04 backend), mirrored to the calling platform. Spec: docs/specs/campaigns.md.
 *
 *   GET   /api/campaigns                  → campaignsListResponse
 *   POST  /api/campaigns                  createCampaignBody → 201 campaign (draft)
 *   GET   /api/campaigns/:id              → campaign
 *   PATCH /api/campaigns/:id              patchCampaignBody → campaign (409 CAMPAIGN_RUNNING unless draft/paused)
 *   POST  /api/campaigns/:id/start|pause|resume|stop   {} → campaign (409 INVALID_TRANSITION)
 *   GET   /api/campaigns/platform-options   → campaignPlatformOptions (502 when the platform is unreachable)
 */

/**
 * Same values as the crm.campaign.status CHECK (migration 20261006000600). Deliberately NOT in enums.ts yet:
 * that file is mirrored against the DB by a test and the campaigns API isn't built — move it there with the API.
 */
export const CAMPAIGN_STATUSES = ["draft", "running", "paused", "stopped", "completed"] as const;
export const campaignStatus = z.enum(CAMPAIGN_STATUSES);
export type CampaignStatus = z.infer<typeof campaignStatus>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");
const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** Which leads: the Leads-list filter vocabulary (same meaning as GET /api/leads), stored as arrays. */
export const campaignLeadFilter = z.object({
  stage: z.array(coreStage).optional(),
  temperature: z.array(temperature).optional(),
  sourceId: z.array(z.uuid()).optional(),
  counsellorId: z.array(z.uuid()).optional(),
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
});
export type CampaignLeadFilter = z.infer<typeof campaignLeadFilter>;

/** When: tenant-timezone window (end exclusive) on ISO weekdays. The tenant calling policy still applies on top. */
export const campaignSchedule = z
  .object({
    days: z.array(z.number().int().min(1).max(7)).min(1, "Pick at least one day").max(7),
    windowStart: hhmm,
    windowEnd: hhmm,
  })
  .refine((s) => minutes(s.windowStart) < minutes(s.windowEnd), {
    path: ["windowEnd"],
    message: "The window must end after it starts",
  })
  .refine((s) => new Set(s.days).size === s.days.length, {
    path: ["days"],
    message: "Days must not repeat",
  });
export type CampaignSchedule = z.infer<typeof campaignSchedule>;

/** Retry rules the calling platform applies to unanswered calls (same limits as the platform API). */
export const campaignRetry = z.object({
  enabled: z.boolean(),
  maxRetries: z.number().int().min(0, "0–10 retries").max(10, "0–10 retries"),
  retryDelaySeconds: z
    .number()
    .int()
    .min(30, "Between 30 and 3600 seconds")
    .max(3600, "Between 30 and 3600 seconds"),
  onBusy: z.boolean(),
  onNoAnswer: z.boolean(),
  onVoicemail: z.boolean(),
});
export type CampaignRetry = z.infer<typeof campaignRetry>;

/** Auto-pause when too many calls fail inside a sliding window. */
export const campaignCircuitBreaker = z.object({
  enabled: z.boolean(),
  failureThresholdPct: z.number().int().min(1, "1–100 %").max(100, "1–100 %"),
  windowSeconds: z.number().int().min(30, "30–600 seconds").max(600, "30–600 seconds"),
  minCallsInWindow: z.number().int().min(1, "1–100 calls").max(100, "1–100 calls"),
});
export type CampaignCircuitBreaker = z.infer<typeof campaignCircuitBreaker>;

export const DEFAULT_CAMPAIGN_RETRY: CampaignRetry = {
  enabled: true,
  maxRetries: 1,
  retryDelaySeconds: 120,
  onBusy: true,
  onNoAnswer: true,
  onVoicemail: false,
};
export const DEFAULT_CAMPAIGN_CIRCUIT_BREAKER: CampaignCircuitBreaker = {
  enabled: true,
  failureThresholdPct: 50,
  windowSeconds: 120,
  minCallsInWindow: 5,
};

/**
 * Campaigns are created ONLY here (the CRM). Each one is mirrored to the calling platform as one platform
 * campaign per wave of `batchSize` leads; the platform dials with the workflow / telephony configuration /
 * advanced settings below.
 */
const campaignFields = {
  name: z.string().trim().min(1, "Give the campaign a name").max(100),
  /** Platform workflow id (GET /api/campaigns/platform-options). */
  workflowId: z.number({ error: "Choose a workflow" }).int().positive("Choose a workflow"),
  /** Platform telephony configuration; null = the platform's default outbound configuration. */
  telephonyConfigId: z.number().int().positive().nullable(),
  /** Optional: calls are attributed to this AI agent. */
  aiAgentId: z.uuid().nullable(),
  leadFilter: campaignLeadFilter,
  batchSize: z.union([z.literal(100), z.literal(200)]),
  /** null = platform default (3). The organisation's concurrent-call limit always applies on top. */
  maxConcurrent: z
    .number()
    .int()
    .min(1, "Between 1 and 100")
    .max(100, "Between 1 and 100")
    .nullable(),
  retry: campaignRetry,
  /** When false, calls go out within the institution's calling hours only. */
  scheduleEnabled: z.boolean(),
  schedule: campaignSchedule,
  circuitBreaker: campaignCircuitBreaker,
};

export const createCampaignBody = z.object({
  ...campaignFields,
  telephonyConfigId: campaignFields.telephonyConfigId.default(null),
  aiAgentId: campaignFields.aiAgentId.default(null),
  batchSize: campaignFields.batchSize.default(100),
  maxConcurrent: campaignFields.maxConcurrent.default(null),
  retry: campaignFields.retry.default(DEFAULT_CAMPAIGN_RETRY),
  scheduleEnabled: campaignFields.scheduleEnabled.default(false),
  circuitBreaker: campaignFields.circuitBreaker.default(DEFAULT_CAMPAIGN_CIRCUIT_BREAKER),
});
export type CreateCampaignBody = z.infer<typeof createCampaignBody>;

/** No defaults here: an omitted field means "unchanged". */
export const patchCampaignBody = z.object(campaignFields).partial();

/** One wave = one platform campaign. */
export const CAMPAIGN_WAVE_STATES = [
  "pending",
  "created",
  "running",
  "paused",
  "completed",
  "failed",
] as const;
export const campaignWave = z.object({
  waveNo: z.number().int(),
  state: z.enum(CAMPAIGN_WAVE_STATES),
  totalRows: z.number().int(),
  processedRows: z.number().int(),
  failedRows: z.number().int(),
  startedAt: isoDateTime.nullable(),
  completedAt: isoDateTime.nullable(),
});
export type CampaignWave = z.infer<typeof campaignWave>;

/** What the create form offers, read live from the calling platform. */
export const campaignPlatformOptions = z.object({
  workflows: z.array(z.object({ id: z.number().int(), name: z.string() })),
  telephonyConfigs: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      isDefault: z.boolean(),
      phoneNumberCount: z.number().int(),
    }),
  ),
  defaults: z.object({
    maxConcurrent: z.number().int(),
    concurrentCallLimit: z.number().int(),
    retry: campaignRetry,
  }),
});
export type CampaignPlatformOptions = z.infer<typeof campaignPlatformOptions>;

/** Derived by the server from call_attempt rows with this campaign_id. total = leads matched at start. */
export const campaignProgress = z.object({
  total: z.number().int().min(0),
  dialed: z.number().int().min(0),
  connected: z.number().int().min(0),
  failed: z.number().int().min(0),
  pending: z.number().int().min(0),
  /** Leads the policy engine excluded before upload (suppressed, no consent, NDNC …). */
  skipped: z.number().int().min(0),
});
export type CampaignProgress = z.infer<typeof campaignProgress>;

export const campaign = z.object({
  id: z.uuid(),
  name: z.string(),
  status: campaignStatus,
  workflow: z.object({ id: z.number().int(), name: z.string() }),
  telephonyConfigId: z.number().int().nullable(),
  aiAgent: z.object({ id: z.uuid(), displayName: z.string() }).nullable(),
  leadFilter: campaignLeadFilter,
  scheduleEnabled: z.boolean(),
  schedule: campaignSchedule,
  maxConcurrent: z.number().int().nullable(),
  batchSize: z.number().int(),
  retry: campaignRetry,
  circuitBreaker: campaignCircuitBreaker,
  progress: campaignProgress,
  waves: z.array(campaignWave),
  /** Last problem talking to the calling platform (tenant-safe text), cleared on the next success. */
  lastError: z.string().nullable(),
  lastSyncedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Campaign = z.infer<typeof campaign>;

export const campaignsListResponse = z.object({ items: z.array(campaign) });
export type CampaignsListResponse = z.infer<typeof campaignsListResponse>;

export const CAMPAIGN_ACTIONS = ["start", "pause", "resume", "stop"] as const;
export type CampaignAction = (typeof CAMPAIGN_ACTIONS)[number];
