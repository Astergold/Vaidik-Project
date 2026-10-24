/**
 * Campaign engine: CRM campaign → calling-platform campaigns, one per wave of batch_size leads.
 *
 *   prepareWave   (one tx, campaign row locked)  snapshot members once → policy-check the next wave's leads →
 *                 reserve one call_attempt per callable lead (status 'dialing', the one-active-call index makes
 *                 a parallel ad-hoc dial skip) → campaign_wave row 'pending'
 *   pushWave      (no tx held)                   CSV upload → create platform campaign (find-by-name first, so a
 *                 crash after create never makes a second one) → start → save provider id
 *   syncCampaign  (poll)                         platform state + runs → call_attempt / campaign_lead / stage;
 *                 a finished wave dispatches the next one; all members terminal → campaign completed
 *
 * Every step is idempotent: re-running after a crash continues where it stopped and never uploads a lead twice.
 */
import { sql } from "kysely";
import type { Tx } from "@vernacular/db";
import { campaignLeadFilter, campaignSchedule, type PolicyRejectCode } from "@vernacular/contracts";
import { PlatformError, type CampaignPlatform } from "@vernacular/integration-dograh";
import { evaluate } from "@vernacular/policy";
import type { JobContext } from "../../jobs/define.js";
import { loadPolicyFacts, loadTenantPolicy } from "../policy/facts.js";
import { findMatchingLeadIds } from "../leads/repo.js";
import { CLOSED_STAGES, moveStage } from "../leads/stage.js";
import { buildInitialContext } from "../calls/context.js";
import {
  buildWaveCsv,
  CAMPAIGN_STOP_CODES,
  isSkipCode,
  runOutcome,
  toPlatformCircuitBreaker,
  toPlatformRetry,
  toPlatformSchedule,
  waveStateOf,
  type WaveCsvRow,
} from "./mapping.js";
import { readCircuitBreaker, readRetry } from "./settings.js";

/** talk time above which a call counts as "connected" (handbook §7.1) */
const CONNECTED_AFTER_S = 15;
const ACTIVE_CAMPAIGN = ["running", "paused"] as const;

/** Stable, human-readable platform campaign name; also the recovery key after a crash. */
export const waveName = (campaignName: string, campaignId: string, waveNo: number) =>
  `${campaignName.slice(0, 200)} · wave ${waveNo} [${campaignId.slice(-8)}]`;

async function platformFor(ctx: JobContext): Promise<CampaignPlatform> {
  if (!ctx.deps.platform) throw new Error("worker has no calling-platform resolver configured");
  return ctx.deps.platform(ctx.tenantId);
}

const safeMessage = (e: unknown) =>
  e instanceof PlatformError ? e.message : "Unexpected problem talking to the calling platform";

async function setCampaignError(
  ctx: JobContext,
  campaignId: string,
  message: string | null,
  pause = false,
) {
  await ctx.withTx((tx) =>
    tx
      .updateTable("campaign")
      .set({ last_error: message, ...(pause ? { status: "paused" } : {}) })
      .where("id", "=", campaignId)
      .execute(),
  );
}

// ---- snapshot ---------------------------------------------------------------------------------------

/** Members are snapshotted ONCE, at first start: matching leads, not closed, with no other active campaign. */
async function snapshotMembers(
  tx: Tx,
  campaign: { id: string; lead_filter: unknown; batch_size: number },
) {
  const existing = await tx
    .selectFrom("campaign_lead")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("campaign_id", "=", campaign.id)
    .executeTakeFirstOrThrow();
  if (Number(existing.n) > 0) return;

  const f = campaignLeadFilter.parse(campaign.lead_filter ?? {});
  const ids = await findMatchingLeadIds(tx, { ...f, scopeToUser: null });
  if (ids.length === 0) return;

  const busy = new Set(
    (
      await tx
        .selectFrom("campaign_lead as cl")
        .innerJoin("campaign as c", "c.id", "cl.campaign_id")
        .select("cl.lead_id")
        .where("c.status", "in", ACTIVE_CAMPAIGN)
        .where("c.id", "!=", campaign.id)
        .where("cl.status", "in", ["pending", "dialing"])
        .where("cl.lead_id", "in", ids)
        .execute()
    ).map((r) => r.lead_id),
  );
  const stages = new Map(
    (await tx.selectFrom("lead").select(["id", "stage"]).where("id", "in", ids).execute()).map(
      (r) => [r.id, r.stage],
    ),
  );
  const members = ids.filter((id) => !busy.has(id) && !CLOSED_STAGES.has(stages.get(id) as never));
  const tenant = await sql<{
    t: string;
  }>`select current_setting('app.tenant_id') as t`.execute(tx);
  const tenantId = tenant.rows[0]!.t;
  for (let i = 0; i < members.length; i += 500) {
    await tx
      .insertInto("campaign_lead")
      .values(
        members.slice(i, i + 500).map((leadId, j) => ({
          tenant_id: tenantId,
          campaign_id: campaign.id,
          lead_id: leadId,
          wave_no: Math.floor((i + j) / campaign.batch_size) + 1,
          status: "pending",
        })),
      )
      .onConflict((oc) => oc.columns(["campaign_id", "lead_id"]).doNothing())
      .execute();
  }
}

// ---- prepare ------------------------------------------------------------------------------------------

type Prepared =
  | { kind: "push"; waveNo: number }
  | { kind: "busy" } // a wave is still running on the platform
  | { kind: "completed" }
  | { kind: "stopped"; reason: string }
  | { kind: "inactive" };

/** Picks (and if needed builds) the wave to push. Safe to call any number of times. */
export async function prepareWave(
  ctx: JobContext,
  campaignId: string,
  now = new Date(),
): Promise<Prepared> {
  return ctx.withTx(async (tx): Promise<Prepared> => {
    const c = await tx
      .selectFrom("campaign")
      .selectAll()
      .where("id", "=", campaignId)
      .forUpdate()
      .executeTakeFirst();
    if (!c || c.status !== "running") return { kind: "inactive" };

    const open = await tx
      .selectFrom("campaign_wave")
      .select(["wave_no", "provider_campaign_id", "state"])
      .where("campaign_id", "=", campaignId)
      .where("state", "not in", ["completed", "failed"])
      .orderBy("wave_no")
      .executeTakeFirst();
    if (open)
      return open.provider_campaign_id === null
        ? { kind: "push", waveNo: open.wave_no }
        : { kind: "busy" };

    await snapshotMembers(tx, c);

    for (;;) {
      const next = await tx
        .selectFrom("campaign_lead")
        .select((eb) => eb.fn.min("wave_no").as("w"))
        .where("campaign_id", "=", campaignId)
        .where("status", "=", "pending")
        .executeTakeFirst();
      const waveNo = next?.w === null || next?.w === undefined ? null : Number(next.w);
      if (waveNo === null) {
        await tx
          .updateTable("campaign")
          .set({ status: "completed", last_error: null })
          .where("id", "=", campaignId)
          .execute();
        return { kind: "completed" };
      }

      const pending = await tx
        .selectFrom("campaign_lead")
        .select(["id", "lead_id"])
        .where("campaign_id", "=", campaignId)
        .where("wave_no", "=", waveNo)
        .where("status", "=", "pending")
        .orderBy("id")
        .execute();

      let reserved = 0;
      for (const m of pending) {
        const lead = await tx
          .selectFrom("lead")
          .select(["id", "stage"])
          .where("id", "=", m.lead_id)
          .forUpdate()
          .executeTakeFirst();
        const skip = async (reason: string) => {
          await tx
            .updateTable("campaign_lead")
            .set({ status: "skipped", skip_reason: reason })
            .where("id", "=", m.id)
            .execute();
          await tx
            .updateTable("lead")
            .set({ last_reject_code: reason, last_reject_at: now })
            .where("id", "=", m.lead_id)
            .execute();
        };
        if (!lead || CLOSED_STAGES.has(lead.stage as never)) {
          await tx
            .updateTable("campaign_lead")
            .set({ status: "skipped", skip_reason: "LEAD_CLOSED" })
            .where("id", "=", m.id)
            .execute();
          continue;
        }
        const { facts, subject } = await loadPolicyFacts(tx, lead.id, now);
        const decision = evaluate("dial", facts, now);
        if (!decision.allow) {
          const code: PolicyRejectCode = decision.code;
          if (CAMPAIGN_STOP_CODES.has(code)) {
            const reason =
              code === "WALLET_EMPTY"
                ? "Calling balance is empty. Top up, then resume the campaign."
                : "Your institution's calling is suspended.";
            await tx
              .updateTable("campaign")
              .set({ status: "paused", last_error: reason })
              .where("id", "=", campaignId)
              .execute();
            return { kind: "stopped", reason };
          }
          if (isSkipCode(code)) {
            await skip(code);
            continue;
          }
        }
        if (!subject.phone) {
          await skip("NO_PHONE");
          continue;
        }
        const ins = await sql<{ id: string }>`
          insert into call_attempt (tenant_id, lead_id, campaign_id, ai_agent_id, direction, status, dial_trigger, started_at)
          values (${c.tenant_id}, ${lead.id}, ${campaignId}, ${c.ai_agent_id}, 'outbound', 'dialing', 'campaign', null)
          on conflict (lead_id) where status in ('reserved', 'dialing', 'in_progress') do nothing
          returning id`.execute(tx);
        const attemptId = ins.rows[0]?.id;
        if (!attemptId) {
          await skip("CALL_IN_PROGRESS");
          continue;
        }
        await tx
          .updateTable("campaign_lead")
          .set({
            status: "dialing",
            call_attempt_id: attemptId,
            skip_reason: null,
          })
          .where("id", "=", m.id)
          .execute();
        await tx
          .updateTable("lead")
          .set({ last_reject_code: null, last_reject_at: null })
          .where("id", "=", lead.id)
          .execute();
        await moveStage(tx, {
          leadId: lead.id,
          to: "attempting",
          actor: "system",
          mode: "auto",
          reason: "campaign call queued",
        });
        reserved++;
      }

      if (reserved === 0) continue; // whole wave skipped: try the next one in the same transaction
      await tx
        .insertInto("campaign_wave")
        .values({
          tenant_id: c.tenant_id,
          campaign_id: campaignId,
          wave_no: waveNo,
          state: "pending",
          total_rows: reserved,
        })
        .onConflict((oc) => oc.columns(["campaign_id", "wave_no"]).doNothing())
        .execute();
      return { kind: "push", waveNo };
    }
  });
}

// ---- push ----------------------------------------------------------------------------------------------

/** Uploads the wave's call list and creates + starts its platform campaign. Idempotent via the wave name. */
export async function pushWave(ctx: JobContext, campaignId: string, waveNo: number): Promise<void> {
  const loaded = await ctx.withTx(async (tx) => {
    const c = await tx
      .selectFrom("campaign")
      .selectAll()
      .where("id", "=", campaignId)
      .executeTakeFirst();
    const wave = await tx
      .selectFrom("campaign_wave")
      .selectAll()
      .where("campaign_id", "=", campaignId)
      .where("wave_no", "=", waveNo)
      .executeTakeFirst();
    if (!c || !wave || wave.provider_campaign_id !== null || c.status !== "running") return null;
    const members = await tx
      .selectFrom("campaign_lead")
      .select(["lead_id", "call_attempt_id"])
      .where("campaign_id", "=", campaignId)
      .where("wave_no", "=", waveNo)
      .where("status", "=", "dialing")
      .orderBy("id")
      .execute();
    const rows: WaveCsvRow[] = [];
    for (const m of members) {
      const { subject } = await loadPolicyFacts(tx, m.lead_id, new Date());
      const ic = await buildInitialContext(tx, m.lead_id);
      rows.push({
        phone_number: subject.phone,
        lead_id: m.lead_id,
        call_attempt_id: m.call_attempt_id,
        crm_campaign_id: campaignId,
        person_name: ic.person_name,
        program: ic.program,
        language: ic.language,
      });
    }
    const tenant = await tx.selectFrom("tenant").select("timezone").executeTakeFirstOrThrow();
    const { policy } = await loadTenantPolicy(tx);
    const schedule = toPlatformSchedule(
      {
        enabled: c.schedule_enabled,
        schedule: campaignSchedule.parse(c.schedule),
      },
      policy,
      tenant.timezone,
    );
    return { c, rows, schedule };
  });
  if (!loaded) return;
  const { c, rows, schedule } = loaded;

  if (!schedule) {
    await failWave(
      ctx,
      campaignId,
      waveNo,
      "The campaign schedule has no overlap with your institution's calling hours.",
    );
    return;
  }
  if (c.provider_workflow_id === null) {
    await failWave(ctx, campaignId, waveNo, "Choose a workflow for this campaign.");
    return;
  }

  const name = waveName(c.name, campaignId, waveNo);
  let platformCampaignId: number;
  try {
    const platform = await platformFor(ctx);
    const existing = (await platform.listCampaigns()).find((p) => p.name === name);
    let created = existing;
    if (!created) {
      const fileKey = await platform.uploadCsv(
        `campaign-${campaignId}-wave-${waveNo}.csv`,
        buildWaveCsv(rows),
      );
      created = await platform.createCampaign({
        name,
        workflowId: c.provider_workflow_id,
        sourceFileKey: fileKey,
        telephonyConfigId: c.provider_telephony_config_id,
        maxConcurrency: c.max_concurrent,
        retry: toPlatformRetry(readRetry(c.retry_config)),
        schedule,
        circuitBreaker: toPlatformCircuitBreaker(readCircuitBreaker(c.circuit_breaker)),
      });
    }
    platformCampaignId = created.id;
    // Save the id BEFORE starting: if start fails we retry start, never create.
    await ctx.withTx((tx) =>
      tx
        .updateTable("campaign_wave")
        .set({
          provider_campaign_id: created.id,
          state: "created",
          total_rows: created.total_rows ?? rows.length,
        })
        .where("campaign_id", "=", campaignId)
        .where("wave_no", "=", waveNo)
        .execute(),
    );
    const startedState = waveStateOf(created.state);
    const started = startedState === "created" ? await platform.startCampaign(created.id) : created;
    await ctx.withTx(async (tx) => {
      await tx
        .updateTable("campaign_wave")
        .set({
          state: waveStateOf(started.state) === "created" ? "running" : waveStateOf(started.state),
          started_at: new Date(),
        })
        .where("campaign_id", "=", campaignId)
        .where("wave_no", "=", waveNo)
        .execute();
      await tx
        .updateTable("campaign")
        .set({ last_error: null, last_synced_at: new Date() })
        .where("id", "=", campaignId)
        .execute();
    });
  } catch (e) {
    if (e instanceof PlatformError && !e.retryable) {
      await failWave(ctx, campaignId, waveNo, safeMessage(e));
      return;
    }
    await setCampaignError(ctx, campaignId, safeMessage(e));
    throw e; // transient: the job retries and resumes from the saved state
  }
  ctx.log.info(
    { campaignId, waveNo, platformCampaignId, leads: rows.length },
    "campaign wave pushed",
  );
}

/** A wave the platform refused: its reserved calls fail with a typed reason and the campaign pauses for a human. */
async function failWave(ctx: JobContext, campaignId: string, waveNo: number, message: string) {
  await ctx.withTx(async (tx) => {
    await tx
      .updateTable("campaign_wave")
      .set({ state: "failed", last_error: message, completed_at: new Date() })
      .where("campaign_id", "=", campaignId)
      .where("wave_no", "=", waveNo)
      .execute();
    const members = await tx
      .selectFrom("campaign_lead")
      .select(["id", "call_attempt_id"])
      .where("campaign_id", "=", campaignId)
      .where("wave_no", "=", waveNo)
      .where("status", "=", "dialing")
      .execute();
    for (const m of members) {
      if (m.call_attempt_id)
        await tx
          .updateTable("call_attempt")
          .set({
            status: "failed",
            reject_code: "PLATFORM_REJECTED",
            ended_at: new Date(),
          })
          .where("id", "=", m.call_attempt_id)
          .where("dograh_run_id", "is", null)
          .execute();
      await tx
        .updateTable("campaign_lead")
        .set({ status: "failed", skip_reason: "PLATFORM_REJECTED" })
        .where("id", "=", m.id)
        .execute();
    }
    await tx
      .updateTable("campaign")
      .set({ status: "paused", last_error: message })
      .where("id", "=", campaignId)
      .execute();
  });
  ctx.log.warn({ campaignId, waveNo }, "campaign wave failed on the platform");
}

/** prepare + push until a wave is live, the campaign completes, or it stops. */
export async function dispatch(ctx: JobContext, campaignId: string): Promise<Prepared["kind"]> {
  const p = await prepareWave(ctx, campaignId);
  if (p.kind === "push") await pushWave(ctx, campaignId, p.waveNo);
  return p.kind;
}

// ---- sync ----------------------------------------------------------------------------------------------

/** Pulls platform state + runs into the CRM. Returns true while the campaign still needs polling. */
export async function syncCampaign(ctx: JobContext, campaignId: string): Promise<boolean> {
  const state = await ctx.withTx(async (tx) => {
    const c = await tx
      .selectFrom("campaign")
      .select(["status"])
      .where("id", "=", campaignId)
      .executeTakeFirst();
    const waves = await tx
      .selectFrom("campaign_wave")
      .select(["wave_no", "provider_campaign_id", "state"])
      .where("campaign_id", "=", campaignId)
      .where("provider_campaign_id", "is not", null)
      .where("state", "in", ["created", "running", "paused"])
      .execute();
    return { status: c?.status ?? null, waves };
  });
  if (!state.status) return false;

  let platform: CampaignPlatform | null = null;
  try {
    for (const w of state.waves) {
      platform ??= await platformFor(ctx);
      const pc = await platform.getCampaign(w.provider_campaign_id!);
      const runs = await platform.listAllRuns(w.provider_campaign_id!);
      const waveState = waveStateOf(pc.state);
      await ctx.withTx(async (tx) => {
        for (const run of runs) await applyRun(tx, campaignId, run);
        const finished = waveState === "completed" || waveState === "failed";
        if (finished) await closeWave(tx, campaignId, w.wave_no);
        await tx
          .updateTable("campaign_wave")
          .set({
            state: waveState === "created" ? "running" : waveState,
            total_rows: pc.total_rows ?? 0,
            processed_rows: pc.processed_rows,
            failed_rows: pc.failed_rows,
            ...(finished
              ? {
                  completed_at: pc.completed_at ? new Date(pc.completed_at) : new Date(),
                }
              : {}),
          })
          .where("campaign_id", "=", campaignId)
          .where("wave_no", "=", w.wave_no)
          .execute();
      });
    }
    await setCampaignError(ctx, campaignId, null);
    await ctx.withTx((tx) =>
      tx
        .updateTable("campaign")
        .set({ last_synced_at: new Date() })
        .where("id", "=", campaignId)
        .execute(),
    );
  } catch (e) {
    await setCampaignError(ctx, campaignId, safeMessage(e));
    throw e;
  }

  const after = await ctx.withTx(async (tx) => {
    const c = await tx
      .selectFrom("campaign")
      .select("status")
      .where("id", "=", campaignId)
      .executeTakeFirst();
    const live = await tx
      .selectFrom("campaign_wave")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("campaign_id", "=", campaignId)
      .where("state", "not in", ["completed", "failed"])
      .executeTakeFirstOrThrow();
    return { status: c?.status, live: Number(live.n) };
  });
  if (after.status === "running" && after.live === 0) {
    const next = await dispatch(ctx, campaignId); // previous wave done → next wave (or completed)
    return next !== "completed" && next !== "inactive";
  }
  return after.status === "running" || after.status === "paused" || after.live > 0;
}

const TERMINAL = new Set(["completed", "failed", "no_answer", "busy", "rejected"]);

/** One platform run → its call_attempt (matched by the call_attempt_id we put in the CSV). Idempotent. */
/** One campaign run → its call_attempt (matched by the call_attempt_id we put in the CSV). Idempotent. */
export async function applyRun(tx: Tx, campaignId: string, run: Parameters<typeof runOutcome>[0]) {
  const o = runOutcome(run);
  if (!o.callAttemptId || !/^[0-9a-f-]{36}$/i.test(o.callAttemptId)) return;
  const a = await tx
    .selectFrom("call_attempt")
    .select(["id", "dograh_run_id"])
    .where("id", "=", o.callAttemptId)
    .where("campaign_id", "=", campaignId)
    .executeTakeFirst();
  if (!a) return;
  // A retry by the platform is a NEW run for the same row: keep the latest run's result.
  if (a.dograh_run_id && a.dograh_run_id !== String(run.id) && Number(a.dograh_run_id) > run.id)
    return;
  const ended = await applyRunToAttempt(tx, a.id, run, String(run.id));
  if (ended)
    await tx
      .updateTable("campaign_lead")
      .set({ status: o.status === "completed" ? "done" : "failed" })
      .where("campaign_id", "=", campaignId)
      .where("call_attempt_id", "=", a.id)
      .execute();
}

/**
 * Writes one platform run's result onto a call_attempt (status, duration, disposition, times) and moves the lead to
 * "connected" for talk > 15 s. Shared by campaign sync and single-call sync. Idempotent; returns true once ended.
 */
export async function applyRunToAttempt(
  tx: Tx,
  attemptId: string,
  run: Parameters<typeof runOutcome>[0],
  runRef: string,
): Promise<boolean> {
  const o = runOutcome(run);
  const a = await tx
    .selectFrom("call_attempt")
    .select(["id", "lead_id", "status", "dograh_run_id"])
    .where("id", "=", attemptId)
    .forUpdate()
    .executeTakeFirst();
  if (!a) return false;
  if (TERMINAL.has(a.status) && a.dograh_run_id === runRef) return true; // already applied
  const startedAt = new Date(run.created_at);
  const ended = o.status !== "in_progress";
  await tx
    .updateTable("call_attempt")
    .set({
      dograh_run_id: runRef,
      status: o.status,
      disposition: o.disposition,
      duration_s: o.durationS,
      started_at: startedAt,
      ended_at: ended ? new Date(startedAt.getTime() + (o.durationS ?? 0) * 1000) : null,
    })
    .where("id", "=", a.id)
    .execute();
  if (o.status === "completed" && (o.durationS ?? 0) > CONNECTED_AFTER_S)
    await moveStage(tx, {
      leadId: a.lead_id,
      to: "connected",
      actor: "system",
      mode: "auto",
      reason: "call connected",
    });
  return ended;
}

/** After the platform finishes a wave, calls it never placed are closed so the lead can be called again later. */
async function closeWave(tx: Tx, campaignId: string, waveNo: number) {
  const left = await tx
    .selectFrom("campaign_lead")
    .select(["id", "call_attempt_id"])
    .where("campaign_id", "=", campaignId)
    .where("wave_no", "=", waveNo)
    .where("status", "=", "dialing")
    .execute();
  for (const m of left) {
    if (m.call_attempt_id)
      await tx
        .updateTable("call_attempt")
        .set({
          status: "failed",
          reject_code: "NOT_DIALED",
          ended_at: new Date(),
        })
        .where("id", "=", m.call_attempt_id)
        .where("status", "in", ["dialing", "in_progress"])
        .execute();
    await tx
      .updateTable("campaign_lead")
      .set({ status: "failed", skip_reason: "NOT_DIALED" })
      .where("id", "=", m.id)
      .execute();
  }
}

// ---- pause / resume / stop ---------------------------------------------------------------------------

export async function controlCampaign(
  ctx: JobContext,
  campaignId: string,
  action: "pause" | "resume" | "stop",
) {
  const waves = await ctx.withTx((tx) =>
    tx
      .selectFrom("campaign_wave")
      .select(["wave_no", "provider_campaign_id", "state"])
      .where("campaign_id", "=", campaignId)
      .where("provider_campaign_id", "is not", null)
      .where("state", "in", ["created", "running", "paused"])
      .execute(),
  );
  try {
    const platform = waves.length ? await platformFor(ctx) : null;
    for (const w of waves) {
      const id = w.provider_campaign_id!;
      const res =
        action === "resume"
          ? w.state === "paused"
            ? await platform!.resumeCampaign(id)
            : null
          : w.state === "paused"
            ? null
            : await platform!.pauseCampaign(id);
      if (res)
        await ctx.withTx((tx) =>
          tx
            .updateTable("campaign_wave")
            .set({
              state: waveStateOf(res.state) === "created" ? "running" : waveStateOf(res.state),
            })
            .where("campaign_id", "=", campaignId)
            .where("wave_no", "=", w.wave_no)
            .execute(),
        );
    }
  } catch (e) {
    await setCampaignError(ctx, campaignId, safeMessage(e));
    throw e;
  }

  if (action === "stop") {
    // collect the results of calls already placed, then release everyone not yet called
    await syncCampaign(ctx, campaignId).catch(() => undefined);
    await ctx.withTx(async (tx) => {
      await tx
        .updateTable("campaign_lead")
        .set({ status: "skipped", skip_reason: "CAMPAIGN_STOPPED" })
        .where("campaign_id", "=", campaignId)
        .where("status", "=", "pending")
        .execute();
      const left = await tx
        .selectFrom("campaign_lead")
        .select(["id", "call_attempt_id"])
        .where("campaign_id", "=", campaignId)
        .where("status", "=", "dialing")
        .execute();
      for (const m of left) {
        if (m.call_attempt_id)
          await tx
            .updateTable("call_attempt")
            .set({
              status: "failed",
              reject_code: "CAMPAIGN_STOPPED",
              ended_at: new Date(),
            })
            .where("id", "=", m.call_attempt_id)
            .where("dograh_run_id", "is", null)
            .execute();
        await tx
          .updateTable("campaign_lead")
          .set({ status: "skipped", skip_reason: "CAMPAIGN_STOPPED" })
          .where("id", "=", m.id)
          .execute();
      }
      await tx
        .updateTable("campaign_wave")
        .set({ state: "completed", completed_at: new Date() })
        .where("campaign_id", "=", campaignId)
        .where("state", "not in", ["completed", "failed"])
        .execute();
    });
    return;
  }
  await setCampaignError(ctx, campaignId, null);
  if (action === "resume") await dispatch(ctx, campaignId);
}
