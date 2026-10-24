import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@vernacular/db";
import {
  createJobQueue,
  installJobs,
  dialJob,
  systemPing,
  startWorker,
  type JobContext,
  type JobQueue,
} from "../src/jobs/index.js";
import { DialerError, FakeDialer } from "../src/modules/calls/dialer.js";
import { ABANDON_RESERVATION_MS, runDial, type DialPayload } from "../src/modules/calls/dial.js";
import { createSecretsService, type SecretsService } from "../src/modules/secrets/service.js";
import {
  buildTestEnv,
  createAgent,
  createTenant,
  type TestEnv,
  type TestTenant,
} from "./helpers.js";

const ist = (s: string) => new Date(`${s}:00+05:30`);
const WED_10 = ist("2026-12-02T10:00"); // a Wednesday, far enough ahead that real-clock rows are "old"
const OPEN_ALL = {
  call_window_start: "00:00",
  call_window_end: "23:59",
  allowed_days: [1, 2, 3, 4, 5, 6, 7],
  min_gap_minutes: 0,
  max_attempts_per_day: 50,
  max_attempts_total: 50,
};

let env: TestEnv;
let queue: JobQueue;
let secrets: SecretsService;
let owner: pg.Pool;

beforeAll(async () => {
  env = await buildTestEnv();
  owner = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 2 });
  await installJobs(process.env.DATABASE_MIGRATION_URL!, [dialJob, systemPing]);
  queue = createJobQueue(env.config.databaseUrl);
  secrets = createSecretsService({ db: env.db, keyring: env.config.masterKeys });
});
afterAll(async () => {
  await queue.stop();
  await owner.end();
  await env.close();
});

interface World {
  tenant: TestTenant;
  leadId: string;
  personId: string;
  agentId: string;
  phone: string;
}

/** A tenant that is fully ready to dial (agent+workflow, API key, consent, NDNC clear). */
async function world(
  opts: { openAllHours?: boolean; apiKey?: boolean; workflow?: boolean; label?: string } = {},
): Promise<World> {
  const tenant = await createTenant(env, opts.label ?? "dial");
  const phone = `+9190${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const agentId = await createAgent(env, tenant, "Asha");
  const ids = await withTenant(env.db, tenant.id, async (t) => {
    if (opts.workflow !== false)
      await t
        .updateTable("ai_agent")
        .set({ dograh_workflow_id: "wf-1" })
        .where("id", "=", agentId)
        .execute();
    if (opts.openAllHours)
      await t
        .updateTable("tenant_policy")
        .set(OPEN_ALL as never)
        .execute();
    const cycle = await t.selectFrom("admission_cycle").select("id").executeTakeFirstOrThrow();
    const program = await t
      .insertInto("program")
      .values({ tenant_id: tenant.id, name: "B.Tech" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const person = await t
      .insertInto("person")
      .values({
        tenant_id: tenant.id,
        full_name: "Ravi Kumar",
        ndnc_status: "clear",
        preferred_language: "hi",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await t
      .insertInto("person_identifier")
      .values({
        tenant_id: tenant.id,
        person_id: person.id,
        kind: "phone",
        value_raw: phone,
        value_norm: phone,
        is_primary: true,
      })
      .execute();
    await t
      .insertInto("consent_record")
      .values({
        tenant_id: tenant.id,
        person_id: person.id,
        channel: "voice",
        purpose: "admission",
        granted: true,
        source: "test",
      })
      .execute();
    const lead = await t
      .insertInto("lead")
      .values({
        tenant_id: tenant.id,
        person_id: person.id,
        cycle_id: cycle.id,
        program_id: program.id,
        ai_agent_id: agentId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return { leadId: lead.id, personId: person.id };
  });
  if (opts.apiKey !== false)
    await secrets.setSecret(tenant.id, "dograh_api_key", "test-provider-key");
  return { tenant, agentId, phone, ...ids };
}

const ctxFor = (w: World, jobId = randomUUID(), tenantId = w.tenant.id): JobContext => ({
  db: env.db,
  tenantId,
  jobId,
  secrets,
  jobs: queue,
  deps: { dialer: new FakeDialer() },
  log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  withTx: (fn) => withTenant(env.db, tenantId, fn),
});
const payload = (w: World, over: Partial<DialPayload> = {}): DialPayload => ({
  tenantId: w.tenant.id,
  leadId: w.leadId,
  trigger: "intake",
  ...over,
});
const attempts = (w: World) =>
  withTenant(env.db, w.tenant.id, (t) =>
    t
      .selectFrom("call_attempt")
      .selectAll()
      .where("lead_id", "=", w.leadId)
      .orderBy("created_at")
      .execute(),
  );
const lead = (w: World) =>
  withTenant(env.db, w.tenant.id, (t) =>
    t.selectFrom("lead").selectAll().where("id", "=", w.leadId).executeTakeFirstOrThrow(),
  );
const ageAttempt = (w: World, id: string, ms: number, now = WED_10) =>
  withTenant(env.db, w.tenant.id, (t) =>
    t
      .updateTable("call_attempt")
      .set({ created_at: new Date(now.getTime() - ms) })
      .where("id", "=", id)
      .execute(),
  );
const queuedRetries = async (w: World) =>
  (
    await owner.query(
      `select start_after from pgboss.job where name = 'call.dial' and data->>'leadId' = $1 and data->>'trigger' = 'retry' order by start_after`,
      [w.leadId],
    )
  ).rows;

describe("happy path", () => {
  it("reserves, dials with Idempotency-Key = attempt id, then records the run", async () => {
    const w = await world();
    const dialer = new FakeDialer();
    const out = await runDial({ dialer, now: () => WED_10 }, ctxFor(w), payload(w));
    expect(out.status).toBe("dialed");

    const [a] = await attempts(w);
    expect(a).toMatchObject({
      status: "dialing",
      direction: "outbound",
      dial_trigger: "intake",
      ai_agent_id: w.agentId,
    });
    expect(a!.dograh_run_id).toBeTruthy();
    expect(a!.dial_job_id).toBeTruthy();
    expect(a!.started_at!.toISOString()).toBe(WED_10.toISOString());

    expect(dialer.requests).toHaveLength(1);
    const req = dialer.requests[0]!;
    expect(req.idempotencyKey).toBe(a!.id);
    expect(req.phoneE164).toBe(w.phone);
    expect(req.workflowId).toBe("wf-1");
    expect(req.apiKey).toBe("test-provider-key");
    expect(req.tenantId).toBe(w.tenant.id);
  });

  it("initial_context carries lead, name, program, language and the attempt id, and NO phone/email", async () => {
    const w = await world();
    const dialer = new FakeDialer();
    await runDial({ dialer, now: () => WED_10 }, ctxFor(w), payload(w));
    const ic = dialer.requests[0]!.initialContext;
    expect(ic).toMatchObject({
      lead_id: w.leadId,
      person_name: "Ravi Kumar",
      program: "B.Tech",
      language: "hi",
      stage: "attempting",
      is_new_caller: false,
    });
    expect(ic.call_attempt_id).toBe(dialer.requests[0]!.idempotencyKey);
    expect(JSON.stringify(ic)).not.toContain(w.phone);
  });

  it("moves a NEW lead to 'attempting' (with history) and clears an earlier reject code", async () => {
    const w = await world();
    await withTenant(env.db, w.tenant.id, (t) =>
      t
        .updateTable("lead")
        .set({ last_reject_code: "OUTSIDE_WINDOW", last_reject_at: new Date() })
        .where("id", "=", w.leadId)
        .execute(),
    );
    await runDial({ dialer: new FakeDialer(), now: () => WED_10 }, ctxFor(w), payload(w));
    const l = await lead(w);
    expect(l.stage).toBe("attempting");
    expect(l.last_reject_code).toBeNull();
    const h = await withTenant(env.db, w.tenant.id, (t) =>
      t
        .selectFrom("lead_stage_history")
        .select(["from_stage", "to_stage", "actor"])
        .where("lead_id", "=", w.leadId)
        .execute(),
    );
    expect(h).toEqual([{ from_stage: "new", to_stage: "attempting", actor: "system" }]);
  });

  it("does not move a lead that is already further along", async () => {
    const w = await world();
    await withTenant(env.db, w.tenant.id, (t) =>
      t.updateTable("lead").set({ stage: "interested" }).where("id", "=", w.leadId).execute(),
    );
    await runDial({ dialer: new FakeDialer(), now: () => WED_10 }, ctxFor(w), payload(w));
    expect((await lead(w)).stage).toBe("interested");
  });
});

describe("the policy engine gates every dial", () => {
  const blocked = async (w: World, now: Date, trigger: DialPayload["trigger"] = "intake") => {
    const dialer = new FakeDialer();
    const out = await runDial({ dialer, now: () => now }, ctxFor(w), payload(w, { trigger }));
    expect(dialer.requests).toHaveLength(0); // never reached the provider
    expect(await attempts(w)).toHaveLength(0); // never even reserved
    return out;
  };

  it("OUTSIDE_WINDOW at 21:05: recorded on the lead and rescheduled for 09:00 next day", async () => {
    const w = await world();
    const out = await blocked(w, ist("2026-12-02T21:05"));
    expect(out).toMatchObject({ status: "rejected", code: "OUTSIDE_WINDOW", rescheduled: true });
    expect((await lead(w)).last_reject_code).toBe("OUTSIDE_WINDOW");
    const retries = await queuedRetries(w);
    expect(retries).toHaveLength(1);
    expect(new Date(retries[0].start_after).toISOString()).toBe("2026-12-03T03:30:00.000Z");
  });

  it("a 'call now' click that is blocked reports the reason but does NOT schedule a retry", async () => {
    const w = await world();
    const out = await blocked(w, ist("2026-12-02T21:05"), "call_now");
    expect(out).toMatchObject({ status: "rejected", code: "OUTSIDE_WINDOW", rescheduled: false });
    expect(await queuedRetries(w)).toHaveLength(0);
    expect((await lead(w)).last_reject_code).toBe("OUTSIDE_WINDOW");
  });

  it("SUPPRESSED / NO_CONSENT / NDNC_UNKNOWN / NDNC_LISTED are recorded and NOT retried", async () => {
    const cases: [string, (w: World) => Promise<unknown>, string][] = [
      [
        "suppressed",
        (w) =>
          withTenant(env.db, w.tenant.id, (t) =>
            t
              .insertInto("suppression")
              .values({
                tenant_id: w.tenant.id,
                kind: "phone",
                value_norm: w.phone,
                reason: "opt_out",
              })
              .execute(),
          ),
        "SUPPRESSED",
      ],
      [
        "no consent",
        (w) =>
          withTenant(env.db, w.tenant.id, (t) =>
            t
              .deleteFrom("consent_record")
              .execute()
              .catch(() => undefined),
          ),
        "NO_CONSENT",
      ],
      [
        "ndnc unknown",
        (w) =>
          withTenant(env.db, w.tenant.id, (t) =>
            t.updateTable("person").set({ ndnc_status: "unknown" }).execute(),
          ),
        "NDNC_UNKNOWN",
      ],
      [
        "ndnc listed",
        (w) =>
          withTenant(env.db, w.tenant.id, (t) =>
            t.updateTable("person").set({ ndnc_status: "listed" }).execute(),
          ),
        "NDNC_LISTED",
      ],
    ];
    for (const [label, arrange, code] of cases) {
      const w = await world({ label: "gate" });
      if (label === "no consent") {
        // consent_record is append-only: record a REVOCATION instead of deleting
        await withTenant(env.db, w.tenant.id, (t) =>
          t
            .insertInto("consent_record")
            .values({
              tenant_id: w.tenant.id,
              person_id: w.personId,
              channel: "voice",
              purpose: "admission",
              granted: false,
              source: "stop",
            })
            .execute(),
        );
      } else await arrange(w);
      const out = await blocked(w, WED_10);
      expect(out, label).toMatchObject({ status: "rejected", code, rescheduled: false });
      expect((await lead(w)).last_reject_code, label).toBe(code);
      expect(await queuedRetries(w), label).toHaveLength(0);
    }
  });

  it("an NDNC suppression row is treated as NDNC_LISTED (not SUPPRESSED)", async () => {
    const w = await world();
    await withTenant(env.db, w.tenant.id, (t) =>
      t
        .insertInto("suppression")
        .values({ tenant_id: w.tenant.id, kind: "phone", value_norm: w.phone, reason: "ndnc" })
        .execute(),
    );
    expect(await blocked(w, WED_10)).toMatchObject({ code: "NDNC_LISTED" });
  });

  it("an expired suppression no longer blocks", async () => {
    const w = await world();
    await withTenant(env.db, w.tenant.id, (t) =>
      t
        .insertInto("suppression")
        .values({
          tenant_id: w.tenant.id,
          kind: "phone",
          value_norm: w.phone,
          reason: "dnd",
          expires_at: new Date(WED_10.getTime() - 1000),
        })
        .execute(),
    );
    expect(
      (await runDial({ dialer: new FakeDialer(), now: () => WED_10 }, ctxFor(w), payload(w)))
        .status,
    ).toBe("dialed");
  });

  it("a suspended tenant cannot dial", async () => {
    const w = await world();
    await withTenant(env.db, w.tenant.id, (t) =>
      t.updateTable("tenant").set({ status: "suspended" }).where("id", "=", w.tenant.id).execute(),
    );
    expect(await blocked(w, WED_10)).toMatchObject({
      code: "TENANT_SUSPENDED",
      rescheduled: false,
    });
  });

  it("per-day cap reached -> rescheduled for tomorrow; total cap -> permanent", async () => {
    const w = await world();
    await withTenant(env.db, w.tenant.id, async (t) => {
      for (let i = 0; i < 3; i++)
        await t
          .insertInto("call_attempt")
          .values({
            tenant_id: w.tenant.id,
            lead_id: w.leadId,
            status: "no_answer",
            started_at: new Date(WED_10.getTime() - (i + 2) * 3_600_000 * 1.5),
          } as never)
          .execute();
    });
    const out = await runDial(
      { dialer: new FakeDialer(), now: () => WED_10 },
      ctxFor(w),
      payload(w),
    );
    expect(out).toMatchObject({ status: "rejected", code: "CAP_REACHED", rescheduled: true });

    const w2 = await world();
    await withTenant(env.db, w2.tenant.id, async (t) => {
      for (let i = 0; i < 8; i++)
        await t
          .insertInto("call_attempt")
          .values({
            tenant_id: w2.tenant.id,
            lead_id: w2.leadId,
            status: "no_answer",
            started_at: new Date(WED_10.getTime() - (i + 1) * 86_400_000),
          } as never)
          .execute();
    });
    expect(
      await runDial({ dialer: new FakeDialer(), now: () => WED_10 }, ctxFor(w2), payload(w2)),
    ).toMatchObject({ code: "CAP_REACHED", rescheduled: false });
  });

  it("TOO_SOON after a recent attempt is rescheduled for last + gap", async () => {
    const w = await world();
    const last = new Date(WED_10.getTime() - 20 * 60_000);
    await withTenant(env.db, w.tenant.id, (t) =>
      t
        .insertInto("call_attempt")
        .values({
          tenant_id: w.tenant.id,
          lead_id: w.leadId,
          status: "no_answer",
          started_at: last,
        } as never)
        .execute(),
    );
    const out = await runDial(
      { dialer: new FakeDialer(), now: () => WED_10 },
      ctxFor(w),
      payload(w),
    );
    expect(out).toMatchObject({ status: "rejected", code: "TOO_SOON", rescheduled: true });
    const retries = await queuedRetries(w);
    expect(new Date(retries[0].start_after).toISOString()).toBe(
      new Date(last.getTime() + 60 * 60_000).toISOString(),
    );
  });

  it("changing the calling window takes effect on the very next dial (no caching)", async () => {
    const w = await world();
    const at = ist("2026-12-02T09:30");
    expect(
      await runDial(
        { dialer: new FakeDialer(), now: () => at },
        ctxFor(w),
        payload(w, { trigger: "call_now" }),
      ).then((o) => o.status),
    ).toBe("dialed");
    const w2 = await world();
    await withTenant(env.db, w2.tenant.id, (t) =>
      t
        .updateTable("tenant_policy")
        .set({ call_window_start: "10:00", call_window_end: "18:00" })
        .execute(),
    );
    expect(
      await runDial(
        { dialer: new FakeDialer(), now: () => at },
        ctxFor(w2),
        payload(w2, { trigger: "call_now" }),
      ),
    ).toMatchObject({ status: "rejected", code: "OUTSIDE_WINDOW" });
  });
});

describe("configuration problems are permanent failures, never reservations", () => {
  const failed = async (w: World, code: string) => {
    const dialer = new FakeDialer();
    const out = await runDial({ dialer, now: () => WED_10 }, ctxFor(w), payload(w));
    expect(out).toMatchObject({ status: "failed", code });
    expect(dialer.requests).toHaveLength(0);
    expect(await attempts(w)).toHaveLength(0);
    expect((await lead(w)).last_reject_code).toBe(code);
  };
  it("no provider API key", async () =>
    failed(await world({ apiKey: false }), "PROVIDER_NOT_CONFIGURED"));
  it("agent without a workflow", async () => failed(await world({ workflow: false }), "NO_AGENT"));
  it("no phone number on file", async () => {
    const w = await world();
    await withTenant(env.db, w.tenant.id, (t) => t.deleteFrom("person_identifier").execute());
    await failed(w, "NO_PHONE");
  });
  it("lead without an assigned agent uses the tenant's first active agent", async () => {
    const w = await world();
    await withTenant(env.db, w.tenant.id, (t) =>
      t.updateTable("lead").set({ ai_agent_id: null }).where("id", "=", w.leadId).execute(),
    );
    const dialer = new FakeDialer();
    expect((await runDial({ dialer, now: () => WED_10 }, ctxFor(w), payload(w))).status).toBe(
      "dialed",
    );
    expect(dialer.requests[0]!.workflowId).toBe("wf-1");
  });
  it("closed leads (lost / invalid / enrolled) and unknown leads are skipped", async () => {
    for (const stage of ["lost", "invalid", "enrolled"]) {
      const w = await world();
      await withTenant(env.db, w.tenant.id, (t) =>
        t.updateTable("lead").set({ stage }).where("id", "=", w.leadId).execute(),
      );
      expect(
        await runDial({ dialer: new FakeDialer(), now: () => WED_10 }, ctxFor(w), payload(w)),
      ).toEqual({ status: "skipped", reason: "LEAD_CLOSED" });
    }
    const w = await world();
    expect(
      await runDial({ dialer: new FakeDialer(), now: () => WED_10 }, ctxFor(w), {
        ...payload(w),
        leadId: randomUUID(),
      }),
    ).toEqual({ status: "skipped", reason: "LEAD_NOT_FOUND" });
  });
  it("tenant isolation: another tenant's job cannot dial this lead", async () => {
    const a = await world();
    const b = await world();
    const dialer = new FakeDialer();
    const out = await runDial({ dialer, now: () => WED_10 }, ctxFor(b), {
      ...payload(b),
      leadId: a.leadId,
    });
    expect(out).toEqual({ status: "skipped", reason: "LEAD_NOT_FOUND" });
    expect(dialer.requests).toHaveLength(0);
  });
});

describe("provider errors", () => {
  it("a permanent provider error fails the attempt, records the code, and frees the lead for a later dial", async () => {
    const w = await world();
    const dialer = new FakeDialer();
    dialer.failures = [new DialerError("PROVIDER_REJECTED", "bad number", false)];
    const out = await runDial({ dialer, now: () => WED_10 }, ctxFor(w), payload(w));
    expect(out).toMatchObject({ status: "failed", code: "PROVIDER_REJECTED" });
    const [a] = await attempts(w);
    expect(a).toMatchObject({ status: "failed", reject_code: "PROVIDER_REJECTED" });
    expect((await lead(w)).last_reject_code).toBe("PROVIDER_REJECTED");
    // no longer active -> the next dial can proceed
    expect((await runDial({ dialer, now: () => WED_10 }, ctxFor(w), payload(w))).status).toBe(
      "dialed",
    );
  });

  it("a transient provider error is rethrown (pg-boss retries) and the reservation stays", async () => {
    const w = await world();
    const dialer = new FakeDialer();
    dialer.failures = [new DialerError("PROVIDER_TIMEOUT", "timeout", true)];
    await expect(runDial({ dialer, now: () => WED_10 }, ctxFor(w), payload(w))).rejects.toThrow(
      /timeout/,
    );
    const rows = await attempts(w);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("reserved");
  });
});

describe("EXACTLY ONCE (the chaos cases)", () => {
  it("8 concurrent dial jobs for the same lead -> ONE attempt and ONE real call", async () => {
    const w = await world({ openAllHours: true });
    const dialer = new FakeDialer();
    const outs = await Promise.all(
      Array.from({ length: 8 }, () => runDial({ dialer }, ctxFor(w), payload(w))),
    );
    expect(outs.filter((o) => o.status === "dialed")).toHaveLength(1);
    expect(outs.filter((o) => o.status === "skipped")).toHaveLength(7);
    expect(await attempts(w)).toHaveLength(1);
    expect(dialer.realCalls).toBe(1);
    expect(dialer.requests).toHaveLength(1);
  });

  it("worker dies right after the reservation commits; the SAME job is re-delivered -> resumes, still ONE call", async () => {
    const w = await world();
    const dialer = new FakeDialer();
    const jobId = randomUUID();
    await expect(
      runDial({ dialer, now: () => WED_10 }, ctxFor(w, jobId), payload(w), {
        afterReserve: () => {
          throw new Error("SIMULATED_CRASH");
        },
      }),
    ).rejects.toThrow(/SIMULATED_CRASH/);
    expect(dialer.requests).toHaveLength(0);
    const [reserved] = await attempts(w);
    expect(reserved).toMatchObject({ status: "reserved", dial_job_id: jobId });
    await ageAttempt(w, reserved!.id, 3_000); // crash happened 3 s before "now" (fixed test clock vs real DB clock)

    // restart: pg-boss hands the same job (same id) to a new worker
    const out = await runDial({ dialer, now: () => WED_10 }, ctxFor(w, jobId), payload(w));
    expect(out).toMatchObject({ status: "dialed", attemptId: reserved!.id });
    expect(await attempts(w)).toHaveLength(1);
    expect(dialer.realCalls).toBe(1);
    expect(dialer.requests[0]!.idempotencyKey).toBe(reserved!.id);
  });

  it("provider placed the call but the response was lost (timeout): retry reuses the key -> ONE real call", async () => {
    const w = await world();
    const dialer = new FakeDialer();
    dialer.placeBeforeFailing = true;
    dialer.failures = [new DialerError("PROVIDER_TIMEOUT", "response lost", true)];
    const jobId = randomUUID();
    await expect(
      runDial({ dialer, now: () => WED_10 }, ctxFor(w, jobId), payload(w)),
    ).rejects.toThrow(/response lost/);
    expect(dialer.realCalls).toBe(1); // the provider DID place it
    await ageAttempt(w, (await attempts(w))[0]!.id, 3_000);

    const out = await runDial({ dialer, now: () => WED_10 }, ctxFor(w, jobId), payload(w));
    expect(out.status).toBe("dialed");
    expect(dialer.requests).toHaveLength(2);
    expect(dialer.requests[0]!.idempotencyKey).toBe(dialer.requests[1]!.idempotencyKey);
    expect(dialer.realCalls).toBe(1);
    expect(await attempts(w)).toHaveLength(1);
    expect((await attempts(w))[0]!.dograh_run_id).toBeTruthy();
  });

  it("a DIFFERENT job meeting a FRESH reservation backs off (someone is dialling); no second call", async () => {
    const w = await world();
    const dialer = new FakeDialer();
    await expect(
      runDial({ dialer, now: () => WED_10 }, ctxFor(w, randomUUID()), payload(w), {
        afterReserve: () => {
          throw new Error("SIMULATED_CRASH");
        },
      }),
    ).rejects.toThrow();
    const [a] = await attempts(w);
    await ageAttempt(w, a!.id, 5_000); // 5 s old relative to "now"
    const out = await runDial({ dialer, now: () => WED_10 }, ctxFor(w, randomUUID()), payload(w));
    expect(out).toEqual({ status: "skipped", reason: "ALREADY_ACTIVE" });
    expect(dialer.requests).toHaveLength(0);
  });

  it("...but once that reservation is STALE (> 45 s), another job resumes it with the same key", async () => {
    const w = await world();
    const dialer = new FakeDialer();
    await expect(
      runDial({ dialer, now: () => WED_10 }, ctxFor(w, randomUUID()), payload(w), {
        afterReserve: () => {
          throw new Error("SIMULATED_CRASH");
        },
      }),
    ).rejects.toThrow();
    const [a] = await attempts(w);
    await ageAttempt(w, a!.id, 120_000);
    const out = await runDial({ dialer, now: () => WED_10 }, ctxFor(w, randomUUID()), payload(w));
    expect(out).toMatchObject({ status: "dialed", attemptId: a!.id });
    expect(await attempts(w)).toHaveLength(1);
    expect(dialer.realCalls).toBe(1);
  });

  it("resuming re-checks the policy: if the window closed meanwhile, the reservation is failed and rescheduled", async () => {
    const w = await world();
    const dialer = new FakeDialer();
    const jobId = randomUUID();
    await expect(
      runDial({ dialer, now: () => ist("2026-12-02T20:58") }, ctxFor(w, jobId), payload(w), {
        afterReserve: () => {
          throw new Error("SIMULATED_CRASH");
        },
      }),
    ).rejects.toThrow();
    await ageAttempt(w, (await attempts(w))[0]!.id, 32 * 60_000, ist("2026-12-02T21:30")); // reserved 32 min before the resume
    const out = await runDial(
      { dialer, now: () => ist("2026-12-02T21:30") },
      ctxFor(w, jobId),
      payload(w),
    );
    expect(out).toMatchObject({ status: "rejected", code: "OUTSIDE_WINDOW", rescheduled: true });
    expect(dialer.requests).toHaveLength(0);
    const [a] = await attempts(w);
    expect(a).toMatchObject({ status: "failed", reject_code: "OUTSIDE_WINDOW" });
  });

  it("a reservation older than 6 h is abandoned (never resumed) and a fresh attempt is made", async () => {
    const w = await world();
    const dialer = new FakeDialer();
    await expect(
      runDial({ dialer, now: () => WED_10 }, ctxFor(w, randomUUID()), payload(w), {
        afterReserve: () => {
          throw new Error("SIMULATED_CRASH");
        },
      }),
    ).rejects.toThrow();
    const [old] = await attempts(w);
    await ageAttempt(w, old!.id, ABANDON_RESERVATION_MS + 60_000);
    const out = await runDial({ dialer, now: () => WED_10 }, ctxFor(w, randomUUID()), payload(w));
    expect(out.status).toBe("dialed");
    const rows = await attempts(w);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === old!.id)).toMatchObject({
      status: "failed",
      reject_code: "ABANDONED",
    });
    expect(dialer.realCalls).toBe(1);
  });

  it("an attempt that is already dialing / in progress blocks a second dial", async () => {
    const w = await world();
    const dialer = new FakeDialer();
    await runDial({ dialer, now: () => WED_10 }, ctxFor(w), payload(w));
    const out = await runDial({ dialer, now: () => WED_10 }, ctxFor(w), payload(w));
    expect(out).toEqual({ status: "skipped", reason: "ALREADY_ACTIVE" });
    expect(dialer.realCalls).toBe(1);
  });
});

describe("end to end through pg-boss and the real worker", () => {
  it("enqueue in a transaction -> worker dials -> attempt is 'dialing' within a few seconds", async () => {
    const w = await world({ openAllHours: true });
    const dialer = new FakeDialer();
    const worker = await startWorker({
      databaseUrl: env.config.databaseUrl,
      db: env.db,
      jobs: [dialJob],
      secrets,
      deps: { dialer },
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    try {
      const t0 = Date.now();
      await withTenant(env.db, w.tenant.id, (tx) =>
        queue.enqueueInTx(tx, dialJob, {
          tenantId: w.tenant.id,
          leadId: w.leadId,
          trigger: "intake",
        }),
      );
      let a;
      for (let i = 0; i < 60 && !a; i++) {
        await new Promise((r) => setTimeout(r, 100));
        a = (await attempts(w)).find((x) => x.status === "dialing");
      }
      expect(a, "attempt reached 'dialing'").toBeTruthy();
      expect(Date.now() - t0).toBeLessThan(5_000); // comfortably inside the 30 s promise
      expect(dialer.realCalls).toBe(1);
    } finally {
      await worker.stop();
    }
  });
});
