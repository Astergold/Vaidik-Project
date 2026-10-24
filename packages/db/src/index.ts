import { Kysely, PostgresDialect, sql, type ControlledTransaction, type Transaction } from "kysely";
import pg from "pg";
import type { DB } from "./generated/db.js";

export type { DB, Campaign, Json, Timestamp } from "./generated/db.js";
export type Db = Kysely<DB>;
export type Tx = Transaction<DB>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build the app-role Kysely instance. `url` MUST be the crm_app (non-owner, no BYPASSRLS) URL.
 * search_path=crm so queries are written unqualified; nothing ever lives in `public`.
 */
export function createDb(url: string, opts: { max?: number } = {}): Db {
  const pool = new pg.Pool({
    connectionString: url,
    max: opts.max ?? 10,
    options: "-c search_path=crm",
  });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

/**
 * THE way to touch tenant data. Opens a transaction, sets the tenant for RLS
 * (transaction-local, so it can never leak across pooled connections), runs fn.
 * Every request handler and every job handler goes through this.
 */
export async function withTenant<T>(
  db: Db,
  tenantId: string,
  fn: (trx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) throw new Error("withTenant: tenantId must be a uuid");
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(trx);
    return fn(trx);
  });
}

/** A transaction you commit/rollback yourself. Only the HTTP tenant scope uses this; everything else uses withTenant. */
export type ControlledTx = ControlledTransaction<DB>;
