/**
 * Campaign service: CRUD + state machine. The CRM is the ONLY place campaigns are created; every state change
 * is mirrored to the calling platform by the campaign.* jobs (engine.ts), enqueued in the same transaction.
 */
import { sql } from "kysely";
import {
  campaignLeadFilter,
  campaignSchedule,
  campaignStatus,
  CAMPAIGN_WAVE_STATES,
  type Campaign,
  type CampaignAction,
  type CampaignPlatformOptions,
  type CampaignStatus,
  type CreateCampaignBody,
} from "@vernacular/contracts";
import type { Json, Tx } from "@vernacular/db";
import { PlatformError, type CampaignPlatform } from "@vernacular/integration-dograh";
import { AppError, notFound, validation } from "../../errors.js";
import { audit } from "../../lib/audit.js";
import type { JobQueue } from "../../jobs/queue.js";
import type { AuthContext } from "../../types.js";
import { campaignControlJob, campaignStartJob } from "./jobs.js";
import { readCircuitBreaker, readRetry } from "./settings.js";

const DEFAULT_SCHEDULE = {
  days: [1, 2, 3, 4, 5],
  windowStart: "10:00",
  windowEnd: "18:00",
};

/** action → [allowed from, to] */
export const TRANSITIONS: Record<CampaignAction, { from: CampaignStatus[]; to: CampaignStatus }> = {
  start: { from: ["draft"], to: "running" },
  pause: { from: ["running"], to: "paused" },
  resume: { from: ["paused"], to: "running" },
  stop: { from: ["running", "paused"], to: "stopped" },
};

/** The platform's messages are already tenant-safe (scrubbed in the client); map the code to an HTTP status. */
export function platformHttpError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof PlatformError) {
    if (e.code === "AUTH") return new AppError(502, "PLATFORM_AUTH", e.message);
    if (e.code === "REJECTED") return new AppError(422, "PLATFORM_REJECTED", e.message);
    return new AppError(502, "PLATFORM_UNAVAILABLE", e.message);
  }
  return new AppError(502, "PLATFORM_UNAVAILABLE", "The calling platform could not be reached");
}

type Row = Awaited<ReturnType<typeof loadRows>>[number];

function loadRows(tx: Tx, ids?: string[], page = 1, limit = 20) {
  let q = tx
    .selectFrom("campaign as c")
    .leftJoin("ai_agent as a", "a.id", "c.ai_agent_id")
    .selectAll("c")
    .select("a.display_name as agent_name");
  if (ids) q = q.where("c.id", "in", ids);
  return q
    .orderBy("c.created_at", "desc")
    .orderBy("c.id", "desc")
    .limit(limit)
    .offset((page - 1) * limit)
    .execute();
}

async function decorate(tx: Tx, rows: Row[]): Promise<Campaign[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const counts = await sql<{
    campaign_id: string;
    total: number;
    skipped: number;
    pending: number;
    dialed: number;
    connected: number;
    failed: number;
  }>`
    select cl.campaign_id,
           count(*)::int as total,
           count(*) filter (where cl.status = 'skipped')::int as skipped,
           count(*) filter (where cl.status in ('pending', 'dialing'))::int as pending,
           count(ca.dograh_run_id)::int as dialed,
           count(*) filter (where ca.status = 'completed')::int as connected,
           count(*) filter (where cl.status = 'failed'
                               or ca.status in ('failed', 'no_answer', 'busy', 'rejected'))::int as failed
      from campaign_lead cl
      left join call_attempt ca on ca.id = cl.call_attempt_id
     where cl.campaign_id in (${sql.join(ids)})
     group by cl.campaign_id`.execute(tx);
  const byId = new Map(counts.rows.map((r) => [r.campaign_id, r]));
  const waves = await tx
    .selectFrom("campaign_wave")
    .selectAll()
    .where("campaign_id", "in", ids)
    .orderBy("wave_no")
    .execute();

  return rows.map((row) => {
    const p = byId.get(row.id);
    return {
      id: row.id,
      name: row.name,
      status: campaignStatus.parse(row.status),
      workflow: {
        id: row.provider_workflow_id ?? 0,
        name: row.provider_workflow_name ?? "—",
      },
      telephonyConfigId: row.provider_telephony_config_id,
      aiAgent: row.ai_agent_id
        ? { id: row.ai_agent_id, displayName: row.agent_name ?? "AI agent" }
        : null,
      leadFilter: campaignLeadFilter.parse(row.lead_filter ?? {}),
      scheduleEnabled: row.schedule_enabled,
      schedule: campaignSchedule.safeParse(row.schedule).data ?? DEFAULT_SCHEDULE,
      maxConcurrent: row.max_concurrent,
      batchSize: row.batch_size,
      retry: readRetry(row.retry_config),
      circuitBreaker: readCircuitBreaker(row.circuit_breaker),
      progress: {
        total: p?.total ?? 0,
        dialed: p?.dialed ?? 0,
        connected: p?.connected ?? 0,
        failed: p?.failed ?? 0,
        pending: p?.pending ?? 0,
        skipped: p?.skipped ?? 0,
      },
      waves: waves
        .filter((w) => w.campaign_id === row.id)
        .map((w) => ({
          waveNo: w.wave_no,
          state: (CAMPAIGN_WAVE_STATES as readonly string[]).includes(w.state)
            ? (w.state as (typeof CAMPAIGN_WAVE_STATES)[number])
            : "running",
          totalRows: w.total_rows,
          processedRows: w.processed_rows,
          failedRows: w.failed_rows,
          startedAt: w.started_at?.toISOString() ?? null,
          completedAt: w.completed_at?.toISOString() ?? null,
        })),
      lastError: row.last_error,
      lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  });
}

/** Checks the chosen workflow / telephony configuration exist on the platform; returns the workflow name. */
async function verifyPlatformChoice(
  platform: CampaignPlatform,
  workflowId: number,
  telephonyConfigId: number | null,
): Promise<string> {
  let workflows, configs;
  try {
    [workflows, configs] = await Promise.all([
      platform.listWorkflows(),
      telephonyConfigId === null ? Promise.resolve([]) : platform.listTelephonyConfigs(),
    ]);
  } catch (e) {
    throw platformHttpError(e);
  }
  const wf = workflows.find((w) => w.id === workflowId);
  if (!wf)
    throw validation("That workflow is not available any more. Pick another one.", {
      field: "workflowId",
    });
  if (telephonyConfigId !== null && !configs.some((c) => c.id === telephonyConfigId))
    throw validation("That telephony configuration is not available any more.", {
      field: "telephonyConfigId",
    });
  return wf.name;
}

async function assertAgent(tx: Tx, agentId: string | null) {
  if (!agentId) return;
  const a = await tx
    .selectFrom("ai_agent")
    .select("id")
    .where("id", "=", agentId)
    .executeTakeFirst();
  if (!a)
    throw validation("Choose an AI agent from your institution", {
      field: "aiAgentId",
    });
}

export const campaignService = {
  async list(tx: Tx, page: number, limit: number): Promise<Campaign[]> {
    return decorate(tx, await loadRows(tx, undefined, page, limit));
  },

  async get(tx: Tx, id: string): Promise<Campaign> {
    const rows = await loadRows(tx, [id], 1, 1);
    const [c] = await decorate(tx, rows);
    if (!c) throw notFound("Campaign");
    return c;
  },

  async platformOptions(platform: CampaignPlatform): Promise<CampaignPlatformOptions> {
    try {
      const [workflows, configs, defaults] = await Promise.all([
        platform.listWorkflows(),
        platform.listTelephonyConfigs(),
        platform.getCampaignDefaults(),
      ]);
      return {
        workflows: workflows.map((w) => ({ id: w.id, name: w.name })),
        telephonyConfigs: configs.map((c) => ({
          id: c.id,
          name: c.name,
          isDefault: c.is_default_outbound,
          phoneNumberCount: c.phone_number_count,
        })),
        defaults: {
          maxConcurrent: defaults.default_max_concurrency,
          concurrentCallLimit: defaults.concurrent_call_limit,
          retry: {
            enabled: defaults.default_retry_config.enabled,
            maxRetries: defaults.default_retry_config.max_retries,
            retryDelaySeconds: defaults.default_retry_config.retry_delay_seconds,
            onBusy: defaults.default_retry_config.retry_on_busy,
            onNoAnswer: defaults.default_retry_config.retry_on_no_answer,
            onVoicemail: defaults.default_retry_config.retry_on_voicemail,
          },
        },
      };
    } catch (e) {
      throw platformHttpError(e);
    }
  },

  async create(tx: Tx, auth: AuthContext, body: CreateCampaignBody, platform: CampaignPlatform) {
    await assertAgent(tx, body.aiAgentId);
    const workflowName = await verifyPlatformChoice(
      platform,
      body.workflowId,
      body.telephonyConfigId,
    );
    const row = await tx
      .insertInto("campaign")
      .values({
        tenant_id: auth.tenantId,
        name: body.name,
        ai_agent_id: body.aiAgentId,
        provider_workflow_id: body.workflowId,
        provider_workflow_name: workflowName,
        provider_telephony_config_id: body.telephonyConfigId,
        lead_filter: body.leadFilter as Json,
        schedule: body.schedule as Json,
        schedule_enabled: body.scheduleEnabled,
        max_concurrent: body.maxConcurrent,
        batch_size: body.batchSize,
        retry_config: body.retry as Json,
        circuit_breaker: body.circuitBreaker as Json,
        status: "draft",
        created_by: auth.userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await audit(tx, auth, {
      action: "campaign.create",
      entity: "campaign",
      entityId: row.id,
      diff: body,
    });
    return campaignService.get(tx, row.id);
  },

  /** Draft: everything. Paused: settings for the NEXT waves (membership is fixed once started). */
  async patch(
    tx: Tx,
    auth: AuthContext,
    id: string,
    body: Partial<CreateCampaignBody>,
    platform: CampaignPlatform,
  ) {
    const cur = await tx
      .selectFrom("campaign")
      .selectAll()
      .where("id", "=", id)
      .forUpdate()
      .executeTakeFirst();
    if (!cur) throw notFound("Campaign");
    if (cur.status !== "draft" && cur.status !== "paused")
      throw new AppError(409, "CAMPAIGN_RUNNING", "Only draft or paused campaigns can be edited");
    if (cur.status === "paused" && (body.leadFilter !== undefined || body.batchSize !== undefined))
      throw new AppError(
        409,
        "CAMPAIGN_STARTED",
        "Leads and wave size are fixed once a campaign has started",
      );

    const set: Record<string, unknown> = {};
    if (body.name !== undefined) set.name = body.name;
    if (body.aiAgentId !== undefined) {
      await assertAgent(tx, body.aiAgentId);
      set.ai_agent_id = body.aiAgentId;
    }
    if (body.workflowId !== undefined || body.telephonyConfigId !== undefined) {
      const wf = body.workflowId ?? cur.provider_workflow_id;
      if (wf === null) throw validation("Choose a workflow", { field: "workflowId" });
      const tc =
        body.telephonyConfigId !== undefined
          ? body.telephonyConfigId
          : cur.provider_telephony_config_id;
      set.provider_workflow_name = await verifyPlatformChoice(platform, wf, tc);
      set.provider_workflow_id = wf;
      set.provider_telephony_config_id = tc;
    }
    if (body.leadFilter !== undefined) set.lead_filter = body.leadFilter;
    if (body.schedule !== undefined) set.schedule = body.schedule;
    if (body.scheduleEnabled !== undefined) set.schedule_enabled = body.scheduleEnabled;
    if (body.maxConcurrent !== undefined) set.max_concurrent = body.maxConcurrent;
    if (body.batchSize !== undefined) set.batch_size = body.batchSize;
    if (body.retry !== undefined) set.retry_config = body.retry;
    if (body.circuitBreaker !== undefined) set.circuit_breaker = body.circuitBreaker;
    if (Object.keys(set).length > 0) {
      await tx
        .updateTable("campaign")
        .set(set as never)
        .where("id", "=", id)
        .execute();
      await audit(tx, auth, {
        action: "campaign.update",
        entity: "campaign",
        entityId: id,
        diff: body,
      });
    }
    return campaignService.get(tx, id);
  },

  /** Validated state change + the job that mirrors it to the platform, in ONE transaction. */
  async act(tx: Tx, auth: AuthContext, jobs: JobQueue, id: string, action: CampaignAction) {
    const cur = await tx
      .selectFrom("campaign")
      .select(["id", "status", "provider_workflow_id"])
      .where("id", "=", id)
      .forUpdate()
      .executeTakeFirst();
    if (!cur) throw notFound("Campaign");
    const t = TRANSITIONS[action];
    if (!t.from.includes(cur.status as CampaignStatus))
      throw new AppError(409, "INVALID_TRANSITION", `A ${cur.status} campaign can't ${action}`);
    if (action === "start" && cur.provider_workflow_id === null)
      throw validation("Choose a workflow before starting", {
        field: "workflowId",
      });

    await tx
      .updateTable("campaign")
      .set({ status: t.to, last_error: null })
      .where("id", "=", id)
      .execute();
    const payload = { tenantId: auth.tenantId, campaignId: id };
    if (action === "start")
      await jobs.enqueueInTx(tx, campaignStartJob, payload, {
        singletonKey: `campaign-start:${id}`,
      });
    else await jobs.enqueueInTx(tx, campaignControlJob, { ...payload, action });
    await audit(tx, auth, {
      action: `campaign.${action}`,
      entity: "campaign",
      entityId: id,
      diff: { from: cur.status, to: t.to },
    });
    return campaignService.get(tx, id);
  },
};
