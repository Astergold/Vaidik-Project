import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leadsListResponse, type LeadsListResponse } from "@vernacular/contracts";
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

let env: TestEnv;
let A: TestTenant;
let B: TestTenant;
const ck: Record<string, string> = {};
const ids: Record<string, string> = {};

beforeAll(async () => {
  env = await buildTestEnv();
  A = await createTenant(env, "leads-a");
  B = await createTenant(env, "leads-b");
  for (const [k, role] of [
    ["admin", "admin"],
    ["head", "admission_head"],
    ["c1", "counsellor"],
    ["c2", "counsellor"],
  ] as const) {
    await createUser(env, A, k, role);
  }
  await createUser(env, B, "admin", "admin");
  for (const [k, u] of Object.entries(A.users)) ck[k] = await login(env.app, u.email);
  ck.b = await login(env.app, B.users.admin!.email);

  const agent = await createAgent(env, A, "Asha (HI)", [A.users.c2!.id]);
  const src = await withTenant(env.db, A.id, (t) =>
    t
      .insertInto("intake_source")
      .values({ tenant_id: A.id, name: "Website", kind: "form" })
      .returning("id")
      .executeTakeFirstOrThrow(),
  );

  const mk = async (key: string, s: Parameters<typeof createLead>[2]) =>
    (ids[key] = (await createLead(env, A, s)).leadId);
  await mk("ravi", {
    fullName: "Ravi Kumar",
    phone: "+919000000001",
    stage: "new",
    temperature: "hot",
    ownerId: A.users.c1!.id,
    city: "Pune",
    createdAt: new Date("2026-03-01T10:00:00Z"),
  });
  await mk("anita", {
    fullName: "Anita Sharma",
    phone: "+919000000002",
    stage: "interested",
    temperature: "warm",
    ownerId: A.users.c1!.id,
    sourceId: src.id,
    createdAt: new Date("2026-03-02T10:00:00Z"),
  });
  await mk("zoya", {
    fullName: "Zoya Khan",
    phone: "+919000000003",
    stage: "interested",
    temperature: "cold",
    agentId: agent,
    createdAt: new Date("2026-03-03T10:00:00Z"),
  });
  await mk("bimal", {
    fullName: "Bimal Das",
    phone: "+919000004444",
    stage: "visit_booked",
    temperature: "hot",
    agentId: agent,
    createdAt: new Date("2026-03-04T10:00:00Z"),
  });
  await mk("percent", {
    fullName: "100% Merit",
    phone: "+919000000005",
    stage: "new",
    createdAt: new Date("2026-03-05T10:00:00Z"),
  });
  await mk("nobody", {
    fullName: "Nina Nobody",
    phone: "+919000000006",
    stage: "attempting",
    createdAt: new Date("2026-03-06T10:00:00Z"),
  });
  // tenant B data that must never show up
  await createLead(env, B, { fullName: "Ravi Kumar", phone: "+919000000001" });
  await createLead(env, B, { fullName: "Bee Only" });

  // person-centric: Ravi has 3 calls but is ONE row
  await withTenant(env.db, A.id, async (t) => {
    for (const status of ["no_answer", "no_answer", "completed"]) {
      await t
        .insertInto("call_attempt")
        .values({ tenant_id: A.id, lead_id: ids.ravi!, status, started_at: new Date() } as never)
        .execute();
    }
  });
});
afterAll(async () => env.close());

async function list(who: string, qs = ""): Promise<LeadsListResponse> {
  const res = await env.app.inject({
    url: `/api/leads${qs ? `?${qs}` : ""}`,
    headers: asUser(ck[who]!),
  });
  expect(res.statusCode, res.body).toBe(200);
  return leadsListResponse.parse(res.json()); // the SAME schema the UI uses
}
const names = (r: LeadsListResponse) => r.items.map((i) => i.person.fullName);

describe("scoping by role", () => {
  it("admin / head see all 6 leads of the tenant and none of tenant B", async () => {
    for (const who of ["admin", "head"]) {
      const r = await list(who);
      expect(r.total).toBe(6);
      expect(names(r)).not.toContain("Bee Only");
    }
  });
  it("counsellor 1 sees only leads assigned to them", async () => {
    expect(names(await list("c1")).sort()).toEqual(["Anita Sharma", "Ravi Kumar"]);
  });
  it("counsellor 2 sees only leads of the AI agent allocated to them", async () => {
    expect(names(await list("c2")).sort()).toEqual(["Bimal Das", "Zoya Khan"]);
  });
  it("tenant B admin sees only tenant B, even searching for A's names", async () => {
    const r = await list("b", "q=Ravi");
    expect(r.total).toBe(1);
    expect(r.items[0]!.id).not.toBe(ids.ravi);
    expect((await list("b", "q=Anita")).total).toBe(0);
  });
  it("counsellor filter cannot widen their scope", async () => {
    const r = await list("c1", `counsellorId=${A.users.c2!.id}&agentId=${A.users.c2!.id}`);
    expect(r.total).toBe(0);
    const r2 = await list("c1", "stage=attempting"); // Nina is unassigned
    expect(r2.total).toBe(0);
  });
});

describe("phone masking is enforced server-side", () => {
  it("counsellors get the last 4 digits only", async () => {
    const ravi = (await list("c1")).items.find((i) => i.person.fullName === "Ravi Kumar")!;
    expect(ravi.person.phone).toBe("••••••0001");
    expect(JSON.stringify(await list("c1"))).not.toContain("+9190000000");
  });
  it("admin and head get full numbers", async () => {
    for (const who of ["admin", "head"]) {
      const ravi = (await list(who)).items.find((i) => i.person.fullName === "Ravi Kumar")!;
      expect(ravi.person.phone).toBe("+919000000001");
    }
  });
});

describe("person-centric rows", () => {
  it("a student with 3 calls is one row with callCount 3 and a lastCallAt", async () => {
    const r = await list("admin", "q=Ravi");
    expect(r.total).toBe(1);
    expect(r.items[0]).toMatchObject({
      callCount: 3,
      stage: "new",
      temperature: "hot",
      person: { city: "Pune" },
    });
    expect(r.items[0]!.lastCallAt).toBeTruthy();
  });
  it("joined fields come through (owner, agent, source)", async () => {
    const anita = (await list("admin", "q=Anita")).items[0]!;
    expect(anita.owner).toMatchObject({ id: A.users.c1!.id });
    expect(anita.source).toMatchObject({ name: "Website" });
    const zoya = (await list("admin", "q=Zoya")).items[0]!;
    expect(zoya.aiAgent).toMatchObject({ displayName: "Asha (HI)" });
  });
});

describe("filters", () => {
  it("stage: single, and multiple values", async () => {
    expect((await list("admin", "stage=interested")).total).toBe(2);
    expect((await list("admin", "stage=interested&stage=visit_booked")).total).toBe(3);
  });
  it("temperature", async () =>
    expect(names(await list("admin", "temperature=hot")).sort()).toEqual([
      "Bimal Das",
      "Ravi Kumar",
    ]));
  it("agent / counsellor / source", async () => {
    expect(
      (await list("admin", `agentId=${(await list("admin", "q=Zoya")).items[0]!.aiAgent!.id}`))
        .total,
    ).toBe(2);
    expect((await list("admin", `counsellorId=${A.users.c1!.id}`)).total).toBe(2);
    expect(
      (await list("admin", `sourceId=${(await list("admin", "q=Anita")).items[0]!.source!.id}`))
        .total,
    ).toBe(1);
  });
  it("created date range is inclusive, bare dates cover the whole day", async () => {
    expect((await list("admin", "createdFrom=2026-03-02&createdTo=2026-03-03")).total).toBe(2);
    expect((await list("admin", "createdFrom=2026-03-05")).total).toBe(2);
  });
  it("filters combine with AND", async () =>
    expect((await list("admin", "stage=interested&temperature=warm")).total).toBe(1));
  it("invalid enum / uuid values are 422, not a silent empty list", async () => {
    for (const qs of [
      "stage=nonsense",
      "temperature=lukewarm",
      "agentId=abc",
      "sort=password",
      "order=sideways",
    ]) {
      const res = await env.app.inject({ url: `/api/leads?${qs}`, headers: asUser(ck.admin!) });
      expect(res.statusCode, qs).toBe(422);
    }
  });
});

describe("search", () => {
  it("by name, case-insensitive", async () =>
    expect(names(await list("admin", "q=anita"))).toEqual(["Anita Sharma"]));
  it("by phone digits (>= 3), partial", async () => {
    expect(names(await list("admin", "q=4444"))).toEqual(["Bimal Das"]);
    expect(names(await list("admin", "q=9000000003"))).toEqual(["Zoya Khan"]);
  });
  it("counsellors can search by digits too, but only inside their scope", async () => {
    expect((await list("c1", "q=0001")).total).toBe(1);
    expect((await list("c1", "q=4444")).total).toBe(0);
  });
  it("by email", async () => {
    await withTenant(env.db, A.id, async (t) => {
      const p = await t
        .selectFrom("lead")
        .select("person_id")
        .where("id", "=", ids.nobody!)
        .executeTakeFirstOrThrow();
      await t
        .insertInto("person_identifier")
        .values({
          tenant_id: A.id,
          person_id: p.person_id,
          kind: "email",
          value_raw: "Nina@Example.com",
          value_norm: "nina@example.com",
        })
        .execute();
    });
    expect(names(await list("admin", "q=nina@exam"))).toEqual(["Nina Nobody"]);
  });
  it("LIKE wildcards in the query are literal ('%' does not match everything)", async () => {
    expect(names(await list("admin", `q=${encodeURIComponent("%")}`))).toEqual(["100% Merit"]);
    expect((await list("admin", `q=${encodeURIComponent("_")}`)).total).toBe(0);
  });
  it("2-digit queries do not trigger phone search (too broad)", async () =>
    expect((await list("admin", "q=90")).total).toBe(0));
});

describe("pagination & sorting", () => {
  it("pages are disjoint, total is constant, last page is short", async () => {
    const p1 = await list("admin", "pageSize=4&page=1&sort=created_at&order=asc");
    const p2 = await list("admin", "pageSize=4&page=2&sort=created_at&order=asc");
    expect(p1.total).toBe(6);
    expect(p2.total).toBe(6);
    expect(p1.items).toHaveLength(4);
    expect(p2.items).toHaveLength(2);
    expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(6);
    expect(names(p1)[0]).toBe("Ravi Kumar");
  });
  it("sort by name asc/desc", async () => {
    expect(names(await list("admin", "sort=full_name&order=asc"))[0]).toBe("100% Merit");
    expect(names(await list("admin", "sort=full_name&order=desc"))[0]).toBe("Zoya Khan");
  });
  it("default sort is newest first", async () =>
    expect(names(await list("admin"))[0]).toBe("Nina Nobody"));
  it("nulls sort last on next_step_due_at", async () => {
    await withTenant(env.db, A.id, (t) =>
      t
        .updateTable("lead")
        .set({ next_step: "callback", next_step_due_at: new Date("2026-05-01T00:00:00Z") })
        .where("id", "=", ids.zoya!)
        .execute(),
    );
    expect(names(await list("admin", "sort=next_step_due_at&order=asc"))[0]).toBe("Zoya Khan");
    expect(names(await list("admin", "sort=next_step_due_at&order=desc"))[0]).toBe("Zoya Khan");
  });
  it("a page past the end is empty with the right total", async () => {
    const r = await list("admin", "page=50");
    expect(r.items).toEqual([]);
    expect(r.total).toBe(6);
  });
  it("pageSize is capped at 100 (422 above)", async () => {
    expect(
      (await env.app.inject({ url: "/api/leads?pageSize=101", headers: asUser(ck.admin!) }))
        .statusCode,
    ).toBe(422);
  });
});
