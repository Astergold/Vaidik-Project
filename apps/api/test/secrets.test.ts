import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { withTenant } from "@vernacular/db";
import { open, seal, SecretError, type Keyring } from "../src/modules/secrets/crypto.js";
import { createSecretsService } from "../src/modules/secrets/service.js";
import { buildTestEnv, createTenant, type TestEnv, type TestTenant } from "./helpers.js";

const ring = (current: number, ...versions: number[]): Keyring => ({
  current,
  keys: new Map(versions.map((v) => [v, Buffer.alloc(32, v)])),
});

describe("crypto (AES-256-GCM)", () => {
  const k = ring(1, 1);
  it("round-trips, including unicode", () => {
    for (const s of ["sk-ant-api03-abc", "pässwörd ✓ 日本語", "x".repeat(10_000)]) {
      expect(open(seal(s, k, "t:k"), k, "t:k")).toBe(s);
    }
  });
  it("uses a fresh random IV every time (same input => different ciphertext)", () => {
    const a = seal("same", k, "t:k");
    const b = seal("same", k, "t:k");
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });
  it("detects tampering with ciphertext, tag or IV", () => {
    const s = seal("secret", k, "t:k");
    for (const mutate of [
      (x: typeof s) => ({
        ...x,
        ciphertext: Buffer.from(x.ciphertext.map((b, i) => (i === 0 ? b ^ 1 : b))),
      }),
      (x: typeof s) => ({
        ...x,
        authTag: Buffer.from(x.authTag.map((b, i) => (i === 0 ? b ^ 1 : b))),
      }),
      (x: typeof s) => ({ ...x, iv: randomBytes(12) }),
    ]) {
      expect(() => open(mutate(s), k, "t:k")).toThrow(SecretError);
    }
  });
  it("is bound to tenant+kind via AAD: a copied ciphertext cannot be opened elsewhere", () => {
    const s = seal("secret", k, "tenant-a:llm_key");
    expect(() => open(s, k, "tenant-b:llm_key")).toThrow(SecretError);
    expect(() => open(s, k, "tenant-a:whatsapp_key")).toThrow(SecretError);
  });
  it("wrong key fails, and errors never contain the plaintext", () => {
    const s = seal("hunter2-super-secret", k, "t:k");
    try {
      open(s, { current: 1, keys: new Map([[1, randomBytes(32)]]) }, "t:k");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SecretError);
      expect(String((e as Error).message)).not.toContain("hunter2");
    }
  });
  it("a missing retired key gives a clear error", () => {
    const old = seal("x", ring(1, 1), "t:k");
    expect(() => open(old, ring(2, 2), "t:k")).toThrow(/key_version 1/);
  });
});

describe("tenant secrets service (against Postgres)", () => {
  let env: TestEnv;
  let A: TestTenant;
  let B: TestTenant;
  const svc = (keyring: Keyring) => createSecretsService({ db: env.db, keyring });

  beforeAll(async () => {
    env = await buildTestEnv();
    A = await createTenant(env, "sec-a");
    B = await createTenant(env, "sec-b");
  });
  afterAll(async () => env.close());

  it("getSecret returns null when nothing is stored", async () => {
    expect(await svc(ring(1, 1)).getSecret(A.id, "dograh_api_key")).toBeNull();
    await expect(svc(ring(1, 1)).requireSecret(A.id, "dograh_api_key")).rejects.toThrow(
      /not configured/,
    );
  });

  it("stores ciphertext only: plaintext never appears in the table", async () => {
    const s = svc(ring(1, 1));
    await s.setSecret(A.id, "llm_key", "sk-live-PLAINTEXT-MARKER");
    expect(await s.getSecret(A.id, "llm_key")).toBe("sk-live-PLAINTEXT-MARKER");
    // without a tenant context RLS hides the table entirely
    const noCtx = await sql<{
      n: number;
    }>`select count(*)::int as n from crm.tenant_secret`.execute(env.db);
    expect(noCtx.rows[0]!.n).toBe(0);
    const row = await withTenant(env.db, A.id, (t) =>
      t
        .selectFrom("tenant_secret")
        .selectAll()
        .where("kind", "=", "llm_key")
        .executeTakeFirstOrThrow(),
    );
    expect(row.ciphertext.toString("utf8")).not.toContain("PLAINTEXT-MARKER");
    expect(row.ciphertext.toString("hex")).not.toContain(
      Buffer.from("PLAINTEXT-MARKER").toString("hex"),
    );
    expect(row.iv).toHaveLength(12);
    expect(row.auth_tag).toHaveLength(16);
  });

  it("setSecret upserts (one row per tenant+kind)", async () => {
    const s = svc(ring(1, 1));
    await s.setSecret(A.id, "tool_hmac", "v1");
    await s.setSecret(A.id, "tool_hmac", "v2");
    expect(await s.getSecret(A.id, "tool_hmac")).toBe("v2");
    const n = await withTenant(env.db, A.id, (t) =>
      t
        .selectFrom("tenant_secret")
        .select((e) => e.fn.countAll().as("n"))
        .where("kind", "=", "tool_hmac")
        .executeTakeFirstOrThrow(),
    );
    expect(Number(n.n)).toBe(1);
  });

  it("tenant isolation: B cannot read A's secret, and a ciphertext moved into B's row will not decrypt", async () => {
    const s = svc(ring(1, 1));
    await s.setSecret(A.id, "whatsapp_key", "A-ONLY");
    expect(await s.getSecret(B.id, "whatsapp_key")).toBeNull();
    // attacker with DB write access copies A's sealed blob into B's row
    const a = await withTenant(env.db, A.id, (t) =>
      t
        .selectFrom("tenant_secret")
        .selectAll()
        .where("kind", "=", "whatsapp_key")
        .executeTakeFirstOrThrow(),
    );
    await withTenant(env.db, B.id, (t) =>
      t
        .insertInto("tenant_secret")
        .values({
          tenant_id: B.id,
          kind: "whatsapp_key",
          ciphertext: a.ciphertext,
          iv: a.iv,
          auth_tag: a.auth_tag,
          key_version: a.key_version,
        })
        .execute(),
    );
    await expect(s.getSecret(B.id, "whatsapp_key")).rejects.toThrow(SecretError);
  });

  it("key rotation: old rows stay readable, rotateTenant moves them to the new key, old key can then be retired", async () => {
    const v1 = svc(ring(1, 1));
    await v1.setSecret(A.id, "dograh_api_key", "rotate-me");
    const v2 = svc({
      current: 2,
      keys: new Map([
        [1, Buffer.alloc(32, 1)],
        [2, Buffer.alloc(32, 2)],
      ]),
    });
    expect(await v2.getSecret(A.id, "dograh_api_key")).toBe("rotate-me"); // still readable
    expect(await v2.rotateTenant(A.id)).toBeGreaterThanOrEqual(1);
    const versions = await withTenant(env.db, A.id, (t) =>
      t
        .selectFrom("tenant_secret")
        .select("key_version")
        .where("kind", "=", "dograh_api_key")
        .executeTakeFirstOrThrow(),
    );
    expect(versions.key_version).toBe(2);
    const v2only = svc(ring(2, 2)); // key 1 retired
    expect(await v2only.getSecret(A.id, "dograh_api_key")).toBe("rotate-me");
  });

  it("refuses empty secrets and works inside a caller's transaction", async () => {
    const s = svc(ring(1, 1));
    await expect(s.setSecret(A.id, "llm_key", "")).rejects.toThrow(/empty/);
    await withTenant(env.db, A.id, async (tx) => {
      await s.setSecret(A.id, "in_tx", "inside", tx);
      expect(await s.getSecret(A.id, "in_tx", tx)).toBe("inside");
    });
  });
});
