import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@vernacular/db";
import { allJobs, installJobs } from "../src/jobs/index.js";
import {
  asUser,
  buildTestEnv,
  createAgent,
  createLead,
  createTenant,
  createUser,
  login,
  type TestEnv,
  type TestTenant,
} from "./helpers.js";

/**
 * One test per WRITE route: tenant B, holding valid credentials, uses tenant A's ids.
 * Expected: 404 (or 422 for "this id isn't yours" validation), and tenant A's data is byte-for-byte unchanged.
 */
let env: TestEnv;
let owner: pg.Pool;
let A: TestTenant;
let B: TestTenant;
let ckB: string;
let leadA: string;
let sourceA: { id: string; token: string; url: string };
let holidayA: string;
let programA: string;
let agentA: string;
let subStageA: string;
let leadB: string;

const asB = (method: "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: object) =>
  env.app.inject({ method, url, headers: asUser(ckB), payload });
const inA = <R>(fn: (t: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<R>) =>
  withTenant(env.db, A.id, fn);
const inB = <R>(fn: (t: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<R>) =>
  withTenant(env.db, B.id, fn);

beforeAll(async () => {
  env = await buildTestEnv();
  owner = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 2 });
  await installJobs(process.env.DATABASE_MIGRATION_URL!, allJobs);
  A = await createTenant(env, "xw-a");
  B = await createTenant(env, "xw-b");
  await createUser(env, A, "admin", "admin");
  await createUser(env, B, "admin", "admin");
  const ckA = await login(env.app, A.users.admin!.email);
  ckB = await login(env.app, B.users.admin!.email);

  agentA = await createAgent(env, A, "A agent");
  programA = (
    await inA((t) =>
      t
        .insertInto("program")
        .values({ tenant_id: A.id, name: "A program" })
        .returning("id")
        .executeTakeFirstOrThrow(),
    )
  ).id;
  subStageA = (
    await inA((t) =>
      t
        .insertInto("lead_sub_stage")
        .values({ tenant_id: A.id, core_stage: "new", name: "A sub" })
        .returning("id")
        .executeTakeFirstOrThrow(),
    )
  ).id;
  leadA = (await createLead(env, A, { fullName: "Alice" })).leadId;
  leadB = (await createLead(env, B, { fullName: "Bob" })).leadId;
  const s = (
    await env.app.inject({
      method: "POST",
      url: "/api/settings/sources",
      headers: asUser(ckA),
      payload: { name: "A source" },
    })
  ).json();
  sourceA = { id: s.id, token: s.token, url: new URL(s.endpointUrl).pathname };
  holidayA = (
    await env.app.inject({
      method: "POST",
      url: "/api/settings/holidays",
      headers: asUser(ckA),
      payload: { date: "2026-12-25", name: "A holiday" },
    })
  ).json().id;
});
afterAll(async () => {
  await owner.end();
  await env.close();
});

describe("tenant B cannot write to tenant A", () => {
  it("PATCH /api/leads/:id", async () => {
    const before = await inA((t) =>
      t.selectFrom("lead").selectAll().where("id", "=", leadA).executeTakeFirstOrThrow(),
    );
    const res = await asB("PATCH", `/api/leads/${leadA}`, {
      nextStep: "callback",
      stage: "lost",
      reason: "attack",
      ownerCounsellorId: B.users.admin!.id,
    });
    expect(res.statusCode).toBe(404);
    const after = await inA((t) =>
      t.selectFrom("lead").selectAll().where("id", "=", leadA).executeTakeFirstOrThrow(),
    );
    expect(after).toEqual(before);
    expect(
      await inA((t) =>
        t.selectFrom("lead_stage_history").select("id").where("lead_id", "=", leadA).execute(),
      ),
    ).toEqual([]);
  });

  it("POST /api/leads/:id/notes", async () => {
    expect((await asB("POST", `/api/leads/${leadA}/notes`, { body: "injected" })).statusCode).toBe(
      404,
    );
    expect(
      await inA((t) =>
        t.selectFrom("lead_note").select("id").where("lead_id", "=", leadA).execute(),
      ),
    ).toEqual([]);
  });

  it("POST /api/leads/:id/call-now", async () => {
    expect((await asB("POST", `/api/leads/${leadA}/call-now`)).statusCode).toBe(404);
    const jobs = await owner.query(
      `select 1 from pgboss.job where name = 'call.dial' and data->>'leadId' = $1`,
      [leadA],
    );
    expect(jobs.rowCount).toBe(0);
  });

  it("PATCH /api/settings/sources/:id, rotate-token and test-mapping", async () => {
    const before = await inA((t) =>
      t
        .selectFrom("intake_source")
        .selectAll()
        .where("id", "=", sourceA.id)
        .executeTakeFirstOrThrow(),
    );
    expect(
      (
        await asB("PATCH", `/api/settings/sources/${sourceA.id}`, {
          name: "hijacked",
          isActive: false,
        })
      ).statusCode,
    ).toBe(404);
    expect((await asB("POST", `/api/settings/sources/${sourceA.id}/rotate-token`)).statusCode).toBe(
      404,
    );
    expect(
      (await asB("POST", `/api/settings/sources/${sourceA.id}/test-mapping`, { payload: {} }))
        .statusCode,
    ).toBe(404);
    const after = await inA((t) =>
      t
        .selectFrom("intake_source")
        .selectAll()
        .where("id", "=", sourceA.id)
        .executeTakeFirstOrThrow(),
    );
    expect(after).toEqual(before); // name, flag and token hash untouched
    // A's token still works
    const ok = await env.app.inject({
      method: "POST",
      url: sourceA.url,
      headers: { authorization: `Bearer ${sourceA.token}` },
      payload: { phone: "9811100011" },
    });
    expect(ok.statusCode).toBe(202);
  });

  it("POST /api/settings/sources can't point at A's program or agent", async () => {
    const p = await asB("POST", "/api/settings/sources", { name: "x", defaultProgramId: programA });
    expect(p.statusCode).toBe(422);
    expect(p.json().error.details[0].path).toBe("defaultProgramId");
    const a = await asB("POST", "/api/settings/sources", { name: "x", defaultAgentId: agentA });
    expect(a.statusCode).toBe(422);
    expect(await inB((t) => t.selectFrom("intake_source").select("id").execute())).toEqual([]);
  });

  it("A's source token does not authenticate against B's source key", async () => {
    const bSrc = (await asB("POST", "/api/settings/sources", { name: "B source" })).json();
    const res = await env.app.inject({
      method: "POST",
      url: new URL(bSrc.endpointUrl).pathname,
      headers: { authorization: `Bearer ${sourceA.token}` },
      payload: { phone: "9811100022" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("DELETE /api/settings/holidays/:id", async () => {
    expect((await asB("DELETE", `/api/settings/holidays/${holidayA}`)).statusCode).toBe(404);
    expect(
      await inA((t) =>
        t.selectFrom("tenant_holiday").select("name").where("id", "=", holidayA).execute(),
      ),
    ).toEqual([{ name: "A holiday" }]);
  });

  it("POST /api/settings/holidays and PUT /api/settings/policy only ever touch the caller's tenant", async () => {
    const policyA = await inA((t) =>
      t.selectFrom("tenant_policy").selectAll().executeTakeFirstOrThrow(),
    );
    await asB("POST", "/api/settings/holidays", { date: "2026-12-25", name: "B holiday" });
    const put = await asB("PUT", "/api/settings/policy", {
      callWindowStart: "11:00",
      callWindowEnd: "12:00",
      allowedDays: [1],
      maxAttemptsPerDay: 1,
      maxAttemptsTotal: 1,
      minGapMinutes: 0,
      requireConsent: false,
      ndncCheck: false,
      promoRequires140: false,
      aiDisclosureText: "B only",
    });
    expect(put.statusCode).toBe(200);
    expect(
      await inA((t) => t.selectFrom("tenant_policy").selectAll().executeTakeFirstOrThrow()),
    ).toEqual(policyA);
    expect(await inA((t) => t.selectFrom("tenant_holiday").select("name").execute())).toEqual([
      { name: "A holiday" },
    ]);
    expect(
      (
        await inB((t) =>
          t.selectFrom("tenant_policy").select("ai_disclosure_text").executeTakeFirstOrThrow(),
        )
      ).ai_disclosure_text,
    ).toBe("B only");
  });

  it("PATCH /api/leads/:id can't use another tenant's user as owner or another tenant's sub-stage", async () => {
    const owner422 = await asB("PATCH", `/api/leads/${leadB}`, {
      ownerCounsellorId: A.users.admin!.id,
    });
    expect(owner422.statusCode).toBe(422);
    const sub422 = await asB("PATCH", `/api/leads/${leadB}`, { subStageId: subStageA });
    expect(sub422.statusCode).toBe(422);
    const l = await inB((t) =>
      t
        .selectFrom("lead")
        .select(["owner_counsellor_id", "sub_stage_id"])
        .where("id", "=", leadB)
        .executeTakeFirstOrThrow(),
    );
    expect(l).toEqual({ owner_counsellor_id: null, sub_stage_id: null });
  });

  it("random ids behave exactly like A's ids (no information about what exists)", async () => {
    const a = await asB("PATCH", `/api/leads/${leadA}`, { nextStep: "callback" });
    const r = await asB("PATCH", `/api/leads/${randomUUID()}`, { nextStep: "callback" });
    expect(a.statusCode).toBe(r.statusCode);
    expect(a.body).toBe(r.body);
  });
});
