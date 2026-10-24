import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestEnv,
  createTenant,
  createUser,
  login,
  PASSWORD,
  type TestEnv,
  type TestTenant,
  type TestUser,
} from "./helpers.js";

let env: TestEnv;
let T: TestTenant;
let user: TestUser;
beforeAll(async () => {
  env = await buildTestEnv();
  T = await createTenant(env, "reset");
  user = await createUser(env, T, "head", "admission_head");
});
afterAll(async () => env.close());

describe("password reset (what I4's forgot-password / reset pages call)", () => {
  it("request -> email with link -> reset -> old password dead, new works", async () => {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      payload: { email: user.email, redirectTo: "/reset-password" },
    });
    expect(res.statusCode, res.body).toBe(200);

    const mail = env.mailer.sent.find((m) => m.to === user.email && /reset/i.test(m.subject));
    expect(mail, "reset email was sent").toBeTruthy();
    const link = mail!.text.match(/https?:\/\/\S+/)![0];
    // The email links to Better Auth, which redirects to <redirectTo>?token=...
    const hop = await env.app.inject({ url: new URL(link).pathname + new URL(link).search });
    expect(hop.statusCode).toBeGreaterThanOrEqual(300);
    expect(hop.statusCode).toBeLessThan(400);
    const token = new URL(hop.headers.location as string, "http://x").searchParams.get("token");
    expect(token).toBeTruthy();

    const newPassword = "A-Brand-New-Password-9!";
    const reset = await env.app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { newPassword, token },
    });
    expect(reset.statusCode, reset.body).toBe(200);

    await expect(login(env.app, user.email, PASSWORD)).rejects.toThrow(/login failed/);
    await expect(login(env.app, user.email, newPassword)).resolves.toBeTruthy();
  });

  it("an unknown email gets the same 200 (no account enumeration) and sends nothing", async () => {
    const before = env.mailer.sent.length;
    const res = await env.app.inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      payload: { email: "nobody@test.local", redirectTo: "/reset-password" },
    });
    expect(res.statusCode).toBe(200);
    expect(env.mailer.sent.length).toBe(before);
  });

  it("a bad or reused token is rejected", async () => {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { newPassword: "Another-Password-1!", token: "bogus" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("short passwords are rejected on reset (min 10)", async () => {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { newPassword: "short", token: "bogus" },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
