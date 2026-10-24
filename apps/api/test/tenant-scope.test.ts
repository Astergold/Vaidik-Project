import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { withTenant } from "@vernacular/db";
import {
  asUser,
  buildTestEnv,
  createTenant,
  createUser,
  login,
  PASSWORD,
  type TestEnv,
  type TestTenant,
} from "./helpers.js";
import { probes } from "./probes.js";

let env: TestEnv;
let A: TestTenant;
let B: TestTenant;
let cookieA: string;
let cookieB: string;

beforeAll(async () => {
  env = await buildTestEnv();
  // rebuild with probes
  await env.app.close();
  const { buildServer } = await import("../src/server.js");
  const { createAuth, createAuthPool } = await import("../src/auth/auth.js");
  const pool = createAuthPool(env.config.databaseUrl);
  env.app = await buildServer({
    config: env.config,
    db: env.db,
    mailer: env.mailer,
    auth: createAuth({ config: env.config, mailer: env.mailer, pool }),
    extraTenantModules: [probes],
  });
  await env.app.ready();

  A = await createTenant(env, "scope-a");
  B = await createTenant(env, "scope-b");
  await createUser(env, A, "admin", "admin");
  await createUser(env, B, "admin", "admin");
  cookieA = await login(env.app, A.users.admin!.email);
  cookieB = await login(env.app, B.users.admin!.email);
});
afterAll(async () => env.close());

const get = (url: string, cookie?: string) =>
  env.app.inject({ url, headers: cookie ? asUser(cookie) : {} });
const post = (url: string, payload: object, cookie: string) =>
  env.app.inject({ method: "POST", url, payload, headers: asUser(cookie) });
const personCount = (tenantId: string, name: string) =>
  withTenant(env.db, tenantId, async (trx) =>
    Number(
      (
        await trx
          .selectFrom("person")
          .select((e) => e.fn.countAll().as("n"))
          .where("full_name", "=", name)
          .executeTakeFirstOrThrow()
      ).n,
    ),
  );

describe("route registry: every route is explicit about being public", () => {
  // Adding a public route is a security decision: it must be added here on purpose.
  const EXPECTED_PUBLIC = [
    "GET /health",
    "GET /health/ready",
    "GET /api/auth/*",
    "POST /api/auth/*",
    "POST /api/intake/:sourceKey", // provider endpoint, bearer-token authenticated (intake.test.ts)
    "GET /api/branding", // pre-tenant branding for the login screen (stub: static copy until D6 host resolution)
    "POST /api/webhooks/godrah", // provider callback, HMAC signature verified before any tenant lookup
    "POST /api/webhooks/godrah/pre-call", // same — answers with the call context
  ];

  it("the set of public routes is exactly the expected list", () => {
    const pub = env.app.routes
      .filter((r) => r.public)
      .map((r) => `${r.method} ${r.url}`)
      .sort();
    expect(pub).toEqual([...EXPECTED_PUBLIC].sort());
  });

  it("every other route returns 401 without a session", async () => {
    const protectedRoutes = env.app.routes.filter(
      (r) => !r.public && !r.url.startsWith("/api/docs"),
    );
    expect(protectedRoutes.length).toBeGreaterThan(5);
    for (const r of protectedRoutes) {
      const url = r.url.replace(/:[A-Za-z]+/g, "00000000-0000-4000-8000-000000000000");
      const res = await env.app.inject({
        method: r.method as "GET" | "POST",
        url,
        payload: r.method === "POST" ? {} : undefined,
      });
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("unknown routes use the standard error format", async () => {
    const res = await get("/api/does-not-exist");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
});

describe("every tenant route runs inside the caller's RLS transaction", () => {
  it("app.tenant_id is the session's tenant", async () => {
    expect((await get("/api/_probe/tenant", cookieA)).json().t).toBe(A.id);
    expect((await get("/api/_probe/tenant", cookieB)).json().t).toBe(B.id);
  });

  it("a handler can only see its own tenant's rows", async () => {
    await withTenant(env.db, A.id, (t) =>
      t.insertInto("person").values({ tenant_id: A.id, full_name: "only-in-a" }).execute(),
    );
    expect((await get("/api/_probe/tenant", cookieA)).json().n).toBeGreaterThanOrEqual(1);
    const nB = (await get("/api/_probe/tenant", cookieB)).json().n;
    expect(nB).toBe(0);
  });

  it("commits on success", async () => {
    expect((await post("/api/_probe/write-ok", { name: "commit-me" }, cookieA)).statusCode).toBe(
      200,
    );
    expect(await personCount(A.id, "commit-me")).toBe(1);
  });

  it("rolls back when the handler throws an AppError (4xx)", async () => {
    const res = await post("/api/_probe/write-then-409", { name: "rollback-409" }, cookieA);
    expect(res.statusCode).toBe(409);
    expect(await personCount(A.id, "rollback-409")).toBe(0);
  });

  it("rolls back on an unexpected crash, and the client gets a generic 500 (no internals)", async () => {
    const res = await post("/api/_probe/write-then-crash", { name: "rollback-500" }, cookieA);
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: "INTERNAL", message: "Internal server error" } });
    expect(res.body).not.toContain("secret internal detail");
    expect(await personCount(A.id, "rollback-500")).toBe(0);
  });

  it("rolls back when request validation fails (422) and reports field paths", async () => {
    const res = await post("/api/_probe/write-ok", { wrong: 1 }, cookieA);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect(res.json().error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "name" })]),
    );
  });

  it("never leaks connections: 60 mixed requests on a 6-connection pool, then nothing idle-in-transaction", async () => {
    const jobs = Array.from({ length: 60 }, (_, i) =>
      i % 3 === 0
        ? post("/api/_probe/write-then-409", { name: `leak-${i}` }, cookieA)
        : i % 3 === 1
          ? post("/api/_probe/write-then-crash", { name: `leak-${i}` }, cookieB)
          : get("/api/_probe/tenant", cookieA),
    );
    const res = await Promise.all(jobs);
    expect(res.filter((r) => r.statusCode === 401)).toHaveLength(0);
    const idle = await sql<{ n: number }>`select count(*)::int as n from pg_stat_activity
       where usename = 'crm_app' and state = 'idle in transaction' and datname = current_database()`.execute(
      env.db,
    );
    expect(idle.rows[0]!.n).toBe(0);
  });
});

describe("authentication & tenant resolution", () => {
  it("wrong password is rejected and gives no session", async () => {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: A.users.admin!.email, password: "Wrong-Password-1!" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.cookies).toHaveLength(0);
  });

  it("public sign-up is disabled", async () => {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: { email: "new@test.local", password: PASSWORD, name: "x" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    const row = await env.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "new@test.local")
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it("a client cannot make itself platform admin via sign-up input (rejected or ignored, never granted)", async () => {
    // seedAuth allows sign-up, but isPlatformAdmin is declared input:false.
    const email = `sneaky-${Date.now()}@test.local`;
    let rejected = false;
    await env.seedAuth.api
      .signUpEmail({
        body: { email, password: PASSWORD, name: "s", isPlatformAdmin: true } as never,
      })
      .catch(() => {
        rejected = true;
      });
    const u = await env.db
      .selectFrom("user")
      .select("isPlatformAdmin")
      .where("email", "=", email)
      .executeTakeFirst();
    if (rejected) expect(u).toBeUndefined();
    else expect(u?.isPlatformAdmin).toBe(false);
  });

  it("logout invalidates the session", async () => {
    const c = await login(env.app, A.users.admin!.email);
    expect((await get("/api/me", c)).statusCode).toBe(200);
    const out = await env.app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      payload: {},
      headers: asUser(c),
    });
    expect(out.statusCode).toBe(200);
    expect((await get("/api/me", c)).statusCode).toBe(401);
  });

  it("a forged / garbage session cookie is 401", async () => {
    expect(
      (await get("/api/me", "better-auth.session_token=not-a-real-token.abc")).statusCode,
    ).toBe(401);
  });

  it("an account with no membership gets 403 NO_TENANT_CONTEXT (platform admin too, until impersonation)", async () => {
    const u = await createUser(env, null, "orphan", "admin", { platformAdmin: true });
    const c = await login(env.app, u.email);
    const res = await get("/api/me", c);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("NO_TENANT_CONTEXT");
  });

  it("removing a membership revokes access immediately, even with a live session", async () => {
    const u = await createUser(env, A, "leaver", "counsellor");
    const c = await login(env.app, u.email);
    expect((await get("/api/me", c)).statusCode).toBe(200);
    await env.db.deleteFrom("member").where("userId", "=", u.id).execute();
    const res = await get("/api/me", c);
    expect(res.statusCode).toBe(403);
  });

  it("a suspended tenant is locked out (403 TENANT_SUSPENDED)", async () => {
    const S = await createTenant(env, "suspendable");
    const u = await createUser(env, S, "owner", "owner");
    const c = await login(env.app, u.email);
    expect((await get("/api/me", c)).statusCode).toBe(200);
    await withTenant(env.db, S.id, (t) =>
      t.updateTable("tenant").set({ status: "suspended" }).where("id", "=", S.id).execute(),
    );
    const res = await get("/api/me", c);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("TENANT_SUSPENDED");
  });

  it("a user in two tenants gets their oldest membership by default", async () => {
    const X = await createTenant(env, "multi-x");
    const Y = await createTenant(env, "multi-y");
    const u = await createUser(env, X, "multi", "counsellor");
    await env.db
      .insertInto("member")
      .values({ organizationId: Y.id, userId: u.id, role: "admin" })
      .execute();
    const c = await login(env.app, u.email);
    const me = (await get("/api/me", c)).json();
    expect(me.tenant.id).toBe(X.id);
    expect(me.role).toBe("counsellor");
  });

  it("the response carries a request id", async () => {
    expect((await get("/health")).headers["x-request-id"]).toBeTruthy();
  });
});
