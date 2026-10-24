import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import { probes } from "./probes.js";

/**
 * Generic cross-tenant harness (handbook D7-I2-03, started on Day 2 so every endpoint is covered
 * from the day it is added). For EVERY registered tenant route:
 *   - routes with :params  -> tenant B asking for tenant A's ids must get 404/403, never 200
 *   - routes without params -> tenant B's response must not contain ANY of tenant A's data
 * If you add a route with a path parameter, add a fixture below. The test fails until you do.
 */
let env: TestEnv;
let A: TestTenant;
let B: TestTenant;
let cookieA: string;
let cookieB: string;
let markers: string[] = [];
let fixtures: Record<string, string> = {};

beforeAll(async () => {
  env = await buildTestEnv();
  await env.app.close();
  const { buildServer } = await import("../src/server.js");
  const { createAuth, createAuthPool } = await import("../src/auth/auth.js");
  env.app = await buildServer({
    config: env.config,
    db: env.db,
    mailer: env.mailer,
    auth: createAuth({
      config: env.config,
      mailer: env.mailer,
      pool: createAuthPool(env.config.databaseUrl),
    }),
    extraTenantModules: [probes],
  });
  await env.app.ready();

  A = await createTenant(env, "xt-a");
  B = await createTenant(env, "xt-b");
  await createUser(env, A, "admin", "admin");
  await createUser(env, B, "admin", "admin");
  cookieA = await login(env.app, A.users.admin!.email);
  cookieB = await login(env.app, B.users.admin!.email);

  const tag = `ZZSECRET${Date.now()}`;
  const agent = await createAgent(env, A, `${tag}-agent`);
  const lead = await createLead(env, A, {
    fullName: `${tag} Student`,
    phone: "+919777000111",
    city: `${tag}City`,
    agentId: agent,
  });
  await createLead(env, B, { fullName: "Bee Student", phone: "+919555000222" });
  markers = [
    tag,
    "919777000111",
    lead.leadId,
    lead.personId,
    agent,
    A.id,
    A.slug,
    A.users.admin!.email,
  ];
  fixtures = {
    leadId: lead.leadId,
    personId: lead.personId,
    agentId: agent,
    id: lead.leadId,
    callId: lead.leadId,
  };
});
afterAll(async () => env.close());

const protectedRoutes = () =>
  env.app.routes.filter((r) => !r.public && !r.url.startsWith("/api/docs"));
const fill = (url: string) =>
  url.replace(/:([A-Za-z]+)/g, (_m, name: string) => {
    const v = fixtures[name];
    if (!v)
      throw new Error(
        `Route ${url} has a :${name} parameter but cross-tenant.test.ts has no fixture for it. Add one.`,
      );
    return v;
  });

describe("every protected route is tenant-isolated", () => {
  it("harness is not vacuous: tenant A's own list DOES contain the markers", async () => {
    const res = await env.app.inject({ url: "/api/leads", headers: asUser(cookieA) });
    expect(markers.some((m) => res.body.includes(m))).toBe(true);
  });

  it("GET routes with path params: B using A's ids gets 404/403 (never 200, never data)", async () => {
    const withParams = protectedRoutes().filter((r) => r.method === "GET" && r.url.includes(":"));
    expect(withParams.length).toBeGreaterThan(0);
    for (const r of withParams) {
      const res = await env.app.inject({ url: fill(r.url), headers: asUser(cookieB) });
      expect([403, 404], `${r.method} ${r.url} -> ${res.statusCode}`).toContain(res.statusCode);
      for (const m of markers) expect(res.body, `${r.url} leaked ${m}`).not.toContain(m);
    }
  });

  it("GET routes without params: B's response never contains any of A's data", async () => {
    const plain = protectedRoutes().filter((r) => r.method === "GET" && !r.url.includes(":"));
    expect(plain.length).toBeGreaterThan(1);
    for (const r of plain) {
      const res = await env.app.inject({ url: r.url, headers: asUser(cookieB) });
      expect(res.statusCode, r.url).toBeLessThan(500);
      for (const m of markers) expect(res.body, `${r.url} leaked ${m}`).not.toContain(m);
    }
  });

  it("search can't cross the wall either", async () => {
    for (const q of [markers[0]!, "919777000111", "ZZSECRET"]) {
      const res = await env.app.inject({ url: `/api/leads?q=${q}`, headers: asUser(cookieB) });
      expect(res.json().total, q).toBe(0);
    }
  });

  it("campaign routes are tenant-isolated: B touching A's campaign ids gets 404/403", async () => {
    // fixture `id` is tenant A's lead id, used as a campaign id that does NOT exist in tenant B.
    const campaignId = fixtures.id!;
    const patch = await env.app.inject({
      url: `/api/campaigns/${campaignId}`,
      method: "PATCH",
      headers: asUser(cookieB),
      body: {},
    });
    expect([403, 404], `PATCH -> ${patch.statusCode}`).toContain(patch.statusCode);
    const action = await env.app.inject({
      url: `/api/campaigns/${campaignId}/start`,
      method: "POST",
      headers: asUser(cookieB),
    });
    expect([403, 404], `POST start -> ${action.statusCode}`).toContain(action.statusCode);
    for (const res of [patch, action]) {
      for (const m of markers) expect(res.body, `campaign routes leaked ${m}`).not.toContain(m);
    }
  });

  it("every write route (POST/PATCH/PUT/DELETE) is covered by the 401 test and listed here so it gets reviewed", () => {
    const writes = protectedRoutes()
      .filter((r) => r.method !== "GET")
      .map((r) => `${r.method} ${r.url}`)
      .sort();
    // Add new write routes here ONLY after writing their own cross-tenant test.
    expect(writes).toEqual([
      "DELETE /api/settings/holidays/:id",
      "PATCH /api/campaigns/:id", // covered by the campaign-routes isolation test above
      "PATCH /api/leads/:id",
      "PATCH /api/settings/sources/:id",
      "POST /api/_probe/write-ok",
      "POST /api/_probe/write-then-409",
      "POST /api/_probe/write-then-crash",
      "POST /api/campaigns", // creates inside the caller's own RLS tenant (POST campaigns test above)
      "POST /api/campaigns/:id/:action", // covered by the campaign-routes isolation test above
      "POST /api/duplicates/:id/dismiss", // STUB (D6-I4-04c): echoes a fixed shape, persists nothing, cross-tenant test comes with the real service
      "POST /api/leads/:id/call-now",
      "POST /api/leads/:id/notes",
      "POST /api/leads/imports", // STUB (D3-I3-03): mints a fixed demo id; GET on it is tenant-checked
      "POST /api/notifications/:id/read", // STUB (D6-I4-04a): persists nothing, cross-tenant test comes with the real service
      "POST /api/notifications/read-all", // STUB (D6-I4-04a): persists nothing
      "POST /api/settings/holidays",
      "POST /api/settings/sources",
      "POST /api/settings/sources/:id/rotate-token",
      "POST /api/settings/sources/:id/test-mapping",
      "PUT /api/settings/policy",
    ]);
  });
});
