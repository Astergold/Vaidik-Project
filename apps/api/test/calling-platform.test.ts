/** Settings → Integrations → Calling platform: per-tenant API key (write-only, validated, audited, isolated). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@vernacular/db";
import { PlatformError } from "@vernacular/integration-dograh";
import { createSecretsService } from "../src/modules/secrets/service.js";
import { createPlatformResolver } from "../src/modules/campaigns/platform.js";
import { asUser, buildTestEnv, createTenant, createUser, login, type TestEnv } from "./helpers.js";

const GOOD = "good-key-AAAA-1234";
const checked: string[] = [];
let env: TestEnv;

beforeAll(async () => {
  env = await buildTestEnv(
    {},
    {
      platformForKey: (apiKey) => ({
        async listWorkflows() {
          checked.push(apiKey);
          if (apiKey.startsWith("down")) throw new PlatformError("UNAVAILABLE", "x", true);
          if (!apiKey.startsWith("good")) throw new PlatformError("AUTH", "x", false, 401);
          return [{ id: 2, name: "W", status: "active", workflow_uuid: null }];
        },
      }),
    },
  );
});
afterAll(() => env.close());

async function world(label = "cp") {
  const tenant = await createTenant(env, label);
  const o = await createUser(env, tenant, "owner", "owner");
  const h = await createUser(env, tenant, "head", "admission_head");
  return { tenant, owner: await login(env.app, o.email), head: await login(env.app, h.email) };
}
const call = (cookie: string, method: "GET" | "PUT" | "DELETE", payload?: object) =>
  env.app.inject({
    method,
    url: "/api/settings/calling-platform",
    headers: asUser(cookie),
    ...(payload ? { payload } : {}),
  });

describe("calling platform key", () => {
  it("starts disconnected; connect validates the key, stores it encrypted and never returns it", async () => {
    const w = await world();
    expect((await call(w.owner, "GET")).json()).toEqual({
      connected: false,
      keyLast4: null,
      updatedAt: null,
      workflowCount: null,
    });

    const put = await call(w.owner, "PUT", { apiKey: GOOD });
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json()).toMatchObject({ connected: true, keyLast4: "1234", workflowCount: 1 });
    expect(put.body).not.toContain(GOOD);
    expect(checked).toContain(GOOD);

    const raw = await withTenant(env.db, w.tenant.id, (t) =>
      t
        .selectFrom("tenant_secret")
        .select("ciphertext")
        .where("kind", "=", "dograh_api_key")
        .executeTakeFirstOrThrow(),
    );
    expect(raw.ciphertext.toString("utf8")).not.toContain(GOOD);

    const get = await call(w.owner, "GET");
    expect(get.json()).toMatchObject({ connected: true, keyLast4: "1234", workflowCount: 1 });
    expect(get.body).not.toContain(GOOD);
  });

  it("a key the platform refuses is 422 and nothing is saved; an unreachable platform is 502", async () => {
    const w = await world();
    const bad = await call(w.owner, "PUT", { apiKey: "wrong-key-0000" });
    expect(bad.statusCode).toBe(422);
    expect(bad.body).not.toContain("wrong-key-0000");
    expect((await call(w.owner, "PUT", { apiKey: "down-key-00000" })).statusCode).toBe(502);
    expect((await call(w.owner, "GET")).json().connected).toBe(false);
    expect((await call(w.owner, "PUT", { apiKey: "short" })).statusCode).toBe(422);
  });

  it("replace and disconnect are audited without the key", async () => {
    const w = await world();
    await call(w.owner, "PUT", { apiKey: GOOD });
    await call(w.owner, "PUT", { apiKey: "good-key-BBBB-5678" });
    const del = await call(w.owner, "DELETE");
    expect(del.json()).toMatchObject({ connected: false });
    const log = await withTenant(env.db, w.tenant.id, (t) =>
      t
        .selectFrom("audit_log")
        .select(["action", "diff"])
        .where("entity", "=", "tenant_secret")
        .orderBy("created_at")
        .execute(),
    );
    expect(log.map((l) => l.action)).toEqual([
      "calling_platform.connected",
      "calling_platform.key_replaced",
      "calling_platform.disconnected",
    ]);
    const text = JSON.stringify(log);
    expect(text).not.toContain(GOOD);
    expect(text).not.toContain("good-key-BBBB-5678");
  });

  it("admission heads and counsellors cannot see or change it (403)", async () => {
    const w = await world();
    const c = await createUser(env, w.tenant, "couns", "counsellor");
    const couns = await login(env.app, c.email);
    for (const cookie of [w.head, couns]) {
      expect((await call(cookie, "GET")).statusCode).toBe(403);
      expect((await call(cookie, "PUT", { apiKey: GOOD })).statusCode).toBe(403);
      expect((await call(cookie, "DELETE")).statusCode).toBe(403);
    }
  });

  it("is per tenant: B connecting or disconnecting never touches A's key", async () => {
    const a = await world("cp-a");
    const b = await world("cp-b");
    await call(a.owner, "PUT", { apiKey: GOOD });
    expect((await call(b.owner, "GET")).json().connected).toBe(false);
    await call(b.owner, "PUT", { apiKey: "good-key-CCCC-9999" });
    await call(b.owner, "DELETE");
    expect((await call(a.owner, "GET")).json()).toMatchObject({
      connected: true,
      keyLast4: "1234",
    });
  });

  it("the saved key is what campaigns and calls use (it wins over the global dev key)", async () => {
    const w = await world();
    await call(w.owner, "PUT", { apiKey: GOOD });
    const secrets = createSecretsService({ db: env.db, keyring: env.config.masterKeys });
    let used = "";
    const resolve = createPlatformResolver({
      secrets,
      baseUrl: "https://platform.test",
      globalApiKey: "global-dev",
    });
    // PlatformClient keeps the key private; prove it via the header it sends
    const orig = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      used = (init.headers as Record<string, string>)["X-API-Key"]!;
      return new Response("[]", { status: 200 });
    }) as typeof fetch;
    try {
      await (await resolve(w.tenant.id)).listWorkflows();
    } finally {
      globalThis.fetch = orig;
    }
    expect(used).toBe(GOOD);
  });
});
