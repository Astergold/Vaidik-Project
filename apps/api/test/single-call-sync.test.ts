/**
 * Single calls outside campaigns: call.dial places the call through the real adapter (DograhDialer over the in-memory
 * FakePlatform), call.sync_runs pulls the result back. Covers the "response lost after the platform placed the call"
 * crash: the resumed dial finds the earlier run, so the lead is rung once.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withTenant } from "@vernacular/db";
import { DograhDialer, PlatformError } from "@vernacular/integration-dograh";
import {
  createJobQueue,
  dialJob,
  installJobs,
  syncRunsJob,
  type JobContext,
  type JobQueue,
} from "../src/jobs/index.js";
import { runDial } from "../src/modules/calls/dial.js";
import { GIVE_UP_AFTER_MS, syncTenantRuns } from "../src/modules/calls/sync.js";
import { createSecretsService, type SecretsService } from "../src/modules/secrets/service.js";
import { FakePlatform, WF2_UUID } from "./fake-platform.js";
import { buildTestEnv, createAgent, createLead, createTenant, type TestEnv } from "./helpers.js";

let env: TestEnv;
let queue: JobQueue;
let secrets: SecretsService;
let platform: FakePlatform;

beforeAll(async () => {
  env = await buildTestEnv();
  await installJobs(process.env.DATABASE_MIGRATION_URL!, [dialJob, syncRunsJob]);
  queue = createJobQueue(env.config.databaseUrl);
  secrets = createSecretsService({ db: env.db, keyring: env.config.masterKeys });
});
afterAll(async () => {
  await queue.stop();
  await env.close();
});
beforeEach(() => {
  platform = new FakePlatform();
});

const OPEN_POLICY = {
  call_window_start: "00:00",
  call_window_end: "23:59",
  allowed_days: [1, 2, 3, 4, 5, 6, 7],
  min_gap_minutes: 0,
  max_attempts_per_day: 50,
  max_attempts_total: 50,
  require_consent: false,
  ndnc_check: false,
};

async function world(workflowRef = WF2_UUID) {
  const tenant = await createTenant(env, "single");
  await withTenant(env.db, tenant.id, (t) =>
    t
      .updateTable("tenant_policy")
      .set(OPEN_POLICY as never)
      .execute(),
  );
  const agentId = await createAgent(env, tenant, "Asha");
  await withTenant(env.db, tenant.id, (t) =>
    t
      .updateTable("ai_agent")
      .set({ dograh_workflow_id: workflowRef })
      .where("id", "=", agentId)
      .execute(),
  );
  const { leadId } = await createLead(env, tenant, { agentId });
  await secrets.setSecret(tenant.id, "dograh_api_key", "tenant-key");
  return { tenantId: tenant.id, leadId };
}

const ctxFor = (tenantId: string, jobId = randomUUID()): JobContext => ({
  db: env.db,
  tenantId,
  jobId,
  secrets,
  jobs: queue,
  deps: {
    dialer: new DograhDialer({ baseUrl: "https://platform.test", clientFor: () => platform }),
    platform: async () => platform,
  },
  log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  withTx: (fn) => withTenant(env.db, tenantId, fn),
});

const attempt = (tenantId: string, leadId: string) =>
  withTenant(env.db, tenantId, (t) =>
    t
      .selectFrom("call_attempt as c")
      .innerJoin("lead as l", "l.id", "c.lead_id")
      .select([
        "c.id",
        "c.status",
        "c.dograh_run_id",
        "c.duration_s",
        "c.disposition",
        "c.reject_code",
        "l.stage",
      ])
      .where("c.lead_id", "=", leadId)
      .executeTakeFirstOrThrow(),
  );

describe("single calls on the calling platform", () => {
  it("dial → platform run with the lead context → sync writes the result and moves the stage", async () => {
    const w = await world();
    const ctx = ctxFor(w.tenantId);
    const out = await runDial({ dialer: ctx.deps.dialer }, ctx, {
      tenantId: w.tenantId,
      leadId: w.leadId,
      trigger: "call_now",
    });
    expect(out.status).toBe("dialed");
    const run = [...platform.workflowRuns.values()][0]!;
    expect(run.initial_context).toMatchObject({
      lead_id: w.leadId,
      call_attempt_id: (await attempt(w.tenantId, w.leadId)).id,
    });

    expect(await syncTenantRuns(ctx)).toBe(1); // still ringing
    expect((await attempt(w.tenantId, w.leadId)).status).toBe("in_progress");

    platform.completeWorkflowRun(run.id, "user_hangup", 75);
    expect(await syncTenantRuns(ctx)).toBe(0);
    expect(await attempt(w.tenantId, w.leadId)).toMatchObject({
      status: "completed",
      dograh_run_id: `2:${run.id}`,
      duration_s: 75,
      disposition: "user_hangup",
      stage: "connected",
    });
  });

  it("numeric workflow ids work as well as UUIDs", async () => {
    const w = await world("2");
    const ctx = ctxFor(w.tenantId);
    expect(
      (
        await runDial({ dialer: ctx.deps.dialer }, ctx, {
          tenantId: w.tenantId,
          leadId: w.leadId,
          trigger: "call_now",
        })
      ).status,
    ).toBe("dialed");
  });

  it("response lost after the platform placed the call: the retried job reuses the run, the lead is rung once", async () => {
    const w = await world();
    const jobId = randomUUID();
    const ctx = ctxFor(w.tenantId, jobId);
    const real = platform.triggerCall.bind(platform);
    let lost = true;
    platform.triggerCall = async (c) => {
      const r = await real(c);
      if (lost) {
        lost = false;
        throw new PlatformError("UNAVAILABLE", "timed out", true);
      }
      return r;
    };
    const payload = { tenantId: w.tenantId, leadId: w.leadId, trigger: "call_now" as const };
    await expect(runDial({ dialer: ctx.deps.dialer }, ctx, payload)).rejects.toThrow();
    const again = await runDial({ dialer: ctx.deps.dialer }, ctxFor(w.tenantId, jobId), payload);
    expect(again.status).toBe("dialed");
    expect(platform.workflowRuns.size).toBe(1);
  });

  it("a call with no result for hours is closed so the lead can be called again", async () => {
    const w = await world();
    const ctx = ctxFor(w.tenantId);
    await runDial({ dialer: ctx.deps.dialer }, ctx, {
      tenantId: w.tenantId,
      leadId: w.leadId,
      trigger: "call_now",
    });
    expect(await syncTenantRuns(ctx, new Date(Date.now() + GIVE_UP_AFTER_MS + 60_000))).toBe(0);
    expect(await attempt(w.tenantId, w.leadId)).toMatchObject({
      status: "failed",
      reject_code: "NO_RESULT",
    });
  });

  it("an archived workflow fails the call permanently with a typed reason", async () => {
    const w = await world("9999");
    const ctx = ctxFor(w.tenantId);
    const out = await runDial({ dialer: ctx.deps.dialer }, ctx, {
      tenantId: w.tenantId,
      leadId: w.leadId,
      trigger: "call_now",
    });
    expect(out).toMatchObject({ status: "failed", code: "PROVIDER_REJECTED" });
    expect(platform.workflowRuns.size).toBe(0);
  });
});
