import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { dashboardResponse, type DashboardResponse } from "@vernacular/contracts";
import { withTenant } from "@vernacular/db";
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
let T: TestTenant;
let E: TestTenant; // empty tenant
const ck: Record<string, string> = {};
let g1: string;
let g2: string;
let s1: string;
let s2: string;

const rows = <R>(fn: (t: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<R>) =>
  withTenant(env.db, T.id, fn);
async function dash(qs = "", who = "head"): Promise<DashboardResponse> {
  const res = await env.app.inject({
    url: `/api/dashboard${qs ? `?${qs}` : ""}`,
    headers: asUser(ck[who]!),
  });
  expect(res.statusCode, res.body).toBe(200);
  return dashboardResponse.parse(res.json());
}
const funnel = (d: DashboardResponse) =>
  Object.fromEntries(d.funnel.map((f) => [f.stage, f.count]));

beforeAll(async () => {
  env = await buildTestEnv();
  T = await createTenant(env, "dash");
  E = await createTenant(env, "dash-empty");
  for (const [k, role] of [
    ["head", "admission_head"],
    ["admin", "admin"],
    ["c1", "counsellor"],
  ] as const)
    await createUser(env, T, k, role);
  await createUser(env, E, "admin", "admin");
  for (const [k, u] of Object.entries(T.users)) ck[k] = await login(env.app, u.email);
  ck.empty = await login(env.app, E.users.admin!.email);
  g1 = await createAgent(env, T, "Agent One");
  g2 = await createAgent(env, T, "Agent Two");

  await rows(async (t) => {
    s1 = (
      await t
        .insertInto("intake_source")
        .values({ tenant_id: T.id, name: "Web", kind: "form" })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    s2 = (
      await t
        .insertInto("intake_source")
        .values({ tenant_id: T.id, name: "Meta", kind: "meta" })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    const cycle = await t.selectFrom("admission_cycle").select("id").executeTakeFirstOrThrow();
    const mk = async (
      key: string,
      at: string,
      stage: string,
      temp: string | null,
      src: string | null,
      agent: string | null,
    ) => {
      const p = await t
        .insertInto("person")
        .values({ tenant_id: T.id, full_name: key })
        .returning("id")
        .executeTakeFirstOrThrow();
      const l = await t
        .insertInto("lead")
        .values({
          tenant_id: T.id,
          person_id: p.id,
          cycle_id: cycle.id,
          stage,
          current_temperature: temp,
          source_id: src,
          ai_agent_id: agent,
          created_at: new Date(at),
        } as never)
        .returning("id")
        .executeTakeFirstOrThrow();
      return l.id;
    };
    const l1 = await mk("l1", "2026-03-01T19:00:00Z", "new", "hot", s1, g1); // = Mar 2 00:30 IST
    const l2 = await mk("l2", "2026-03-02T05:00:00Z", "interested", "warm", s1, g1);
    const l3 = await mk("l3", "2026-03-02T10:00:00Z", "applied", "hot", s2, g2);
    const l4 = await mk("l4", "2026-03-03T10:00:00Z", "fee_paid", "hot", s2, null);
    const l5 = await mk("l5", "2026-03-03T10:00:00Z", "lost", "cold", null, g2);
    await mk("l6", "2026-02-20T10:00:00Z", "enrolled", "hot", s1, g1); // outside the range

    const call = (
      lead: string,
      status: string,
      durationS: number | null,
      startedAt: string | Date,
      agent: string,
    ) =>
      t
        .insertInto("call_attempt")
        .values({
          tenant_id: T.id,
          lead_id: lead,
          status,
          duration_s: durationS,
          started_at: new Date(startedAt),
          ai_agent_id: agent,
        } as never)
        .execute();
    await call(l2, "completed", 90, "2026-03-02T06:00:00Z", g1);
    await call(l2, "completed", 14, "2026-03-02T07:00:00Z", g1); // placed, NOT connected (< 15 s)
    await call(l2, "no_answer", 0, "2026-03-02T08:00:00Z", g1);
    await call(l2, "completed", 15, "2026-03-02T09:00:00Z", g1); // exactly 15 s: connected
    await call(l3, "completed", 200, "2026-03-02T11:00:00Z", g2);
    await call(l3, "failed", 0, "2026-03-02T12:00:00Z", g2);
    await call(l4, "dialing", null, "2026-03-03T11:00:00Z", g2); // still ringing: not counted
    await call(l5, "reserved", null, "2026-03-03T11:00:00Z", g2); // not placed yet: not counted
    await call(l1, "completed", 60, new Date(), g1); // today (real clock): outside the March range
  });
});
afterAll(async () => env.close());

describe("GET /api/dashboard: exact numbers", () => {
  it("funnel, temperature, totals for 2 Mar - 3 Mar (local dates)", async () => {
    const d = await dash("from=2026-03-02&to=2026-03-03");
    expect(d.range).toEqual({ from: "2026-03-02", to: "2026-03-03", timezone: "Asia/Kolkata" });
    expect(funnel(d)).toEqual({
      new: 1,
      attempting: 0,
      connected: 0,
      interested: 1,
      visit_booked: 0,
      visited: 0,
      applied: 1,
      fee_paid: 1,
      enrolled: 0,
      lost: 1,
      invalid: 0,
    });
    expect(d.totals.leads).toBe(5);
    expect(Object.fromEntries(d.temperature.map((t) => [t.value, t.count]))).toEqual({
      hot: 3,
      warm: 1,
      cold: 1,
    });
  });

  it("the funnel always lists every stage, in pipeline order", async () => {
    const d = await dash("from=2026-03-02&to=2026-03-03");
    expect(d.funnel.map((f) => f.stage)).toEqual([
      "new",
      "attempting",
      "connected",
      "interested",
      "visit_booked",
      "visited",
      "applied",
      "fee_paid",
      "enrolled",
      "lost",
      "invalid",
    ]);
  });

  it("calls: placed, connected (>= 15 s), connect rate, average talk time; ringing/reserved are excluded", async () => {
    const d = await dash("from=2026-03-02&to=2026-03-03");
    expect(d.calls.inRange).toBe(6);
    expect(d.calls.connected).toBe(3); // 90, 15, 200
    expect(d.calls.connectRate).toBe(0.5);
    expect(d.calls.avgDurationS).toBe(101.7); // (90+15+200)/3
  });

  it("'calls today' is independent of the selected range", async () => {
    expect((await dash("from=2026-03-02&to=2026-03-03")).calls.today).toBe(1);
  });

  it("by source (including leads with no source) and by agent (including unassigned)", async () => {
    const d = await dash("from=2026-03-02&to=2026-03-03");
    expect(d.bySource).toEqual(
      [
        { sourceId: s1, name: "Web", leads: 2, hot: 1, applied: 0 },
        { sourceId: s2, name: "Meta", leads: 2, hot: 2, applied: 2 },
        { sourceId: null, name: "Unknown", leads: 1, hot: 0, applied: 0 },
      ].sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name)),
    );
    const by = Object.fromEntries(d.byAgent.map((a) => [a.name, a]));
    expect(by["Agent One"]).toMatchObject({
      agentId: g1,
      leads: 2,
      calls: 4,
      connected: 2,
      avgDurationS: 52.5,
    });
    expect(by["Agent Two"]).toMatchObject({
      agentId: g2,
      leads: 2,
      calls: 2,
      connected: 1,
      avgDurationS: 200,
    });
    expect(by["Unassigned"]).toMatchObject({
      agentId: null,
      leads: 1,
      calls: 0,
      connected: 0,
      avgDurationS: null,
    });
  });

  it("matches direct SQL (no sampling): totals and call counts", async () => {
    const d = await dash("from=2026-03-02&to=2026-03-03");
    const sqlLeads = await rows((t) =>
      sql<{
        n: number;
      }>`select count(*)::int as n from lead where created_at >= '2026-03-01T18:30:00Z' and created_at < '2026-03-03T18:30:00Z'`.execute(
        t,
      ),
    );
    const sqlCalls = await rows((t) =>
      sql<{
        n: number;
      }>`select count(*)::int as n from call_attempt where started_at >= '2026-03-01T18:30:00Z' and started_at < '2026-03-03T18:30:00Z' and status not in ('reserved','dialing')`.execute(
        t,
      ),
    );
    expect(d.totals.leads).toBe(sqlLeads.rows[0]!.n);
    expect(d.calls.inRange).toBe(sqlCalls.rows[0]!.n);
  });
});

describe("local-date boundaries", () => {
  it("a lead created at 00:30 IST on 2 Mar belongs to 2 Mar, NOT 1 Mar (its UTC date)", async () => {
    expect((await dash("from=2026-03-01&to=2026-03-01")).totals.leads).toBe(0);
    const d = await dash("from=2026-03-02&to=2026-03-02");
    expect(d.totals.leads).toBe(3); // l1, l2, l3
    expect(funnel(d).new).toBe(1);
  });
  it("the default range is the last 30 local days ending today", async () => {
    const d = await dash();
    const to = d.range.to;
    expect(Math.round((Date.parse(to) - Date.parse(d.range.from)) / 86_400_000)).toBe(29);
    expect(to).toBe(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()),
    );
  });
});

describe("filters", () => {
  it("by agent", async () => {
    const d = await dash(`from=2026-03-02&to=2026-03-03&agentId=${g1}`);
    expect(d.totals.leads).toBe(2);
    expect(d.calls.inRange).toBe(4);
    expect(d.byAgent.map((a) => a.agentId)).toEqual([g1]);
  });
  it("by source", async () => {
    const d = await dash(`from=2026-03-02&to=2026-03-03&sourceId=${s2}`);
    expect(d.totals.leads).toBe(2);
    expect(d.calls.inRange).toBe(2);
    expect(d.bySource.map((s) => s.name)).toEqual(["Meta"]);
  });
  it("both together", async () => {
    expect(
      (await dash(`from=2026-03-02&to=2026-03-03&sourceId=${s1}&agentId=${g1}`)).totals.leads,
    ).toBe(2);
    expect(
      (await dash(`from=2026-03-02&to=2026-03-03&sourceId=${s1}&agentId=${g2}`)).totals.leads,
    ).toBe(0);
  });
});

describe("access, validation, empty data", () => {
  it("owner/admin/head only: counsellors get 403", async () => {
    expect(
      (await env.app.inject({ url: "/api/dashboard", headers: asUser(ck.c1!) })).statusCode,
    ).toBe(403);
    expect(
      (await env.app.inject({ url: "/api/dashboard", headers: asUser(ck.admin!) })).statusCode,
    ).toBe(200);
  });
  it("rejects reversed ranges, ranges over a year, bad dates and non-uuid filters", async () => {
    for (const qs of [
      "from=2026-03-05&to=2026-03-01",
      "from=2025-01-01&to=2026-03-01",
      "from=03-01-2026",
      "from=2026-02-30",
      "agentId=nope",
    ]) {
      expect(
        (await env.app.inject({ url: `/api/dashboard?${qs}`, headers: asUser(ck.head!) }))
          .statusCode,
        qs,
      ).toBe(422);
    }
  });
  it("a tenant with no data gets zeros and nulls (never NaN or errors)", async () => {
    const res = await env.app.inject({ url: "/api/dashboard", headers: asUser(ck.empty!) });
    const d = dashboardResponse.parse(res.json());
    expect(d.totals.leads).toBe(0);
    expect(d.calls).toEqual({
      today: 0,
      inRange: 0,
      connected: 0,
      connectRate: null,
      avgDurationS: null,
    });
    expect(d.bySource).toEqual([]);
    expect(d.byAgent).toEqual([]);
    expect(d.temperature).toEqual([]);
  });
  it("another tenant's data never appears", async () => {
    const d = dashboardResponse.parse(
      (
        await env.app.inject({
          url: "/api/dashboard?from=2026-03-02&to=2026-03-03",
          headers: asUser(ck.empty!),
        })
      ).json(),
    );
    expect(d.totals.leads).toBe(0);
  });
});
