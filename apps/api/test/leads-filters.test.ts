import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  leadsFiltersResponse,
  leadsListResponse,
  type LeadsFiltersResponse,
} from "@vernacular/contracts";
import { withTenant } from "@vernacular/db";
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
 * D2-I4-03a — GET /api/leads/filters: dropdown options for the Leads list.
 * member/"user" are Better Auth tables without RLS, so tenant isolation is the endpoint's own job:
 * these tests are the guard.
 */
let env: TestEnv;
let A: TestTenant;
let B: TestTenant;
const ck: Record<string, string> = {};
const id: Record<string, string> = {};

beforeAll(async () => {
  env = await buildTestEnv();
  A = await createTenant(env, "filters-a");
  B = await createTenant(env, "filters-b");
  // Names chosen so name order differs from insertion order.
  await createUser(env, A, "owner", "owner");
  await createUser(env, A, "head", "admission_head");
  await createUser(env, A, "zed", "counsellor");
  await createUser(env, A, "amy", "counsellor");
  await createUser(env, B, "admin", "admin");
  await createUser(env, B, "bob", "counsellor");
  for (const k of ["owner", "head", "zed", "amy"]) ck[k] = await login(env.app, A.users[k]!.email);
  ck.b = await login(env.app, B.users.admin!.email);
  ck.bob = await login(env.app, B.users.bob!.email);

  // A: two agents (Zara allocated to zed only), one inactive agent, two sources (one inactive)
  id.zara = await createAgent(env, A, "Zara (HI)", [A.users.zed!.id]);
  id.asha = await createAgent(env, A, "Asha (EN)", []);
  id.oldAgent = await createAgent(env, A, "Old agent", [A.users.zed!.id]);
  await withTenant(env.db, A.id, async (t) => {
    await t
      .updateTable("ai_agent")
      .set({ is_active: false })
      .where("id", "=", id.oldAgent!)
      .execute();
    const web = await t
      .insertInto("intake_source")
      .values({ tenant_id: A.id, name: "Website", kind: "form", secret_token_hash: "deadbeef" })
      .returning("id")
      .executeTakeFirstOrThrow();
    id.web = web.id;
    const agg = await t
      .insertInto("intake_source")
      .values({ tenant_id: A.id, name: "Aggregator", kind: "aggregator" })
      .returning("id")
      .executeTakeFirstOrThrow();
    id.agg = agg.id;
    await t
      .insertInto("intake_source")
      .values({ tenant_id: A.id, name: "Retired form", kind: "form", is_active: false })
      .execute();
  });
  // B: its own agent and source
  id.bAgent = await createAgent(env, B, "Bee agent", [B.users.bob!.id]);
  await withTenant(env.db, B.id, (t) =>
    t
      .insertInto("intake_source")
      .values({ tenant_id: B.id, name: "B form", kind: "form" })
      .execute(),
  );

  // Leads in A to prove the options actually filter
  id.l1 = (
    await createLead(env, A, {
      fullName: "Web Zara Zed",
      sourceId: id.web,
      agentId: id.zara,
      ownerId: A.users.zed!.id,
    })
  ).leadId;
  id.l2 = (
    await createLead(env, A, {
      fullName: "Web Asha Amy",
      sourceId: id.web,
      agentId: id.asha,
      ownerId: A.users.amy!.id,
    })
  ).leadId;
  id.l3 = (
    await createLead(env, A, {
      fullName: "Agg Zara Amy",
      sourceId: id.agg,
      agentId: id.zara,
      ownerId: A.users.amy!.id,
    })
  ).leadId;
});
afterAll(async () => env.close());

async function filters(who: string): Promise<{ raw: string; body: LeadsFiltersResponse }> {
  const res = await env.app.inject({ url: "/api/leads/filters", headers: asUser(ck[who]!) });
  expect(res.statusCode, res.body).toBe(200);
  return { raw: res.body, body: leadsFiltersResponse.parse(res.json()) };
}
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const names = (xs: { name: string }[]) => xs.map((x) => x.name);

describe("GET /api/leads/filters", () => {
  it("unauthenticated → 401", async () => {
    const res = await env.app.inject({ url: "/api/leads/filters" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("managers get every active source/agent and every counsellor, ordered by name", async () => {
    for (const who of ["owner", "head"]) {
      const { body } = await filters(who);
      expect(names(body.sources)).toEqual(["Aggregator", "Website"]); // inactive "Retired form" excluded
      expect(names(body.agents)).toEqual(["Asha (EN)", "Zara (HI)"]); // inactive "Old agent" excluded
      expect(ids(body.counsellors)).toEqual([A.users.amy!.id, A.users.zed!.id]); // "amy user" < "zed user"
      expect(body.counsellors.every((c) => c.isActive)).toBe(true);
      expect(body.sources.every((s) => s.isActive) && body.agents.every((a) => a.isActive)).toBe(
        true,
      );
    }
  });

  it("a counsellor is allowed and gets [self] + only their allocated (active) agents — mirrors leadScope", async () => {
    const zed = (await filters("zed")).body;
    expect(ids(zed.counsellors)).toEqual([A.users.zed!.id]);
    expect(ids(zed.agents)).toEqual([id.zara]); // not Asha (unallocated), not Old agent (inactive)
    expect(names(zed.sources)).toEqual(["Aggregator", "Website"]);
    const amy = (await filters("amy")).body;
    expect(ids(amy.counsellors)).toEqual([A.users.amy!.id]);
    expect(amy.agents).toEqual([]);
  });

  it("tenant isolation: each tenant sees only its own ids (member/user have no RLS)", async () => {
    const a = (await filters("owner")).body;
    const b = (await filters("b")).body;
    const aIds = [...ids(a.sources), ...ids(a.agents), ...ids(a.counsellors)];
    const bIds = [...ids(b.sources), ...ids(b.agents), ...ids(b.counsellors)];
    expect(aIds.filter((x) => bIds.includes(x))).toEqual([]);
    expect(names(b.sources)).toEqual(["B form"]);
    expect(ids(b.agents)).toEqual([id.bAgent]);
    expect(ids(b.counsellors)).toEqual([B.users.bob!.id]);
    expect(ids(a.counsellors)).not.toContain(B.users.bob!.id);
    // B's counsellor never sees A's people even though both are "counsellor" members
    expect(ids((await filters("bob")).body.counsellors)).toEqual([B.users.bob!.id]);
  });

  it("returns a slim shape: no secrets, mappings, provider ids or URLs", async () => {
    const { raw, body } = await filters("owner");
    for (const leak of [
      "secret_token_hash",
      "secretTokenHash",
      "field_mapping",
      "fieldMapping",
      "endpointUrl",
      "dograh_workflow_id",
      "dograhWorkflowId",
      "deadbeef",
      "source_key",
      "email",
    ]) {
      expect(raw).not.toContain(leak);
    }
    for (const o of [...body.sources, ...body.agents, ...body.counsellors]) {
      expect(Object.keys(o).sort()).toEqual(["id", "isActive", "name"]);
    }
  });

  it("the options are usable: /api/leads filtered by the returned ids gives the expected rows", async () => {
    const { body } = await filters("owner");
    const web = body.sources.find((s) => s.name === "Website")!.id;
    const zara = body.agents.find((a) => a.name === "Zara (HI)")!.id;
    const amy = body.counsellors.find((c) => c.id === A.users.amy!.id)!.id;
    const list = async (qs: string) => {
      const res = await env.app.inject({ url: `/api/leads?${qs}`, headers: asUser(ck.owner!) });
      expect(res.statusCode, res.body).toBe(200);
      return leadsListResponse
        .parse(res.json())
        .items.map((i) => i.id)
        .sort();
    };
    expect(await list(`sourceId=${web}`)).toEqual([id.l1, id.l2].sort());
    expect(await list(`agentId=${zara}`)).toEqual([id.l1, id.l3].sort());
    expect(await list(`counsellorId=${amy}`)).toEqual([id.l2, id.l3].sort());
    expect(await list(`sourceId=${web}&agentId=${zara}&counsellorId=${A.users.zed!.id}`)).toEqual([
      id.l1,
    ]);
  });
});

describe("routing next to /api/leads/:id", () => {
  it("the static /api/leads/filters wins over /api/leads/:id", async () => {
    const res = await env.app.inject({ url: "/api/leads/filters", headers: asUser(ck.owner!) });
    expect(res.statusCode).toBe(200);
    expect(leadsFiltersResponse.safeParse(res.json()).success).toBe(true);
  });

  it("/api/leads/:id still rejects a non-uuid id with 422", async () => {
    const res = await env.app.inject({ url: "/api/leads/not-a-uuid", headers: asUser(ck.owner!) });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });
});
