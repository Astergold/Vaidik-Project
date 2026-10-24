/**
 * Campaigns created in the CRM and mirrored to the calling platform (FakePlatform): routes, roles, state machine,
 * wave dispatch (100/100/50), policy skips, sync-back of call results, crash-safe pushes, pause/resume/stop,
 * tenant isolation.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withTenant } from "@vernacular/db";
import { PlatformError } from "@vernacular/integration-dograh";
import {
  campaignControlJob,
  campaignStartJob,
  campaignSyncJob,
  createJobQueue,
  installJobs,
  type JobContext,
  type JobQueue,
} from "../src/jobs/index.js";
import { FakeDialer } from "../src/modules/calls/dialer.js";
import {
  controlCampaign,
  dispatch,
  pushWave,
  prepareWave,
  syncCampaign,
} from "../src/modules/campaigns/engine.js";
import { createSecretsService, type SecretsService } from "../src/modules/secrets/service.js";
import { FakePlatform } from "./fake-platform.js";
import {
  asUser,
  buildTestEnv,
  createLead,
  createTenant,
  createUser,
  login,
  type TestEnv,
  type TestTenant,
} from "./helpers.js";

let env: TestEnv;
let queue: JobQueue;
let secrets: SecretsService;
let platform: FakePlatform;

beforeAll(async () => {
  env = await buildTestEnv({}, { platform: async () => platform });
  await installJobs(process.env.DATABASE_MIGRATION_URL!, [
    campaignStartJob,
    campaignSyncJob,
    campaignControlJob,
  ]);
  queue = createJobQueue(env.config.databaseUrl);
  secrets = createSecretsService({
    db: env.db,
    keyring: env.config.masterKeys,
  });
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

interface World {
  tenant: TestTenant;
  owner: string;
  head: string;
  counsellor: string;
}

async function world(label = "camp"): Promise<World> {
  const tenant = await createTenant(env, label);
  await withTenant(env.db, tenant.id, (t) =>
    t
      .updateTable("tenant_policy")
      .set(OPEN_POLICY as never)
      .execute(),
  );
  const o = await createUser(env, tenant, "owner", "owner");
  const h = await createUser(env, tenant, "head", "admission_head");
  const c = await createUser(env, tenant, "couns", "counsellor");
  return {
    tenant,
    owner: await login(env.app, o.email),
    head: await login(env.app, h.email),
    counsellor: await login(env.app, c.email),
  };
}

const ctxFor = (tenantId: string): JobContext => ({
  db: env.db,
  tenantId,
  jobId: randomUUID(),
  secrets,
  jobs: queue,
  deps: { dialer: new FakeDialer(), platform: async () => platform },
  log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  withTx: (fn) => withTenant(env.db, tenantId, fn),
});

const body = (over: Record<string, unknown> = {}) => ({
  name: "October outreach",
  workflowId: 2,
  telephonyConfigId: 1,
  leadFilter: {},
  batchSize: 100,
  maxConcurrent: null,
  scheduleEnabled: false,
  schedule: { days: [1, 2, 3, 4, 5], windowStart: "10:00", windowEnd: "18:00" },
  ...over,
});

async function createCampaign(w: World, over: Record<string, unknown> = {}) {
  const res = await env.app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: asUser(w.owner),
    payload: body(over),
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; status: string };
}

const act = (w: World, id: string, action: string, cookie = w.owner) =>
  env.app.inject({
    method: "POST",
    url: `/api/campaigns/${id}/${action}`,
    headers: asUser(cookie),
  });
const get = async (w: World, id: string) =>
  (
    await env.app.inject({
      method: "GET",
      url: `/api/campaigns/${id}`,
      headers: asUser(w.owner),
    })
  ).json();

async function leads(w: World, n: number) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push((await createLead(env, w.tenant)).leadId);
  return ids;
}

describe("campaign API", () => {
  it("platform-options returns the platform's workflows, telephony configs and defaults", async () => {
    const w = await world();
    const res = await env.app.inject({
      method: "GET",
      url: "/api/campaigns/platform-options",
      headers: asUser(w.owner),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      workflows: [
        { id: 2, name: "Admissions outreach" },
        { id: 3, name: "Follow-up" },
      ],
      telephonyConfigs: [{ id: 1, name: "main-line", isDefault: true, phoneNumberCount: 1 }],
      defaults: {
        maxConcurrent: 3,
        concurrentCallLimit: 10,
        retry: {
          enabled: true,
          maxRetries: 1,
          retryDelaySeconds: 120,
          onBusy: true,
          onNoAnswer: true,
          onVoicemail: false,
        },
      },
    });
  });

  it("platform-options: unreachable platform is a 502 with no provider name", async () => {
    const w = await world();
    platform.failNext.listWorkflows = [
      new PlatformError("UNAVAILABLE", "The calling platform is unreachable", true),
    ];
    const res = await env.app.inject({
      method: "GET",
      url: "/api/campaigns/platform-options",
      headers: asUser(w.owner),
    });
    expect(res.statusCode).toBe(502);
    expect(res.body.toLowerCase()).not.toMatch(/dograh|godrah/);
  });

  it("creates a draft with the workflow name from the platform and all advanced settings", async () => {
    const w = await world();
    const c = await createCampaign(w, {
      maxConcurrent: 5,
      retry: {
        enabled: true,
        maxRetries: 2,
        retryDelaySeconds: 300,
        onBusy: true,
        onNoAnswer: false,
        onVoicemail: true,
      },
      circuitBreaker: {
        enabled: false,
        failureThresholdPct: 40,
        windowSeconds: 60,
        minCallsInWindow: 3,
      },
    });
    const full = await get(w, c.id);
    expect(full).toMatchObject({
      status: "draft",
      workflow: { id: 2, name: "Admissions outreach" },
      telephonyConfigId: 1,
      maxConcurrent: 5,
      retry: {
        maxRetries: 2,
        retryDelaySeconds: 300,
        onNoAnswer: false,
        onVoicemail: true,
      },
      circuitBreaker: { enabled: false, failureThresholdPct: 40 },
      waves: [],
    });
  });

  it("rejects a workflow the platform does not have (422)", async () => {
    const w = await world();
    const res = await env.app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: asUser(w.owner),
      payload: body({ workflowId: 999 }),
    });
    expect(res.statusCode).toBe(422);
  });

  it("counsellors can read but never create or run campaigns (403)", async () => {
    const w = await world();
    const c = await createCampaign(w);
    const create = await env.app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: asUser(w.counsellor),
      payload: body(),
    });
    expect(create.statusCode).toBe(403);
    expect((await act(w, c.id, "start", w.counsellor)).statusCode).toBe(403);
    const opts = await env.app.inject({
      method: "GET",
      url: "/api/campaigns/platform-options",
      headers: asUser(w.counsellor),
    });
    expect(opts.statusCode).toBe(403);
    const list = await env.app.inject({
      method: "GET",
      url: "/api/campaigns",
      headers: asUser(w.counsellor),
    });
    expect(list.statusCode).toBe(200);
  });

  it("admission head can start; invalid transitions are 409", async () => {
    const w = await world();
    const c = await createCampaign(w);
    expect((await act(w, c.id, "pause")).statusCode).toBe(409);
    expect((await act(w, c.id, "resume")).statusCode).toBe(409);
    const start = await act(w, c.id, "start", w.head);
    expect(start.statusCode, start.body).toBe(200);
    expect(start.json().status).toBe("running");
    expect((await act(w, c.id, "start")).statusCode).toBe(409);
  });

  it("running campaigns cannot be edited; paused ones keep their leads fixed", async () => {
    const w = await world();
    const c = await createCampaign(w);
    await act(w, c.id, "start");
    const patch = (payload: object) =>
      env.app.inject({
        method: "PATCH",
        url: `/api/campaigns/${c.id}`,
        headers: asUser(w.owner),
        payload,
      });
    expect((await patch({ name: "x" })).statusCode).toBe(409);
    await act(w, c.id, "pause");
    expect((await patch({ batchSize: 200 })).statusCode).toBe(409);
    const ok = await patch({ maxConcurrent: 7 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().maxConcurrent).toBe(7);
  });

  it("is tenant-isolated: another tenant gets 404 and no data", async () => {
    const a = await world("iso-a");
    const b = await world("iso-b");
    const c = await createCampaign(a, { name: "Secret campaign A" });
    const res = await env.app.inject({
      method: "GET",
      url: `/api/campaigns/${c.id}`,
      headers: asUser(b.owner),
    });
    expect(res.statusCode).toBe(404);
    expect((await act(b, c.id, "start")).statusCode).toBe(404);
    const list = await env.app.inject({
      method: "GET",
      url: "/api/campaigns",
      headers: asUser(b.owner),
    });
    expect(list.body).not.toContain("Secret campaign A");
  });
});

describe("campaign engine (mirrors to the platform)", () => {
  async function started(w: World, n: number, over: Record<string, unknown> = {}) {
    const ids = await leads(w, n);
    const c = await createCampaign(w, over);
    await act(w, c.id, "start");
    return { c, ids };
  }

  it("250 leads at batch 100 → platform waves of 100 / 100 / 50, nobody uploaded twice", async () => {
    const w = await world();
    const { c } = await started(w, 250);
    const ctx = ctxFor(w.tenant.id);

    expect(await dispatch(ctx, c.id)).toBe("push");
    expect(platform.campaigns.size).toBe(1);
    expect(platform.latest().rows).toHaveLength(100);
    expect(platform.latest().campaign.state).toBe("running");
    expect(platform.latest().request).toMatchObject({
      workflowId: 2,
      telephonyConfigId: 1,
      maxConcurrency: null,
      retry: { max_retries: 1, retry_delay_seconds: 120 },
      circuitBreaker: { enabled: true, failure_threshold: 0.5 },
      schedule: { enabled: true },
    });
    // the CSV carries what links a platform run back to the CRM
    expect(Object.keys(platform.latest().rows[0]!)).toEqual([
      "phone_number",
      "lead_id",
      "call_attempt_id",
      "crm_campaign_id",
      "person_name",
      "program",
      "language",
    ]);

    // a second dispatch while wave 1 runs does nothing
    expect(await dispatch(ctx, c.id)).toBe("busy");
    expect(platform.campaigns.size).toBe(1);

    for (const expected of [100, 50]) {
      platform.finishWave(platform.latest().campaign.id);
      await syncCampaign(ctx, c.id);
      expect(platform.latest().rows).toHaveLength(expected);
    }
    platform.finishWave(platform.latest().campaign.id);
    expect(await syncCampaign(ctx, c.id)).toBe(false);

    const all = [...platform.campaigns.values()].flatMap((s) => s.rows.map((r) => r.lead_id));
    expect(all).toHaveLength(250);
    expect(new Set(all).size).toBe(250);

    const final = await get(w, c.id);
    expect(final.status).toBe("completed");
    expect(final.waves.map((x: { totalRows: number }) => x.totalRows)).toEqual([100, 100, 50]);
    expect(final.progress).toMatchObject({
      total: 250,
      dialed: 250,
      connected: 250,
      pending: 0,
      skipped: 0,
    });
  });

  it("call results flow back: run id, status, duration, and stage connected for talk > 15 s", async () => {
    const w = await world();
    const { c, ids } = await started(w, 3);
    const ctx = ctxFor(w.tenant.id);
    await dispatch(ctx, c.id);
    const byLead: Record<string, [string, number]> = {
      [ids[0]!]: ["user_hangup", 90],
      [ids[1]!]: ["no_answer", 0],
      [ids[2]!]: ["busy", 0],
    };
    platform.finishWave(platform.latest().campaign.id, (row) => byLead[row.lead_id!]!);
    await syncCampaign(ctx, c.id);

    const rows = await withTenant(env.db, w.tenant.id, (t) =>
      t
        .selectFrom("call_attempt as ca")
        .innerJoin("lead as l", "l.id", "ca.lead_id")
        .select([
          "ca.lead_id",
          "ca.status",
          "ca.duration_s",
          "ca.dograh_run_id",
          "ca.dial_trigger",
          "l.stage",
        ])
        .where("ca.campaign_id", "=", c.id)
        .execute(),
    );
    const by = Object.fromEntries(rows.map((r) => [r.lead_id, r]));
    expect(by[ids[0]!]).toMatchObject({
      status: "completed",
      duration_s: 90,
      stage: "connected",
      dial_trigger: "campaign",
    });
    expect(by[ids[1]!]).toMatchObject({
      status: "no_answer",
      stage: "attempting",
    });
    expect(by[ids[2]!]).toMatchObject({ status: "busy", stage: "attempting" });
    expect(rows.every((r) => r.dograh_run_id)).toBe(true);

    // syncing again changes nothing (idempotent)
    await syncCampaign(ctx, c.id).catch(() => undefined);
    const again = await withTenant(env.db, w.tenant.id, (t) =>
      t.selectFrom("lead_stage_history").select("id").where("lead_id", "in", ids).execute(),
    );
    const history = again.length;
    await syncCampaign(ctx, c.id).catch(() => undefined);
    const after = await withTenant(env.db, w.tenant.id, (t) =>
      t.selectFrom("lead_stage_history").select("id").where("lead_id", "in", ids).execute(),
    );
    expect(after.length).toBe(history);
  });

  it("policy: suppressed leads are skipped with the typed reason, the rest are uploaded", async () => {
    const w = await world();
    const ok = await createLead(env, w.tenant);
    const bad = await createLead(env, w.tenant);
    await withTenant(env.db, w.tenant.id, (t) =>
      t
        .insertInto("suppression")
        .values({
          tenant_id: w.tenant.id,
          kind: "phone",
          value_norm: bad.phone,
          reason: "opt_out",
        })
        .execute(),
    );
    const c = await createCampaign(w);
    await act(w, c.id, "start");
    await dispatch(ctxFor(w.tenant.id), c.id);
    expect(platform.latest().rows.map((r) => r.lead_id)).toEqual([ok.leadId]);
    const cl = await withTenant(env.db, w.tenant.id, (t) =>
      t
        .selectFrom("campaign_lead")
        .select(["status", "skip_reason"])
        .where("lead_id", "=", bad.leadId)
        .executeTakeFirstOrThrow(),
    );
    expect(cl).toEqual({ status: "skipped", skip_reason: "SUPPRESSED" });
    expect((await get(w, c.id)).progress.skipped).toBe(1);
  });

  it("a lead already in another active campaign is not snapshotted again", async () => {
    const w = await world();
    await leads(w, 2);
    const first = await createCampaign(w, { name: "first" });
    await act(w, first.id, "start");
    await dispatch(ctxFor(w.tenant.id), first.id);
    const second = await createCampaign(w, { name: "second" });
    await act(w, second.id, "start");
    expect(await dispatch(ctxFor(w.tenant.id), second.id)).toBe("completed");
    expect(platform.campaigns.size).toBe(1);
  });

  it("crash after the platform created the wave: the retry starts the SAME campaign, never a second one", async () => {
    const w = await world();
    const { c } = await started(w, 3);
    const ctx = ctxFor(w.tenant.id);
    platform.failNext.startCampaign = [new PlatformError("UNAVAILABLE", "timed out", true)];
    await expect(dispatch(ctx, c.id)).rejects.toThrow();
    expect(platform.campaigns.size).toBe(1);
    expect((await get(w, c.id)).lastError).toBeTruthy();

    // the job retries
    await dispatch(ctx, c.id).catch(() => undefined);
    const p = await prepareWave(ctx, c.id);
    if (p.kind === "push") await pushWave(ctx, c.id, p.waveNo);
    expect(platform.campaigns.size).toBe(1);
  });

  it("crash before the id was saved: recovery finds the platform campaign by its name", async () => {
    const w = await world();
    const { c } = await started(w, 2);
    const ctx = ctxFor(w.tenant.id);
    const p = await prepareWave(ctx, c.id);
    expect(p.kind).toBe("push");
    // simulate: platform campaign created, but the worker died before saving provider_campaign_id
    const real = platform.createCampaign.bind(platform);
    let createdOnce = false;
    platform.createCampaign = async (req) => {
      const r = await real(req);
      if (!createdOnce) {
        createdOnce = true;
        throw new PlatformError("UNAVAILABLE", "connection reset", true);
      }
      return r;
    };
    await expect(pushWave(ctx, c.id, 1)).rejects.toThrow();
    await pushWave(ctx, c.id, 1);
    expect(platform.campaigns.size).toBe(1);
    expect(platform.latest().campaign.state).toBe("running");
  });

  it("a platform rejection fails the wave, releases its leads and pauses the campaign with a message", async () => {
    const w = await world();
    const { c, ids } = await started(w, 2);
    platform.failNext.createCampaign = [
      new PlatformError("REJECTED", "workflow is archived", false, 400),
    ];
    await dispatch(ctxFor(w.tenant.id), c.id);
    const full = await get(w, c.id);
    expect(full.status).toBe("paused");
    expect(full.lastError).toBe("workflow is archived");
    expect(full.waves[0].state).toBe("failed");
    const active = await withTenant(env.db, w.tenant.id, (t) =>
      t
        .selectFrom("call_attempt")
        .select("id")
        .where("lead_id", "in", ids)
        .where("status", "in", ["reserved", "dialing", "in_progress"])
        .execute(),
    );
    expect(active).toHaveLength(0);
  });

  it("pause / resume / stop are applied on the platform", async () => {
    const w = await world();
    const { c } = await started(w, 3);
    const ctx = ctxFor(w.tenant.id);
    await dispatch(ctx, c.id);
    const pid = platform.latest().campaign.id;

    await act(w, c.id, "pause");
    await controlCampaign(ctx, c.id, "pause");
    expect(platform.campaigns.get(pid)!.campaign.state).toBe("paused");

    await act(w, c.id, "resume");
    await controlCampaign(ctx, c.id, "resume");
    expect(platform.campaigns.get(pid)!.campaign.state).toBe("running");

    platform.addRun(pid, platform.latest().rows[0]!, "user_hangup", 40);
    await act(w, c.id, "stop");
    await controlCampaign(ctx, c.id, "stop");
    expect(platform.campaigns.get(pid)!.campaign.state).toBe("paused");
    const full = await get(w, c.id);
    expect(full.status).toBe("stopped");
    expect(full.progress).toMatchObject({
      total: 3,
      dialed: 1,
      connected: 1,
      pending: 0,
    });
    const free = await withTenant(env.db, w.tenant.id, (t) =>
      t
        .selectFrom("call_attempt")
        .select("id")
        .where("campaign_id", "=", c.id)
        .where("status", "in", ["reserved", "dialing", "in_progress"])
        .execute(),
    );
    expect(free).toHaveLength(0);
  });

  it("schedule with no overlap with the institution's calling hours fails the wave instead of calling", async () => {
    const w = await world();
    await withTenant(env.db, w.tenant.id, (t) =>
      t
        .updateTable("tenant_policy")
        .set({ allowed_days: [1, 2, 3, 4, 5] } as never)
        .execute(),
    );
    const { c } = await started(w, 1, {
      scheduleEnabled: true,
      schedule: { days: [7], windowStart: "10:00", windowEnd: "12:00" },
    });
    await dispatch(ctxFor(w.tenant.id), c.id);
    expect(platform.campaigns.size).toBe(0);
    expect((await get(w, c.id)).lastError).toMatch(/calling hours/);
  });
});
