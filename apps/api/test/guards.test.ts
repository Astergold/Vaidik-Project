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

let env: TestEnv;
let A: TestTenant;
let B: TestTenant;
const cookies: Record<string, string> = {};
let lead1: string; // owned by counsellor1
let lead2: string; // AI agent allocated to counsellor2
let lead3: string; // unassigned

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

  A = await createTenant(env, "guards-a");
  B = await createTenant(env, "guards-b");
  for (const [k, role] of [
    ["owner", "owner"],
    ["admin", "admin"],
    ["head", "admission_head"],
    ["c1", "counsellor"],
    ["c2", "counsellor"],
  ] as const) {
    await createUser(env, A, k, role);
  }
  await createUser(env, A, "sa", "counsellor", { platformAdmin: true }); // super-admin who is a (mere) counsellor member
  await createUser(env, B, "admin", "admin");
  for (const [k, u] of Object.entries(A.users)) cookies[k] = await login(env.app, u.email);
  cookies.bAdmin = await login(env.app, B.users.admin!.email);

  const agent = await createAgent(env, A, "Priya (EN)", [A.users.c2!.id]);
  lead1 = (await createLead(env, A, { ownerId: A.users.c1!.id })).leadId;
  lead2 = (await createLead(env, A, { agentId: agent })).leadId;
  lead3 = (await createLead(env, A, {})).leadId;
});
afterAll(async () => env.close());

const status = async (url: string, who: string) =>
  (await env.app.inject({ url, headers: asUser(cookies[who]!) })).statusCode;

describe("requireRole", () => {
  const matrix: Record<string, Record<string, number>> = {
    "/api/_probe/admin": { owner: 200, admin: 200, head: 403, c1: 403, sa: 200 },
    "/api/_probe/head": { owner: 403, admin: 403, head: 200, c1: 403, sa: 200 },
    "/api/_probe/anyone": { owner: 200, admin: 200, head: 200, c1: 200, sa: 200 },
  };
  for (const [url, expected] of Object.entries(matrix)) {
    for (const [who, code] of Object.entries(expected)) {
      it(`${who} -> ${url} = ${code}`, async () => expect(await status(url, who)).toBe(code));
    }
  }

  it("403 uses the standard error format with a specific code", async () => {
    const res = await env.app.inject({ url: "/api/_probe/admin", headers: asUser(cookies.c1!) });
    expect(res.json()).toEqual({
      error: { code: "INSUFFICIENT_ROLE", message: expect.stringContaining("owner, admin") },
    });
  });

  it("a role guard in one tenant gives nothing in another (B's admin cannot be A's admin)", async () => {
    const res = await env.app.inject({ url: "/api/me", headers: asUser(cookies.bAdmin!) });
    expect(res.json().tenant.id).toBe(B.id);
  });
});

describe("assertLeadAccess (counsellor 'own' rule, handbook §7.5)", () => {
  const L = (id: string) => `/api/_probe/lead/${id}`;

  it("counsellor sees a lead assigned to them", async () =>
    expect(await status(L(lead1), "c1")).toBe(200));
  it("counsellor sees a lead of an AI agent allocated to them", async () =>
    expect(await status(L(lead2), "c2")).toBe(200));
  it("counsellor cannot see another counsellor's lead (403 LEAD_NOT_ASSIGNED)", async () => {
    const res = await env.app.inject({ url: L(lead1), headers: asUser(cookies.c2!) });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("LEAD_NOT_ASSIGNED");
  });
  it("counsellor cannot see an agent's lead if not allocated to that agent", async () =>
    expect(await status(L(lead2), "c1")).toBe(403));
  it("counsellor cannot see unassigned leads", async () =>
    expect(await status(L(lead3), "c1")).toBe(403));

  for (const who of ["owner", "admin", "head", "sa"]) {
    it(`${who} sees every lead`, async () => {
      for (const l of [lead1, lead2, lead3]) expect(await status(L(l), who)).toBe(200);
    });
  }

  it("another tenant's lead is 404 (indistinguishable from missing), not 403", async () => {
    const res = await env.app.inject({ url: L(lead1), headers: asUser(cookies.bAdmin!) });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("a missing lead is 404; a non-uuid id is 422", async () => {
    expect(await status(L("00000000-0000-4000-8000-000000000000"), "admin")).toBe(404);
    expect(await status("/api/_probe/lead/not-a-uuid", "admin")).toBe(422);
  });
});
