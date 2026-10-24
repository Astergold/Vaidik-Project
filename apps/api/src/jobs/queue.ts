import { PgBoss, fromKysely, type QueueOptions, type SendOptions } from "pg-boss";
import { sql } from "kysely";
import type { z } from "zod";
import type { Tx } from "@vernacular/db";
import type { JobDef } from "./define.js";

export const PGBOSS_SCHEMA = "pgboss";
export const DEAD_LETTER_QUEUE = "dead_letter";

/** Retry/expiry defaults for every queue. A job may override via JobDef.queue. */
export const DEFAULT_QUEUE_OPTIONS: QueueOptions = {
  retryLimit: 5,
  retryDelay: 30, // seconds; exponential backoff below
  retryBackoff: true,
  expireInSeconds: 15 * 60,
  retentionSeconds: 14 * 24 * 3600,
  deleteAfterSeconds: 7 * 24 * 3600,
};

/** Runtime connection for api/worker: app role, schema already installed, no DDL attempted. */
export function createBoss(connectionString: string, opts: { supervise?: boolean } = {}) {
  return new PgBoss({
    connectionString,
    schema: PGBOSS_SCHEMA,
    migrate: false,
    createSchema: false,
    supervise: opts.supervise ?? false,
    schedule: false,
    application_name: "vernacular-crm",
    max: 4,
  });
}

/**
 * Publisher used by the API (and by the worker for follow-up jobs).
 * The only way to enqueue is inside the caller's transaction, so a rollback un-sends the job.
 */
export function createJobQueue(connectionString: string) {
  const boss = createBoss(connectionString);
  let started: Promise<unknown> | null = null;
  const ensureStarted = () => (started ??= boss.start());

  return {
    boss,
    start: ensureStarted,
    async stop() {
      if (started) await boss.stop({ graceful: true, close: true });
    },

    /**
     * Enqueue in the SAME transaction as the data change. If the transaction rolls back,
     * the job never exists. Payload is validated and must belong to the transaction's tenant.
     */
    async enqueueInTx<S extends z.ZodType<{ tenantId: string }>>(
      tx: Tx,
      job: JobDef<S>,
      data: z.input<S>,
      options: SendOptions = {},
    ): Promise<string | null> {
      const payload = job.schema.parse(data);
      const ctx = await sql<{
        t: string | null;
      }>`select current_setting('app.tenant_id', true) as t`.execute(tx);
      if (ctx.rows[0]?.t !== payload.tenantId) {
        throw new Error(
          `enqueueInTx(${job.name}): payload tenantId does not match the transaction's tenant`,
        );
      }
      await ensureStarted();
      return boss.send(job.name, payload as object, {
        ...options,
        db: fromKysely(tx),
      });
    },
  };
}

export type JobQueue = ReturnType<typeof createJobQueue>;
