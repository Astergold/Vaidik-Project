import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  buildTestEnv,
  createTenant,
  createUser,
  login,
  type TestEnv,
  type TestTenant,
} from "./helpers.js";

let env: TestEnv;
let T: TestTenant;
beforeAll(async () => {
  env = await buildTestEnv();
  T = await createTenant(env, "smoke");
  await createUser(env, T, "head", "admission_head");
});
afterAll(async () => env.close());

describe("smoke", () => {
  it("GET /health is public", async () => {
    const res = await env.app.inject({ url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, version: expect.any(String) });
  });

  it("GET /api/me without a session is 401 in the standard error format", async () => {
    const res = await env.app.inject({ url: "/api/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
  });

  it("login -> /api/me returns user, tenant and role", async () => {
    const cookie = await login(env.app, T.users.head!.email);
    const res = await env.app.inject({ url: "/api/me", headers: asUser(cookie) });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      user: { id: T.users.head!.id, email: T.users.head!.email },
      tenant: { id: T.id, slug: T.slug, status: "active" },
      role: "admission_head",
      isPlatformAdmin: false,
    });
  });
});
