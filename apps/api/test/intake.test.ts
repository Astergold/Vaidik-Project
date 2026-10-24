import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@vernacular/db";
import { allJobs, dialJob, installJobs, startWorker } from "../src/jobs/index.js";
import { FakeDialer } from "../src/modules/calls/dialer.js";
import { buildServer } from "../src/server.js";
import { createAuth, createAuthPool } from "../src/auth/auth.js";
import {
  asUser,
  buildTestEnv,
  createAgent,
  createTenant,
  createUser,
  login,
  type TestEnv,
  type TestTenant,
} from "./helpers.js";

let env: TestEnv;
let owner: pg.Pool;
let T: TestTenant;
let cookie: string;
let programId: string;
let agentId: string;
let src: { id: string; token: string; url: string };

const tenantRows = <R>(
  tenantId: string,
  fn: (t: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<R>,
) => withTenant(env.db, tenantId, fn);

async function createSource(over: Record<string, unknown> = {}, who = cookie) {
  const res = await env.app.inject({
    method: "POST",
    url: "/api/settings/sources",
    headers: asUser(who),
    payload: {
      name: "Website",
      kind: "form",
      defaultProgramId: programId,
      defaultAgentId: agentId,
      ...over,
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const b = res.json();
  return { id: b.id as string, token: b.token as string, url: new URL(b.endpointUrl).pathname };
}
const post = (
  s: { url: string; token: string },
  payload: unknown,
  headers: Record<string, string> = {},
) =>
  env.app.inject({
    method: "POST",
    url: s.url,
    headers: { authorization: `Bearer ${s.token}`, ...headers },
    payload: payload as object,
  });
const phone = () =>
  `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`.replace(/^(\d)\1+$/, "9876543210");
const jobsFor = async (leadId: string) =>
  (
    await owner.query(
      `select data from pgboss.job where name = 'call.dial' and data->>'leadId' = $1`,
      [leadId],
    )
  ).rows;

beforeAll(async () => {
  env = await buildTestEnv();
  owner = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 2 });
  await installJobs(process.env.DATABASE_MIGRATION_URL!, allJobs);
  T = await createTenant(env, "intake");
  await createUser(env, T, "admin", "admin");
  cookie = await login(env.app, T.users.admin!.email);
  agentId = await createAgent(env, T, "Asha");
  programId = (
    await tenantRows(T.id, (t) =>
      t
        .insertInto("program")
        .values({ tenant_id: T.id, name: "B.Tech Computer Science" })
        .returning("id")
        .executeTakeFirstOrThrow(),
    )
  ).id;
  src = await createSource();
});
afterAll(async () => {
  await owner.end();
  await env.close();
});

describe("authentication (the provider is not a logged-in user)", () => {
  it("no credentials / wrong token / malformed header -> 401, identical body, nothing created", async () => {
    const before = await tenantRows(T.id, (t) =>
      t
        .selectFrom("person")
        .select((e) => e.fn.countAll<string>().as("n"))
        .executeTakeFirstOrThrow(),
    );
    const bodies = new Set<string>();
    for (const headers of [
      {},
      { authorization: "Bearer vk_src_nope" },
      { authorization: "Basic abc" },
      { authorization: "Bearer" },
    ]) {
      const res = await env.app.inject({
        method: "POST",
        url: src.url,
        headers,
        payload: { phone: phone() },
      });
      expect(res.statusCode).toBe(401);
      bodies.add(res.body);
    }
    expect(bodies.size).toBe(1);
    const after = await tenantRows(T.id, (t) =>
      t
        .selectFrom("person")
        .select((e) => e.fn.countAll<string>().as("n"))
        .executeTakeFirstOrThrow(),
    );
    expect(after.n).toBe(before.n);
  });

  it("an unknown source key looks exactly like a wrong token (no enumeration)", async () => {
    const wrong = await post({ url: src.url, token: "vk_src_wrong" }, { phone: phone() });
    const unknown = await post(
      { url: `/api/intake/${"a".repeat(64)}`, token: src.token },
      { phone: phone() },
    );
    expect(unknown.statusCode).toBe(401);
    expect(unknown.body).toBe(wrong.body);
  });

  it("another source's token does not work on this source", async () => {
    const other = await createSource({ name: "Other" });
    expect((await post({ url: src.url, token: other.token }, { phone: phone() })).statusCode).toBe(
      401,
    );
  });

  it("a deactivated source stops accepting immediately", async () => {
    const s = await createSource({ name: "Temp" });
    expect((await post(s, { phone: phone() })).statusCode).toBe(202);
    await env.app.inject({
      method: "PATCH",
      url: `/api/settings/sources/${s.id}`,
      headers: asUser(cookie),
      payload: { isActive: false },
    });
    expect((await post(s, { phone: phone() })).statusCode).toBe(401);
  });

  it("rotating the token kills the old one and the new one works", async () => {
    const s = await createSource({ name: "Rotating" });
    const rot = await env.app.inject({
      method: "POST",
      url: `/api/settings/sources/${s.id}/rotate-token`,
      headers: asUser(cookie),
    });
    const fresh = rot.json().token as string;
    expect((await post(s, { phone: phone() })).statusCode).toBe(401);
    expect((await post({ url: s.url, token: fresh }, { phone: phone() })).statusCode).toBe(202);
  });

  it("a suspended tenant is refused with 403", async () => {
    const S = await createTenant(env, "intake-susp");
    await createUser(env, S, "admin", "admin");
    const c = await login(env.app, S.users.admin!.email);
    const s = await createSource({ defaultProgramId: undefined, defaultAgentId: undefined }, c);
    await withTenant(env.db, S.id, (t) =>
      t.updateTable("tenant").set({ status: "suspended" }).where("id", "=", S.id).execute(),
    );
    const res = await post(s, { phone: phone() });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("TENANT_SUSPENDED");
  });
});

describe("accepting a lead", () => {
  it("creates person, identifier, lead, history, consent evidence and queues ONE call; auto-detects common field names", async () => {
    const p = phone();
    const res = await post(
      src,
      {
        Name: "Asha  Rao",
        Mobile: `+91 ${p.slice(0, 5)} ${p.slice(5)}`,
        Email: "Asha@Example.com",
        City: "Pune",
        Course: "b.tech computer science",
      },
      { "user-agent": "provider/1.0" },
    );
    expect(res.statusCode, res.body).toBe(202);
    const out = res.json();
    expect(out).toMatchObject({ status: "accepted", duplicate: false, queued: true, warnings: [] });

    const lead = await tenantRows(T.id, (t) =>
      t.selectFrom("lead").selectAll().where("id", "=", out.reference).executeTakeFirstOrThrow(),
    );
    expect(lead).toMatchObject({
      stage: "new",
      source_id: src.id,
      program_id: programId,
      ai_agent_id: agentId,
    });
    const person = await tenantRows(T.id, (t) =>
      t.selectFrom("person").selectAll().where("id", "=", lead.person_id).executeTakeFirstOrThrow(),
    );
    expect(person).toMatchObject({ full_name: "Asha Rao", city: "Pune" });
    const ids = await tenantRows(T.id, (t) =>
      t
        .selectFrom("person_identifier")
        .select(["kind", "value_norm", "is_primary"])
        .where("person_id", "=", lead.person_id)
        .orderBy("kind")
        .execute(),
    );
    expect(ids).toEqual([
      { kind: "email", value_norm: "asha@example.com", is_primary: false },
      { kind: "phone", value_norm: `+91${p}`, is_primary: true },
    ]);

    const hist = await tenantRows(T.id, (t) =>
      t
        .selectFrom("lead_stage_history")
        .select(["from_stage", "to_stage", "actor"])
        .where("lead_id", "=", lead.id)
        .execute(),
    );
    expect(hist).toEqual([{ from_stage: null, to_stage: "new", actor: "integration" }]);

    const consent = await tenantRows(T.id, (t) =>
      t.selectFrom("consent_record").selectAll().where("person_id", "=", lead.person_id).execute(),
    );
    expect(consent).toHaveLength(1);
    expect(consent[0]).toMatchObject({
      channel: "voice",
      purpose: "admission",
      granted: true,
      source: "form:Website",
    });
    expect(consent[0]!.evidence).toMatchObject({
      sourceId: src.id,
      sourceName: "Website",
      userAgent: "provider/1.0",
    });

    const jobs = await jobsFor(lead.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toMatchObject({ tenantId: T.id, leadId: lead.id, trigger: "intake" });
  });

  it("different spellings of the same number are the same person (duplicate: no second lead, no second job)", async () => {
    const p = phone();
    const first = (await post(src, { phone: p, name: "Original Name" })).json();
    for (const variant of [`+91${p}`, `91${p}`, `0${p}`, `+91-${p.slice(0, 5)}-${p.slice(5)}`]) {
      const again = await post(src, { phone: variant, name: "Different Name", city: "Nagpur" });
      expect(again.statusCode).toBe(202);
      expect(again.json()).toMatchObject({
        reference: first.reference,
        duplicate: true,
        queued: false,
      });
    }
    const n = await tenantRows(T.id, (t) =>
      t
        .selectFrom("lead as l")
        .innerJoin("person_identifier as i", "i.person_id", "l.person_id")
        .select((e) => e.fn.countAll<string>().as("n"))
        .where("i.value_norm", "=", `+91${p}`)
        .executeTakeFirstOrThrow(),
    );
    expect(n.n).toBe("1");
    expect(await jobsFor(first.reference)).toHaveLength(1);
    // blanks are filled, existing data is never overwritten
    const person = await tenantRows(T.id, (t) =>
      t
        .selectFrom("person as p")
        .innerJoin("lead as l", "l.person_id", "p.id")
        .select(["p.full_name", "p.city"])
        .where("l.id", "=", first.reference)
        .executeTakeFirstOrThrow(),
    );
    expect(person).toEqual({ full_name: "Original Name", city: "Nagpur" });
  });

  it("the same form posted 5x at once -> 1 person, 1 lead, 1 queued call", async () => {
    const p = phone();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post(src, { phone: p, name: "Burst" })),
    );
    expect(results.every((r) => r.statusCode === 202)).toBe(true);
    const refs = new Set(results.map((r) => r.json().reference));
    expect(refs.size).toBe(1);
    expect(results.filter((r) => r.json().duplicate === false)).toHaveLength(1);
    expect(await jobsFor([...refs][0] as string)).toHaveLength(1);
  });

  it("race stress: 10 different students x 8 simultaneous identical posts -> exactly one lead and one call EACH", async () => {
    const phones = Array.from({ length: 10 }, () => phone());
    const all = await Promise.all(
      phones.flatMap((p) =>
        Array.from({ length: 8 }, () =>
          post(src, { phone: p, name: "Stress" }).then((r) => ({ p, r })),
        ),
      ),
    );
    expect(
      all.every(({ r }) => r.statusCode === 202),
      "no request failed",
    ).toBe(true);
    for (const p of phones) {
      const mine = all.filter((x) => x.p === p).map((x) => x.r.json());
      expect(new Set(mine.map((m) => m.reference)).size, `phone ${p}: one lead`).toBe(1);
      expect(
        mine.filter((m) => m.duplicate === false),
        `phone ${p}: one creator`,
      ).toHaveLength(1);
      const persons = await tenantRows(T.id, (t) =>
        t
          .selectFrom("person_identifier")
          .select((e) => e.fn.countAll<string>().as("n"))
          .where("value_norm", "=", `+91${p}`)
          .executeTakeFirstOrThrow(),
      );
      expect(persons.n, `phone ${p}: one person`).toBe("1");
      expect(await jobsFor(mine[0].reference), `phone ${p}: one queued call`).toHaveLength(1);
    }
  });

  it("an email that already belongs to another person raises a duplicate candidate instead of failing", async () => {
    const email = `shared-${Date.now()}@example.com`;
    const a = (await post(src, { phone: phone(), email })).json();
    const b = await post(src, { phone: phone(), email });
    expect(b.statusCode).toBe(202);
    const cands = await tenantRows(T.id, (t) =>
      t.selectFrom("duplicate_candidate").select(["reason", "status"]).execute(),
    );
    expect(cands.some((c) => c.reason === "same_email" && c.status === "open")).toBe(true);
    expect(a.reference).not.toBe(b.json().reference);
  });

  it("explicit 'no consent' records granted=false; the lead is kept (the policy engine will block the call)", async () => {
    const s = await createSource({ name: "Consent form", fieldMapping: { consent: "agree" } });
    const out = (await post(s, { phone: phone(), agree: "no" })).json();
    const lead = await tenantRows(T.id, (t) =>
      t
        .selectFrom("lead")
        .select("person_id")
        .where("id", "=", out.reference)
        .executeTakeFirstOrThrow(),
    );
    const c = await tenantRows(T.id, (t) =>
      t
        .selectFrom("consent_record")
        .select(["granted", "channel"])
        .where("person_id", "=", lead.person_id)
        .execute(),
    );
    expect(c).toEqual([{ granted: false, channel: "voice" }]);
  });

  it("autoDial=false stores the lead but queues nothing", async () => {
    const s = await createSource({ name: "Manual review", autoDial: false });
    const out = (await post(s, { phone: phone() })).json();
    expect(out).toMatchObject({ duplicate: false, queued: false });
    expect(await jobsFor(out.reference)).toHaveLength(0);
  });

  it("accepts application/x-www-form-urlencoded (plain HTML form backends)", async () => {
    const p = phone();
    const res = await env.app.inject({
      method: "POST",
      url: src.url,
      headers: {
        authorization: `Bearer ${src.token}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      payload: `name=Form+User&mobile=${p}&city=Pune`,
    });
    expect(res.statusCode, res.body).toBe(202);
  });

  it("reports data problems as warnings without rejecting the lead", async () => {
    const res = await post(src, {
      phone: phone(),
      email: "not-an-email",
      language: "Klingon",
      course: "Underwater Basket Weaving",
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().warnings.sort()).toEqual([
      "EMAIL_INVALID",
      "LANGUAGE_UNRECOGNISED",
      "PROGRAM_NOT_FOUND",
    ]);
  });
});

describe("rejections", () => {
  it("invalid phone -> 422 with a reason code, and nothing is created", async () => {
    const before = await tenantRows(T.id, (t) =>
      t
        .selectFrom("person")
        .select((e) => e.fn.countAll<string>().as("n"))
        .executeTakeFirstOrThrow(),
    );
    for (const [body, reason] of [
      [{ name: "x", phone: "12345" }, "PHONE_INVALID"],
      [{ name: "x", phone: "9999999999" }, "PHONE_INVALID"],
      [{ name: "x" }, "PHONE_MISSING"],
    ] as const) {
      const res = await post(src, body);
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toMatchObject({
        code: "VALIDATION_ERROR",
        details: [{ path: "phone", message: reason }],
      });
    }
    const after = await tenantRows(T.id, (t) =>
      t
        .selectFrom("person")
        .select((e) => e.fn.countAll<string>().as("n"))
        .executeTakeFirstOrThrow(),
    );
    expect(after.n).toBe(before.n);
  });

  it("non-object bodies and oversized bodies are refused", async () => {
    expect((await post(src, [1, 2, 3])).statusCode).toBe(422);
    expect((await post(src, { phone: phone(), blob: "x".repeat(120_000) })).statusCode).toBe(413);
  });

  it("hostile keys in the payload are harmless", async () => {
    const res = await env.app.inject({
      method: "POST",
      url: src.url,
      headers: { authorization: `Bearer ${src.token}`, "content-type": "application/json" },
      payload: `{"phone":"${phone()}","__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}}}`,
    });
    expect(res.statusCode).toBe(202);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("a tenant with no current admission cycle gets a clear 409", async () => {
    const N = await createTenant(env, "intake-nocycle");
    await createUser(env, N, "admin", "admin");
    const c = await login(env.app, N.users.admin!.email);
    const s = await createSource({ defaultProgramId: undefined, defaultAgentId: undefined }, c);
    await withTenant(env.db, N.id, (t) =>
      t.updateTable("admission_cycle").set({ is_current: false }).execute(),
    );
    const res = await post(s, { phone: phone() });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("NO_ACTIVE_CYCLE");
  });

  it("is atomic: if the call cannot be queued, the lead is NOT half-created", async () => {
    const broken = await buildServer({
      config: env.config,
      db: env.db,
      mailer: env.mailer,
      auth: createAuth({
        config: env.config,
        mailer: env.mailer,
        pool: createAuthPool(env.config.databaseUrl),
      }),
      jobs: {
        enqueueInTx: async () => {
          throw new Error("queue unavailable");
        },
      } as never,
    });
    const p = phone();
    const res = await broken.inject({
      method: "POST",
      url: src.url,
      headers: { authorization: `Bearer ${src.token}` },
      payload: { phone: p, name: "Ghost" },
    });
    expect(res.statusCode).toBe(500);
    const found = await tenantRows(T.id, (t) =>
      t.selectFrom("person_identifier").select("id").where("value_norm", "=", `+91${p}`).execute(),
    );
    expect(found).toEqual([]);
    await broken.close();
  });
});

describe("isolation", () => {
  it("leads from tenant A's source are invisible to tenant B", async () => {
    const B = await createTenant(env, "intake-b");
    await createUser(env, B, "admin", "admin");
    const cb = await login(env.app, B.users.admin!.email);
    const p = phone();
    await post(src, { phone: p, name: "OnlyForA" });
    const res = await env.app.inject({ url: `/api/leads?q=OnlyForA`, headers: asUser(cb) });
    expect(res.json().total).toBe(0);
  });
});

describe("speed", () => {
  it("responds in well under 300 ms (p95 over 40 sequential posts)", async () => {
    const times: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      const r = await post(src, { phone: phone(), name: `Speed ${i}` });
      times.push(performance.now() - t0);
      expect(r.statusCode).toBe(202);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    console.warn(
      `[intake latency] p50=${times[20]!.toFixed(0)}ms p95=${p95.toFixed(0)}ms max=${times[39]!.toFixed(0)}ms`,
    );
    expect(p95).toBeLessThan(300);
  });

  it("submit -> real worker -> call placed: measured end to end (budget 30 s)", async () => {
    const S = await createTenant(env, "intake-e2e");
    await createUser(env, S, "admin", "admin");
    const c = await login(env.app, S.users.admin!.email);
    const a = await createAgent(env, S, "E2E agent");
    await withTenant(env.db, S.id, async (t) => {
      await t
        .updateTable("ai_agent")
        .set({ dograh_workflow_id: "wf-e2e" })
        .where("id", "=", a)
        .execute();
      await t
        .updateTable("tenant_policy")
        .set({
          call_window_start: "00:00",
          call_window_end: "23:59",
          allowed_days: [1, 2, 3, 4, 5, 6, 7],
          ndnc_check: false,
        } as never)
        .execute();
    });
    const secrets = env.app.secrets;
    await secrets.setSecret(S.id, "dograh_api_key", "k");
    const s = await createSource({ defaultProgramId: undefined, defaultAgentId: a }, c);

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
      const ms: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const out = (await post(s, { phone: phone(), name: `E2E ${i}` })).json();
        let dialing = false;
        for (let k = 0; k < 100 && !dialing; k++) {
          await new Promise((r) => setTimeout(r, 50));
          const row = await withTenant(env.db, S.id, (t) =>
            t
              .selectFrom("call_attempt")
              .select("status")
              .where("lead_id", "=", out.reference)
              .executeTakeFirst(),
          );
          dialing = row?.status === "dialing";
        }
        expect(dialing, `lead ${i} reached dialing`).toBe(true);
        ms.push(performance.now() - t0);
      }
      console.warn(`[submit -> dialing] ${ms.map((m) => m.toFixed(0)).join("ms, ")}ms`);
      expect(Math.max(...ms)).toBeLessThan(10_000);
      expect(dialer.realCalls).toBe(5);
    } finally {
      await worker.stop();
    }
  }, 60_000);
});
