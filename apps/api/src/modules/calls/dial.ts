import { z } from "zod";
import { sql } from "kysely";
import type { Tx } from "@vernacular/db";
import type { PolicyRejectCode } from "@vernacular/contracts";
import { evaluate } from "@vernacular/policy";
import { defineJob, type JobContext } from "../../jobs/define.js";
import { loadPolicyFacts } from "../policy/facts.js";
import { CLOSED_STAGES, moveStage } from "../leads/stage.js";
import { buildInitialContext } from "./context.js";
import { DialerError, type VoiceDialer } from "./dialer.js";
import { scheduleRunSync } from "./sync.js";

export const DIAL_TRIGGERS = [
  "intake",
  "call_now",
  "campaign",
  "callback",
  "planner",
  "retry",
] as const;
export type DialTrigger = (typeof DIAL_TRIGGERS)[number];

export const dialPayload = z.object({
  tenantId: z.uuid(),
  leadId: z.uuid(),
  trigger: z.enum(DIAL_TRIGGERS).default("intake"),
  campaignId: z.uuid().optional(),
});
export type DialPayload = z.infer<typeof dialPayload>;

/** A reservation younger than this, made by a DIFFERENT job, means "someone is dialling right now". */
export const FRESH_RESERVATION_MS = 45_000;
/** A reservation older than this is not resumed (provider idempotency keys may have expired): it is failed. */
export const ABANDON_RESERVATION_MS = 6 * 3600_000;
/** Rejections worth retrying later (the engine supplies when). Others need a human or a state change. */
const RETRY_CODES: ReadonlySet<PolicyRejectCode> = new Set([
  "OUTSIDE_WINDOW",
  "TOO_SOON",
  "CAP_REACHED",
]);

export type DialOutcome =
  | { status: "dialed"; attemptId: string; runId: string }
  | { status: "rejected"; code: PolicyRejectCode; retryAt?: Date; rescheduled: boolean }
  | { status: "skipped"; reason: "LEAD_NOT_FOUND" | "LEAD_CLOSED" | "ALREADY_ACTIVE" }
  | { status: "failed"; code: string; attemptId?: string };

export interface DialDeps {
  dialer: VoiceDialer;
  now?: () => Date;
}

/** Test seam: lets a test simulate a worker dying between "reserved" and "provider called". */
export interface DialHooks {
  afterReserve?: (attemptId: string) => void | Promise<void>;
}

type Plan =
  | { kind: "done"; outcome: DialOutcome }
  | {
      kind: "dial";
      attemptId: string;
      request: { workflowId: string; phoneE164: string; initialContext: Record<string, unknown> };
    };

async function recordReject(tx: Tx, leadId: string, code: string, now: Date) {
  await tx
    .updateTable("lead")
    .set({ last_reject_code: code, last_reject_at: now })
    .where("id", "=", leadId)
    .execute();
}

async function failAttempt(tx: Tx, attemptId: string, leadId: string, code: string, now: Date) {
  await tx
    .updateTable("call_attempt")
    .set({ status: "failed", reject_code: code, ended_at: now })
    .where("id", "=", attemptId)
    .where("status", "=", "reserved")
    .execute();
  await recordReject(tx, leadId, code, now);
}

/**
 * RESERVE-THEN-DIAL (handbook flow A, D3-I2-03).
 *
 *  Phase 1 (one short transaction, lead row locked):
 *     load facts -> policy.evaluate -> INSERT call_attempt 'reserved' (partial unique index = one active call per lead) -> COMMIT
 *  Phase 2 (no transaction held): provider initiate-call with Idempotency-Key = call_attempt.id
 *  Phase 3 (short transaction): status 'dialing' + provider run id
 *
 * If the worker dies after phase 1, pg-boss re-delivers the SAME job; it finds its own reservation (dial_job_id),
 * re-checks the policy, and resumes with the SAME idempotency key, so the provider can never place a second call.
 * A reservation made by a different, recent job is respected (CALL_IN_PROGRESS) and left alone.
 */
export async function runDial(
  deps: DialDeps,
  ctx: JobContext,
  data: DialPayload,
  hooks: DialHooks = {},
): Promise<DialOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const apiKey =
    (await ctx.secrets.getSecret(ctx.tenantId, "dograh_api_key")) ??
    ctx.deps.globalPlatformKey ??
    null;

  const plan = await ctx.withTx(async (tx): Promise<Plan> => {
    const lead = await tx
      .selectFrom("lead")
      .select(["id", "stage", "ai_agent_id"])
      .where("id", "=", data.leadId)
      .forUpdate()
      .executeTakeFirst();
    if (!lead) return { kind: "done", outcome: { status: "skipped", reason: "LEAD_NOT_FOUND" } };
    if (CLOSED_STAGES.has(lead.stage as never))
      return { kind: "done", outcome: { status: "skipped", reason: "LEAD_CLOSED" } };

    // ---- existing active attempts ------------------------------------------------------------
    const active = await tx
      .selectFrom("call_attempt")
      .select(["id", "status", "dial_job_id", "created_at"])
      .where("lead_id", "=", lead.id)
      .where("status", "in", ["reserved", "dialing", "in_progress"])
      .forUpdate()
      .execute();
    let resumable: { id: string } | null = null;
    for (const a of active) {
      const age = now.getTime() - a.created_at.getTime();
      if (a.status !== "reserved")
        return { kind: "done", outcome: { status: "skipped", reason: "ALREADY_ACTIVE" } };
      if (age > ABANDON_RESERVATION_MS) {
        await failAttempt(tx, a.id, lead.id, "ABANDONED", now); // too old to resume safely; start fresh below
      } else if (a.dial_job_id === ctx.jobId || age > FRESH_RESERVATION_MS) {
        resumable = a;
      } else {
        return { kind: "done", outcome: { status: "skipped", reason: "ALREADY_ACTIVE" } };
      }
    }

    // ---- policy ---------------------------------------------------------------------------------
    const { facts, subject } = await loadPolicyFacts(tx, lead.id, now, {
      ignoreAttemptId: resumable?.id ?? null,
    });
    const decision = evaluate("dial", facts, now);
    if (!decision.allow) {
      if (decision.code === "CALL_IN_PROGRESS")
        return { kind: "done", outcome: { status: "skipped", reason: "ALREADY_ACTIVE" } };
      if (resumable) await failAttempt(tx, resumable.id, lead.id, decision.code, now);
      await recordReject(tx, lead.id, decision.code, now);
      let rescheduled = false;
      if (decision.retryAt && RETRY_CODES.has(decision.code) && data.trigger !== "call_now") {
        await ctx.jobs.enqueueInTx(
          tx,
          dialJob,
          {
            tenantId: ctx.tenantId,
            leadId: lead.id,
            trigger: "retry",
            campaignId: data.campaignId,
          },
          {
            startAfter: decision.retryAt,
            singletonKey: `dial:${lead.id}:${decision.retryAt.getTime()}`,
            singletonSeconds: 3600,
          },
        );
        rescheduled = true;
      }
      return {
        kind: "done",
        outcome: {
          status: "rejected",
          code: decision.code,
          retryAt: decision.retryAt,
          rescheduled,
        },
      };
    }

    // ---- can we actually place it? (config problems are permanent failures, not retries) ------------
    const agent = lead.ai_agent_id
      ? await tx
          .selectFrom("ai_agent")
          .select(["id", "dograh_workflow_id"])
          .where("id", "=", lead.ai_agent_id)
          .where("is_active", "=", true)
          .executeTakeFirst()
      : await tx
          .selectFrom("ai_agent")
          .select(["id", "dograh_workflow_id"])
          .where("is_active", "=", true)
          .orderBy("created_at", "asc")
          .executeTakeFirst();
    const cannot = !subject.phone
      ? "NO_PHONE"
      : !agent?.dograh_workflow_id
        ? "NO_AGENT"
        : !apiKey
          ? "PROVIDER_NOT_CONFIGURED"
          : null;
    if (cannot) {
      if (resumable) await failAttempt(tx, resumable.id, lead.id, cannot, now);
      await recordReject(tx, lead.id, cannot, now);
      return {
        kind: "done",
        outcome: { status: "failed", code: cannot, attemptId: resumable?.id },
      };
    }

    // ---- RESERVE ---------------------------------------------------------------------------------
    let attemptId: string;
    if (resumable) {
      attemptId = resumable.id;
      await tx
        .updateTable("call_attempt")
        .set({ dial_job_id: ctx.jobId })
        .where("id", "=", attemptId)
        .execute();
    } else {
      const ins = await sql<{ id: string }>`
        insert into call_attempt (tenant_id, lead_id, campaign_id, ai_agent_id, direction, status, dial_job_id, dial_trigger)
        values (${ctx.tenantId}, ${lead.id}, ${data.campaignId ?? null}, ${agent!.id}, 'outbound', 'reserved', ${ctx.jobId}, ${data.trigger})
        on conflict (lead_id) where status in ('reserved', 'dialing', 'in_progress') do nothing
        returning id`.execute(tx);
      if (!ins.rows[0])
        return { kind: "done", outcome: { status: "skipped", reason: "ALREADY_ACTIVE" } };
      attemptId = ins.rows[0].id;
    }

    // SEAM (D6-I2-01): reserve the wallet / plan allowance for this call here, in the same transaction.
    await moveStage(tx, {
      leadId: lead.id,
      to: "attempting",
      actor: "system",
      mode: "auto",
      reason: "call reserved",
    });
    await tx
      .updateTable("lead")
      .set({ last_reject_code: null, last_reject_at: null })
      .where("id", "=", lead.id)
      .execute();

    const initialContext = {
      ...(await buildInitialContext(tx, lead.id)),
      call_attempt_id: attemptId,
    };
    return {
      kind: "dial",
      attemptId,
      request: {
        workflowId: agent!.dograh_workflow_id!,
        phoneE164: subject.phone!,
        initialContext: initialContext as Record<string, unknown>,
      },
    };
  });

  if (plan.kind === "done") return plan.outcome;

  // The reservation is COMMITTED. From here a crash is recoverable (see doc above).
  await hooks.afterReserve?.(plan.attemptId);

  try {
    const res = await deps.dialer.initiateCall({
      tenantId: ctx.tenantId,
      apiKey: apiKey!,
      workflowId: plan.request.workflowId,
      phoneE164: plan.request.phoneE164,
      idempotencyKey: plan.attemptId,
      initialContext: plan.request.initialContext,
    });
    const startedAt = (deps.now ?? (() => new Date()))();
    await ctx.withTx((tx) =>
      tx
        .updateTable("call_attempt")
        .set({ status: "dialing", dograh_run_id: res.runId, started_at: startedAt })
        .where("id", "=", plan.attemptId)
        .where("status", "=", "reserved")
        .execute(),
    );
    return { status: "dialed", attemptId: plan.attemptId, runId: res.runId };
  } catch (e) {
    if (e instanceof DialerError && !e.retryable) {
      await ctx.withTx(async (tx) => {
        const row = await tx
          .selectFrom("call_attempt")
          .select("lead_id")
          .where("id", "=", plan.attemptId)
          .executeTakeFirstOrThrow();
        await failAttempt(tx, plan.attemptId, row.lead_id, e.code, new Date());
      });
      return { status: "failed", code: e.code, attemptId: plan.attemptId };
    }
    throw e; // transient: pg-boss retries this job, which resumes the reservation (same job id, same idempotency key)
  }
}

export const dialJob = defineJob({
  name: "call.dial",
  schema: dialPayload,
  // A dead worker's job must come back quickly (default is 15 min): speed-to-lead is a 30 s promise.
  queue: { expireInSeconds: 60, retryLimit: 5, retryDelay: 15, retryBackoff: true },
  work: { pollingIntervalSeconds: 0.5, localConcurrency: 10 },
  async handler(ctx, data) {
    const out = await runDial({ dialer: ctx.deps.dialer }, ctx, data);
    // the call is placed: start pulling its result back (call.sync_runs re-arms itself while calls are in flight)
    if (out.status === "dialed") await scheduleRunSync(ctx);
    ctx.log.info(
      {
        leadId: data.leadId,
        trigger: data.trigger,
        outcome: out.status,
        ...(out.status === "rejected" ? { code: out.code } : {}),
      },
      "call.dial",
    );
  },
});
