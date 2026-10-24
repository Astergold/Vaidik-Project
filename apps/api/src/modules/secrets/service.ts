import type { Db, Tx } from "@vernacular/db";
import { withTenant } from "@vernacular/db";
import { open, seal, type Keyring } from "./crypto.js";

/** Known secret kinds. Free-form strings are allowed, but prefer adding to this list. */
export type SecretKind =
  | "dograh_api_key"
  | "dograh_webhook_secret"
  | "llm_key"
  | "whatsapp_key"
  | "tool_hmac"
  | (string & {});

const aadFor = (tenantId: string, kind: string) => `${tenantId}:${kind}`;

export function createSecretsService(deps: { db: Db; keyring: Keyring }) {
  const { db, keyring } = deps;

  async function read(tx: Tx, tenantId: string, kind: SecretKind): Promise<string | null> {
    const row = await tx
      .selectFrom("tenant_secret")
      .select(["ciphertext", "iv", "auth_tag", "key_version"])
      .where("kind", "=", kind)
      .executeTakeFirst();
    if (!row) return null;
    return open(
      {
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
        keyVersion: row.key_version,
      },
      keyring,
      aadFor(tenantId, kind),
    );
  }

  async function write(tx: Tx, tenantId: string, kind: SecretKind, plaintext: string) {
    const s = seal(plaintext, keyring, aadFor(tenantId, kind));
    await tx
      .insertInto("tenant_secret")
      .values({
        tenant_id: tenantId,
        kind,
        ciphertext: s.ciphertext,
        iv: s.iv,
        auth_tag: s.authTag,
        key_version: s.keyVersion,
      })
      .onConflict((oc) =>
        oc.columns(["tenant_id", "kind"]).doUpdateSet({
          ciphertext: s.ciphertext,
          iv: s.iv,
          auth_tag: s.authTag,
          key_version: s.keyVersion,
        }),
      )
      .execute();
  }

  return {
    /** Returns the plaintext, or null if the tenant has no such secret. Pass `tx` to reuse a transaction. */
    getSecret(tenantId: string, kind: SecretKind, tx?: Tx): Promise<string | null> {
      return tx
        ? read(tx, tenantId, kind)
        : withTenant(db, tenantId, (t) => read(t, tenantId, kind));
    },
    /** Like getSecret but throws when missing (use for "this integration must be configured"). */
    async requireSecret(tenantId: string, kind: SecretKind, tx?: Tx): Promise<string> {
      const v = await this.getSecret(tenantId, kind, tx);
      if (v === null) throw new Error(`tenant secret "${kind}" is not configured`);
      return v;
    },
    async setSecret(tenantId: string, kind: SecretKind, plaintext: string, tx?: Tx): Promise<void> {
      if (!plaintext) throw new Error("refusing to store an empty secret");
      if (tx) return write(tx, tenantId, kind, plaintext);
      await withTenant(db, tenantId, (t) => write(t, tenantId, kind, plaintext));
    },
    async deleteSecret(tenantId: string, kind: SecretKind): Promise<void> {
      await withTenant(db, tenantId, (t) =>
        t.deleteFrom("tenant_secret").where("kind", "=", kind).execute(),
      );
    },
    /** Re-encrypts every secret of one tenant that is not on the current key. Returns how many. */
    async rotateTenant(tenantId: string): Promise<number> {
      return withTenant(db, tenantId, async (tx) => {
        const rows = await tx
          .selectFrom("tenant_secret")
          .select(["kind", "key_version"])
          .where("key_version", "<>", keyring.current)
          .execute();
        for (const r of rows) {
          const plain = await read(tx, tenantId, r.kind);
          if (plain !== null) await write(tx, tenantId, r.kind, plain);
        }
        return rows.length;
      });
    },
  };
}

export type SecretsService = ReturnType<typeof createSecretsService>;
