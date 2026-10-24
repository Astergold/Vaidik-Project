import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@vernacular/db";
import { previewDial } from "../src/modules/policy/facts.js";
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
let T: TestTenant;
const ck: Record<string, string> = {};
let programId: string;
let agentId: string;

beforeAll(async () => {
  env = await buildTestEnv();
  T = await createTenant(env, "settings");
  for (const [k, role] of [
    ["owner", "owner"],
    ["admin", "admin"],
    ["head", "admission_head"],
    ["c1", "counsellor"],
  ] as const)
    await createUser(env, T, k, role);
  for (const [k, u] of Object.entries(T.users)) ck[k] = await login(env.app, u.email);
  agentId = await createAgent(env, T, "Asha");
  programId = (
    await withTenant(env.db, T.id, (t) =>
      t
        .insertInto("program")
        .values({ tenant_id: T.id, name: "MBA" })
        .returning("id")
        .executeTakeFirstOrThrow(),
    )
  ).id;
});
afterAll(async () => env.close());

const call = (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  who: string,
  payload?: object,
) => env.app.inject({ method, url, headers: asUser(ck[who]!), payload });
const auditActions = async () =>
  await withTenant(env.db, T.id, (t) =>
    t
      .selectFrom("audit_log")
      .select(["action", "diff", "actor_user_id"])
      .orderBy("created_at")
      .execute(),
  );

describe("lead sources: roles", () => {
  it("owner/admin can create; head can only view; counsellor can't even view", async () => {
    expect((await call("POST", "/api/settings/sources", "admin", { name: "A" })).statusCode).toBe(
      201,
    );
    expect((await call("POST", "/api/settings/sources", "owner", { name: "O" })).statusCode).toBe(
      201,
    );
    expect((await call("POST", "/api/settings/sources", "head", { name: "H" })).statusCode).toBe(
      403,
    );
    expect((await call("GET", "/api/settings/sources", "head")).statusCode).toBe(200);
    expect((await call("GET", "/api/settings/sources", "c1")).statusCode).toBe(403);
    expect((await call("POST", "/api/settings/sources", "c1", { name: "C" })).statusCode).toBe(403);
  });
});

describe("lead sources: tokens and shape", () => {
  it("the token is returned ONCE at creation and never again; only a hash is stored", async () => {
    const res = await call("POST", "/api/settings/sources", "admin", {
      name: "Once",
      kind: "aggregator",
    });
    const created = res.json();
    expect(created.token).toMatch(/^vk_src_/);
    expect(created.hasToken).toBe(true);
    expect(new URL(created.endpointUrl).pathname).toMatch(/^\/api\/intake\/[0-9a-f]{64}$/);
    expect(created.endpointUrl.startsWith(env.config.publicBaseUrl)).toBe(true);

    const list = await call("GET", "/api/settings/sources", "admin");
    expect(list.body).not.toContain(created.token);
    expect(list.json().items.find((s: { id: string }) => s.id === created.id)).toMatchObject({
      name: "Once",
      kind: "aggregator",
      hasToken: true,
    });

    const row = await withTenant(env.db, T.id, (t) =>
      t
        .selectFrom("intake_source")
        .select("secret_token_hash")
        .where("id", "=", created.id)
        .executeTakeFirstOrThrow(),
    );
    expect(row.secret_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.secret_token_hash).not.toContain(created.token);
  });

  it("creation, update and rotation are audited, and the token never reaches the audit log", async () => {
    const s = (await call("POST", "/api/settings/sources", "admin", { name: "Audited" })).json();
    await call("PATCH", `/api/settings/sources/${s.id}`, "admin", { name: "Audited v2" });
    const rot = (await call("POST", `/api/settings/sources/${s.id}/rotate-token`, "admin")).json();
    const rows = await auditActions();
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining(["source.create", "source.update", "source.rotate_token"]),
    );
    expect(JSON.stringify(rows)).not.toContain(s.token);
    expect(JSON.stringify(rows)).not.toContain(rot.token);
    expect(rows.every((r) => r.actor_user_id)).toBe(true);
  });

  it("defaults must be this tenant's own program/agent; unknown ids are a 422 with the field path", async () => {
    const bad = await call("POST", "/api/settings/sources", "admin", {
      name: "Bad",
      defaultProgramId: randomUUID(),
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.details).toEqual([
      { path: "defaultProgramId", message: "Program not found" },
    ]);
    const ok = await call("POST", "/api/settings/sources", "admin", {
      name: "Good",
      defaultProgramId: programId,
      defaultAgentId: agentId,
    });
    expect(ok.json()).toMatchObject({
      defaultProgramId: programId,
      defaultAgentId: agentId,
      autoDial: true,
      isActive: true,
    });
  });

  it("PATCH changes only what is sent; unknown mapping keys and empty patches are rejected", async () => {
    const s = (
      await call("POST", "/api/settings/sources", "admin", {
        name: "Patchy",
        fieldMapping: { phone: "mobile" },
      })
    ).json();
    const p = await call("PATCH", `/api/settings/sources/${s.id}`, "admin", { autoDial: false });
    expect(p.json()).toMatchObject({
      name: "Patchy",
      autoDial: false,
      fieldMapping: { phone: "mobile" },
    });
    expect((await call("PATCH", `/api/settings/sources/${s.id}`, "admin", {})).statusCode).toBe(
      422,
    );
    expect(
      (
        await call("PATCH", `/api/settings/sources/${s.id}`, "admin", {
          fieldMapping: { password: "x" },
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (await call("PATCH", `/api/settings/sources/${randomUUID()}`, "admin", { name: "x" }))
        .statusCode,
    ).toBe(404);
  });

  it("test-mapping shows what a sample payload would become, and writes nothing", async () => {
    const s = (
      await call("POST", "/api/settings/sources", "admin", {
        name: "Mapper",
        fieldMapping: { phone: "lead.mobile", full_name: ["lead.first", "lead.last"] },
      })
    ).json();
    const before = await withTenant(env.db, T.id, (t) =>
      t
        .selectFrom("person")
        .select((e) => e.fn.countAll<string>().as("n"))
        .executeTakeFirstOrThrow(),
    );
    const ok = await call("POST", `/api/settings/sources/${s.id}/test-mapping`, "admin", {
      payload: { lead: { mobile: "98765 43210", first: "Asha", last: "Rao" } },
    });
    expect(ok.json()).toMatchObject({
      ok: true,
      errors: [],
      mapped: { phone: "+919876543210", fullName: "Asha Rao", consent: true },
    });
    const bad = await call("POST", `/api/settings/sources/${s.id}/test-mapping`, "admin", {
      payload: { lead: { mobile: "123" } },
    });
    expect(bad.json()).toMatchObject({
      ok: false,
      mapped: null,
      errors: [{ path: "phone", message: "PHONE_INVALID" }],
    });
    const override = await call("POST", `/api/settings/sources/${s.id}/test-mapping`, "admin", {
      payload: { m: "9876543210" },
      fieldMapping: { phone: "m" },
    });
    expect(override.json().ok).toBe(true);
    const after = await withTenant(env.db, T.id, (t) =>
      t
        .selectFrom("person")
        .select((e) => e.fn.countAll<string>().as("n"))
        .executeTakeFirstOrThrow(),
    );
    expect(after.n).toBe(before.n);
  });
});

describe("calling policy settings", () => {
  const valid = {
    callWindowStart: "09:00",
    callWindowEnd: "21:00",
    allowedDays: [1, 2, 3, 4, 5, 6],
    maxAttemptsPerDay: 3,
    maxAttemptsTotal: 8,
    minGapMinutes: 60,
    requireConsent: true,
    ndncCheck: true,
    promoRequires140: false,
    aiDisclosureText: null,
  };

  it("GET returns the handbook defaults for a fresh tenant", async () => {
    const res = await call("GET", "/api/settings/policy", "admin");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(valid);
  });

  it("owner/admin edit, head views, counsellor is refused", async () => {
    expect((await call("PUT", "/api/settings/policy", "head", valid)).statusCode).toBe(403);
    expect((await call("GET", "/api/settings/policy", "head")).statusCode).toBe(200);
    expect((await call("GET", "/api/settings/policy", "c1")).statusCode).toBe(403);
    expect((await call("PUT", "/api/settings/policy", "owner", valid)).statusCode).toBe(200);
  });

  it("validates: window order, clock format, days, caps, disclosure length", async () => {
    const bad: [string, object][] = [
      ["start after end", { ...valid, callWindowStart: "21:00", callWindowEnd: "09:00" }],
      ["start == end", { ...valid, callWindowStart: "10:00", callWindowEnd: "10:00" }],
      ["clock format", { ...valid, callWindowStart: "9am" }],
      ["no days", { ...valid, allowedDays: [] }],
      ["day 8", { ...valid, allowedDays: [1, 8] }],
      ["repeated days", { ...valid, allowedDays: [1, 1] }],
      ["per-day above total", { ...valid, maxAttemptsPerDay: 10, maxAttemptsTotal: 5 }],
      ["zero attempts", { ...valid, maxAttemptsPerDay: 0 }],
      ["negative gap", { ...valid, minGapMinutes: -1 }],
      ["missing field", { ...valid, ndncCheck: undefined }],
      ["huge disclosure", { ...valid, aiDisclosureText: "x".repeat(2001) }],
    ];
    for (const [label, body] of bad) {
      const res = await call("PUT", "/api/settings/policy", "admin", body);
      expect(res.statusCode, label).toBe(422);
    }
  });

  it("a change is stored, audited with before/after, and affects the NEXT policy decision immediately", async () => {
    const lead = await createLead(env, T, { fullName: "Policy Probe" });
    await withTenant(env.db, T.id, async (t) => {
      await t
        .updateTable("person")
        .set({ ndnc_status: "clear" })
        .where("id", "=", lead.personId)
        .execute();
      await t
        .insertInto("consent_record")
        .values({
          tenant_id: T.id,
          person_id: lead.personId,
          channel: "voice",
          purpose: "admission",
          granted: true,
          source: "test",
        })
        .execute();
    });
    const at = new Date("2026-12-02T04:30:00Z"); // Wed 10:00 IST
    const decide = () => withTenant(env.db, T.id, (tx) => previewDial(tx, lead.leadId, at));
    expect(await decide()).toEqual({ allow: true });

    const res = await call("PUT", "/api/settings/policy", "admin", {
      ...valid,
      callWindowStart: "10:30",
      callWindowEnd: "18:00",
      aiDisclosureText: "AI call",
    });
    expect(res.json()).toMatchObject({
      callWindowStart: "10:30",
      callWindowEnd: "18:00",
      aiDisclosureText: "AI call",
    });
    expect(await decide()).toMatchObject({ allow: false, code: "OUTSIDE_WINDOW" });

    await call("PUT", "/api/settings/policy", "admin", valid);
    expect(await decide()).toEqual({ allow: true });

    const rows = (await auditActions()).filter((r) => r.action === "policy.update");
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const diff = rows.find(
      (r) => (r.diff as { after: { callWindowStart: string } }).after.callWindowStart === "10:30",
    )!.diff as { before: { callWindowStart: string }; after: { callWindowStart: string } };
    expect(diff.before.callWindowStart).toBe("09:00");
  });

  it("works for a tenant that has no policy row yet (upsert)", async () => {
    const N = await createTenant(env, "settings-norow");
    await createUser(env, N, "admin", "admin");
    const c = await login(env.app, N.users.admin!.email);
    await withTenant(env.db, N.id, (t) => t.deleteFrom("tenant_policy").execute());
    const get = await env.app.inject({ url: "/api/settings/policy", headers: asUser(c) });
    expect(get.json()).toEqual(valid); // defaults
    const put = await env.app.inject({
      method: "PUT",
      url: "/api/settings/policy",
      headers: asUser(c),
      payload: { ...valid, minGapMinutes: 5 },
    });
    expect(put.json().minGapMinutes).toBe(5);
  });
});

describe("holidays", () => {
  it("add / list sorted / rename on the same date / delete", async () => {
    const a = await call("POST", "/api/settings/holidays", "admin", {
      date: "2026-12-25",
      name: "Christmas",
    });
    expect(a.statusCode).toBe(201);
    await call("POST", "/api/settings/holidays", "admin", { date: "2026-10-20", name: "Dussehra" });
    const renamed = await call("POST", "/api/settings/holidays", "admin", {
      date: "2026-12-25",
      name: "Christmas Day",
    });
    expect(renamed.json().id).toBe(a.json().id); // same date = same row
    const list = (await call("GET", "/api/settings/holidays", "head")).json().items;
    expect(list.map((h: { date: string }) => h.date)).toEqual(["2026-10-20", "2026-12-25"]);
    expect(list[1].name).toBe("Christmas Day");
    expect(
      (await call("DELETE", `/api/settings/holidays/${a.json().id}`, "admin")).statusCode,
    ).toBe(204);
    expect(
      (await call("DELETE", `/api/settings/holidays/${a.json().id}`, "admin")).statusCode,
    ).toBe(404);
  });

  it("validates dates and roles", async () => {
    expect(
      (await call("POST", "/api/settings/holidays", "admin", { date: "25-12-2026", name: "x" }))
        .statusCode,
    ).toBe(422);
    expect(
      (await call("POST", "/api/settings/holidays", "admin", { date: "2026-02-30", name: "x" }))
        .statusCode,
    ).toBe(422);
    expect(
      (await call("POST", "/api/settings/holidays", "head", { date: "2026-12-25", name: "x" }))
        .statusCode,
    ).toBe(403);
    expect((await call("GET", "/api/settings/holidays", "c1")).statusCode).toBe(403);
  });

  it("a holiday blocks calling that (local) day in the policy engine", async () => {
    const lead = await createLead(env, T, {});
    await withTenant(env.db, T.id, async (t) => {
      await t
        .updateTable("person")
        .set({ ndnc_status: "clear" })
        .where("id", "=", lead.personId)
        .execute();
      await t
        .insertInto("consent_record")
        .values({
          tenant_id: T.id,
          person_id: lead.personId,
          channel: "voice",
          purpose: "admission",
          granted: true,
          source: "test",
        })
        .execute();
    });
    const wed = new Date("2026-11-04T04:30:00Z"); // Wed 10:00 IST
    await call("POST", "/api/settings/holidays", "admin", {
      date: "2026-11-04",
      name: "Diwali (test)",
    });
    const d = await withTenant(env.db, T.id, (tx) => previewDial(tx, lead.leadId, wed));
    expect(d).toMatchObject({ allow: false, code: "OUTSIDE_WINDOW" });
    expect((d as { retryAt?: Date }).retryAt?.toISOString()).toBe("2026-11-05T03:30:00.000Z");
  });
});
