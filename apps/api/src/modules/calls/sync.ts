/**
 * call.sync_runs — pulls the result of single calls (intake, call-now, callbacks, retries) from the calling platform.
 * Campaign calls are synced by campaign.sync instead. Started by call.dial after a call is placed and re-armed
 * while the tenant still has calls in flight, so nothing needs a cron.
 */
import { z } from "zod";
import { parseRunRef } from "@vernacular/integration-dograh";
import { defineJob, type JobContext } from "../../jobs/define.js";
import { applyRunToAttempt } from "../campaigns/engine.js";

const syncPayload = z.object({ tenantId: z.uuid() });
export type SyncPayload = z.infer<typeof syncPayload>;

export const SYNC_RUNS_SECONDS = 30;
/** A single call with no result after this long is closed so the lead can be called again. */
export const GIVE_UP_AFTER_MS = 2 * 3600_000;

/** Returns how many calls are still in flight. */
export async function syncTenantRuns(ctx: JobContext, now = new Date()): Promise<number> {
  const active = await ctx.withTx((tx) =>
    tx
      .selectFrom("call_attempt")
      .select(["id", "dograh_run_id", "created_at"])
      .where("campaign_id", "is", null)
      .where("status", "in", ["dialing", "in_progress"])
      .where("dograh_run_id", "is not", null)
      .orderBy("created_at")
      .limit(200)
      .execute(),
  );
  if (active.length === 0) return 0;
  if (!ctx.deps.platform) throw new Error("worker has no calling-platform resolver configured");
  const platform = await ctx.deps.platform(ctx.tenantId);

  let open = 0;
  for (const a of active) {
    const ref = parseRunRef(a.dograh_run_id!);
    if (!ref) continue; // not a run this adapter placed
    const run = await platform.getWorkflowRun(ref.workflowId, ref.runId);
    const done = await ctx.withTx((tx) => applyRunToAttempt(tx, a.id, run, a.dograh_run_id!));
    if (done) continue;
    if (now.getTime() - a.created_at.getTime() > GIVE_UP_AFTER_MS) {
      await ctx.withTx((tx) =>
        tx
          .updateTable("call_attempt")
          .set({ status: "failed", reject_code: "NO_RESULT", ended_at: now })
          .where("id", "=", a.id)
          .where("status", "in", ["dialing", "in_progress"])
          .execute(),
      );
      continue;
    }
    open++;
  }
  return open;
}

/** Arms the next sync for this tenant (one pending per tenant per slot). */
export async function scheduleRunSync(ctx: JobContext, delaySeconds = SYNC_RUNS_SECONDS) {
  await ctx.withTx((tx) =>
    ctx.jobs.enqueueInTx(
      tx,
      syncRunsJob,
      { tenantId: ctx.tenantId },
      {
        startAfter: new Date(Date.now() + delaySeconds * 1000),
        singletonKey: `sync-runs:${ctx.tenantId}`,
        singletonSeconds: delaySeconds,
      },
    ),
  );
}

export const syncRunsJob = defineJob({
  name: "call.sync_runs",
  schema: syncPayload,
  queue: { expireInSeconds: 300, retryLimit: 5, retryDelay: 60, retryBackoff: true },
  work: { pollingIntervalSeconds: 5, localConcurrency: 5 },
  async handler(ctx, data) {
    const open = await syncTenantRuns(ctx);
    ctx.log.info({ tenantId: data.tenantId, open }, "call.sync_runs");
    if (open > 0) await scheduleRunSync(ctx);
  },
});
