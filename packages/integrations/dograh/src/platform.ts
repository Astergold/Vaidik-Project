/**
 * Voice platform REST client for the campaign feature (verified against the platform's OpenAPI at
 * <base>/api/v1/openapi.json). Every response is validated with zod so contract drift fails loudly here,
 * not deep inside a job. Errors are mapped to PlatformError with a tenant-safe message: the provider's
 * name never appears in anything a tenant can see.
 */
import { z } from "zod";

const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_CSV_BYTES = 10 * 1024 * 1024;

export type PlatformErrorCode = "AUTH" | "NOT_FOUND" | "REJECTED" | "UNAVAILABLE";

export class PlatformError extends Error {
  constructor(
    readonly code: PlatformErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PlatformError";
  }
}

// ---- response / request shapes -------------------------------------------------------------------

export const platformWorkflow = z.object({
  id: z.number().int(),
  name: z.string(),
  status: z.string(),
  /** Used by the single-call trigger endpoint. */
  workflow_uuid: z.string().nullable().optional(),
});
export type PlatformWorkflow = z.infer<typeof platformWorkflow>;

export const platformTelephonyConfig = z.object({
  id: z.number().int(),
  name: z.string(),
  provider: z.string(),
  is_default_outbound: z.boolean(),
  phone_number_count: z.number().int().default(0),
});
export type PlatformTelephonyConfig = z.infer<typeof platformTelephonyConfig>;

export const platformRetryConfig = z.object({
  enabled: z.boolean(),
  max_retries: z.number().int().min(0).max(10),
  retry_delay_seconds: z.number().int().min(30).max(3600),
  retry_on_busy: z.boolean(),
  retry_on_no_answer: z.boolean(),
  retry_on_voicemail: z.boolean(),
});
export type PlatformRetryConfig = z.infer<typeof platformRetryConfig>;

export const platformCircuitBreaker = z.object({
  enabled: z.boolean(),
  /** 0..1 (the UI shows a percentage) */
  failure_threshold: z.number().min(0).max(1),
  window_seconds: z.number().int().min(30).max(600),
  min_calls_in_window: z.number().int().min(1).max(100),
});
export type PlatformCircuitBreaker = z.infer<typeof platformCircuitBreaker>;

export const platformScheduleConfig = z.object({
  enabled: z.boolean(),
  timezone: z.string(),
  /** day_of_week: 0 = Monday … 6 = Sunday */
  slots: z
    .array(
      z.object({
        day_of_week: z.number().int().min(0).max(6),
        start_time: z.string().regex(/^\d{2}:\d{2}$/),
        end_time: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .min(1)
    .max(50),
});
export type PlatformScheduleConfig = z.infer<typeof platformScheduleConfig>;

export const platformCampaignDefaults = z.object({
  concurrent_call_limit: z.number().int(),
  default_max_concurrency: z.number().int().default(3),
  from_numbers_count: z.number().int(),
  default_retry_config: platformRetryConfig,
});
export type PlatformCampaignDefaults = z.infer<typeof platformCampaignDefaults>;

export const platformCampaign = z.object({
  id: z.number().int(),
  name: z.string(),
  workflow_id: z.number().int(),
  state: z.string(),
  total_rows: z.number().int().nullable(),
  processed_rows: z.number().int(),
  failed_rows: z.number().int(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});
export type PlatformCampaign = z.infer<typeof platformCampaign>;

/** One call ("run") of a platform campaign. Only the fields the CRM reads; the rest pass through. */
export const platformRun = z
  .object({
    id: z.number().int(),
    created_at: z.string(),
    is_completed: z.boolean().nullable().optional(),
    recording_url: z.string().nullable().optional(),
    transcript_url: z.string().nullable().optional(),
    cost_info: z
      .object({ call_duration_seconds: z.number().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
    initial_context: z.record(z.string(), z.unknown()).nullable().optional(),
    gathered_context: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();
export type PlatformRun = z.infer<typeof platformRun>;

const runsPage = z.object({
  runs: z.array(platformRun),
  total_count: z.number().int(),
  page: z.number().int(),
  total_pages: z.number().int(),
});

export interface CreatePlatformCampaign {
  name: string;
  workflowId: number;
  sourceFileKey: string;
  telephonyConfigId: number | null;
  maxConcurrency: number | null;
  retry: PlatformRetryConfig | null;
  schedule: PlatformScheduleConfig | null;
  circuitBreaker: PlatformCircuitBreaker | null;
}

export interface TriggerCall {
  workflowUuid: string;
  phoneE164: string;
  initialContext: Record<string, unknown>;
  telephonyConfigId?: number | null;
}

export interface PlatformClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  /** Test seam; defaults to global fetch. */
  fetch?: typeof fetch;
}

/** The surface the CRM uses. Jobs and routes depend on this, so tests can pass an in-memory fake. */
export interface CampaignPlatform {
  listWorkflows(): Promise<PlatformWorkflow[]>;
  listTelephonyConfigs(): Promise<PlatformTelephonyConfig[]>;
  getCampaignDefaults(): Promise<PlatformCampaignDefaults>;
  uploadCsv(fileName: string, csv: string): Promise<string>;
  createCampaign(c: CreatePlatformCampaign): Promise<PlatformCampaign>;
  listCampaigns(): Promise<PlatformCampaign[]>;
  getCampaign(id: number): Promise<PlatformCampaign>;
  startCampaign(id: number): Promise<PlatformCampaign>;
  pauseCampaign(id: number): Promise<PlatformCampaign>;
  resumeCampaign(id: number): Promise<PlatformCampaign>;
  listAllRuns(id: number): Promise<PlatformRun[]>;
}

/** Single calls (intake, call-now, callbacks) outside campaigns. */
export interface CallPlatform {
  listWorkflows(): Promise<PlatformWorkflow[]>;
  triggerCall(c: TriggerCall): Promise<{ runId: number }>;
  listWorkflowRuns(workflowId: number, limit: number): Promise<PlatformRun[]>;
  getWorkflowRun(workflowId: number, runId: number): Promise<PlatformRun>;
}

// ---- client ---------------------------------------------------------------------------------------

export class PlatformClient implements CampaignPlatform, CallPlatform {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(cfg: PlatformClientConfig) {
    if (!cfg.apiKey)
      throw new PlatformError("AUTH", "The calling platform is not configured", false);
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.apiKey = cfg.apiKey;
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.doFetch = cfg.fetch ?? fetch;
  }

  listWorkflows(): Promise<PlatformWorkflow[]> {
    return this.call("GET", "/api/v1/workflow/fetch?status=active", z.array(platformWorkflow));
  }

  async listTelephonyConfigs(): Promise<PlatformTelephonyConfig[]> {
    const r = await this.call(
      "GET",
      "/api/v1/organizations/telephony-configs",
      z.object({ configurations: z.array(platformTelephonyConfig) }),
    );
    return r.configurations;
  }

  getCampaignDefaults(): Promise<PlatformCampaignDefaults> {
    return this.call("GET", "/api/v1/organizations/campaign-defaults", platformCampaignDefaults);
  }

  /** Presigned upload (max 10 MB, .csv) then PUT. Returns the file key used as the campaign source_id. */
  async uploadCsv(fileName: string, csv: string): Promise<string> {
    const size = Buffer.byteLength(csv, "utf8");
    if (size === 0) throw new PlatformError("REJECTED", "The call list is empty", false);
    if (size > MAX_CSV_BYTES)
      throw new PlatformError("REJECTED", "The call list is larger than 10 MB", false);
    const presign = await this.call(
      "POST",
      "/api/v1/s3/presigned-upload-url",
      z.object({ upload_url: z.string(), file_key: z.string() }),
      {
        file_name: fileName.endsWith(".csv") ? fileName : `${fileName}.csv`,
        file_size: size,
        content_type: "text/csv",
      },
    );
    const res = await this.withTimeout((signal) =>
      this.doFetch(presign.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "text/csv" },
        body: csv,
        signal,
      }),
    );
    if (!res.ok) throw httpError(res.status, "Uploading the call list failed");
    return presign.file_key;
  }

  createCampaign(c: CreatePlatformCampaign): Promise<PlatformCampaign> {
    return this.call("POST", "/api/v1/campaign/create", platformCampaign, {
      name: c.name,
      workflow_id: c.workflowId,
      source_type: "csv",
      source_id: c.sourceFileKey,
      telephony_configuration_id: c.telephonyConfigId,
      max_concurrency: c.maxConcurrency,
      retry_config: c.retry,
      schedule_config: c.schedule,
      circuit_breaker: c.circuitBreaker,
    });
  }

  async listCampaigns(): Promise<PlatformCampaign[]> {
    const r = await this.call(
      "GET",
      "/api/v1/campaign/",
      z.object({ campaigns: z.array(platformCampaign) }),
    );
    return r.campaigns;
  }

  getCampaign(id: number): Promise<PlatformCampaign> {
    return this.call("GET", `/api/v1/campaign/${id}`, platformCampaign);
  }
  startCampaign(id: number): Promise<PlatformCampaign> {
    return this.call("POST", `/api/v1/campaign/${id}/start`, platformCampaign);
  }
  pauseCampaign(id: number): Promise<PlatformCampaign> {
    return this.call("POST", `/api/v1/campaign/${id}/pause`, platformCampaign);
  }
  resumeCampaign(id: number): Promise<PlatformCampaign> {
    return this.call("POST", `/api/v1/campaign/${id}/resume`, platformCampaign);
  }

  /** All runs of a campaign, following pagination (100 per page). */
  async listAllRuns(id: number): Promise<PlatformRun[]> {
    const out: PlatformRun[] = [];
    for (let page = 1; page <= 1000; page++) {
      const r = await this.call(
        "GET",
        `/api/v1/campaign/${id}/runs?page=${page}&limit=100`,
        runsPage,
      );
      out.push(...r.runs);
      if (page >= r.total_pages || r.runs.length === 0) break;
    }
    return out;
  }

  /** Places one call on a published workflow. The platform has no idempotency key: callers dedupe via runs. */
  async triggerCall(c: TriggerCall): Promise<{ runId: number }> {
    const r = await this.call(
      "POST",
      `/api/v1/public/agent/workflow/${encodeURIComponent(c.workflowUuid)}`,
      z.object({ status: z.string(), workflow_run_id: z.number().int() }),
      {
        phone_number: c.phoneE164,
        initial_context: c.initialContext,
        telephony_configuration_id: c.telephonyConfigId ?? null,
      },
    );
    return { runId: r.workflow_run_id };
  }

  /** Newest runs of a workflow first. */
  async listWorkflowRuns(workflowId: number, limit: number): Promise<PlatformRun[]> {
    const r = await this.call(
      "GET",
      `/api/v1/workflow/${workflowId}/runs?page=1&limit=${limit}&sort_by=created_at&sort_order=desc`,
      runsPage,
    );
    return r.runs;
  }

  getWorkflowRun(workflowId: number, runId: number): Promise<PlatformRun> {
    return this.call("GET", `/api/v1/workflow/${workflowId}/runs/${runId}`, platformRun);
  }

  // ---- plumbing ----

  private async withTimeout(fn: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fn(controller.signal);
    } catch (e) {
      if (e instanceof PlatformError) throw e;
      if (e instanceof Error && e.name === "AbortError")
        throw new PlatformError("UNAVAILABLE", "The calling platform timed out", true);
      throw new PlatformError("UNAVAILABLE", "The calling platform is unreachable", true);
    } finally {
      clearTimeout(t);
    }
  }

  private async call<T>(
    method: "GET" | "POST",
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const res = await this.withTimeout((signal) =>
      this.doFetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "X-API-Key": this.apiKey,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      }),
    );
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) throw httpError(res.status, detailOf(json));
    const parsed = schema.safeParse(json);
    if (!parsed.success)
      throw new PlatformError(
        "UNAVAILABLE",
        "The calling platform returned an unexpected response",
        false,
        res.status,
      );
    return parsed.data;
  }
}

/** Tenant-visible text must never name the provider. */
export const scrub = (s: string) => s.replace(/dograh|godrah/gi, "calling platform");

/** Pulls a human message out of FastAPI-style errors ({detail} or {error:{message}}). */
function detailOf(json: unknown): string {
  if (json && typeof json === "object") {
    const o = json as { detail?: unknown; error?: { message?: unknown } };
    if (typeof o.detail === "string") return scrub(o.detail);
    if (Array.isArray(o.detail) && o.detail[0] && typeof o.detail[0] === "object") {
      const m = (o.detail[0] as { msg?: unknown }).msg;
      if (typeof m === "string") return scrub(m);
    }
    if (typeof o.error?.message === "string") return scrub(o.error.message);
  }
  return "The calling platform rejected the request";
}

function httpError(status: number, message: string): PlatformError {
  if (status === 401 || status === 403)
    return new PlatformError("AUTH", "The calling platform rejected the API key", false, status);
  if (status === 404) return new PlatformError("NOT_FOUND", message, false, status);
  if (status === 408 || status === 429 || status >= 500)
    return new PlatformError(
      "UNAVAILABLE",
      "The calling platform is temporarily unavailable",
      true,
      status,
    );
  return new PlatformError("REJECTED", message, false, status);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An AI agent stores the platform workflow as either its numeric id or its UUID (both are shown in the platform).
 * Returns both, or null when the platform has no such active workflow.
 */
export async function resolveWorkflow(
  platform: Pick<CallPlatform, "listWorkflows">,
  ref: string,
): Promise<{ id: number; uuid: string } | null> {
  const trimmed = ref.trim();
  const workflows = await platform.listWorkflows();
  const wf = UUID_RE.test(trimmed)
    ? workflows.find((w) => w.workflow_uuid?.toLowerCase() === trimmed.toLowerCase())
    : /^\d+$/.test(trimmed)
      ? workflows.find((w) => w.id === Number(trimmed))
      : undefined;
  return wf?.workflow_uuid ? { id: wf.id, uuid: wf.workflow_uuid } : null;
}
