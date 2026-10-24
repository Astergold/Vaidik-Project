import pg from "pg";
import { PgBoss } from "pg-boss";
import type { AnyJob } from "./define.js";
import { DEAD_LETTER_QUEUE, DEFAULT_QUEUE_OPTIONS, PGBOSS_SCHEMA } from "./queue.js";

/**
 * Deploy-time step, run with the OWNER url (needs DDL), AFTER `db:migrate`:
 *   1. install/upgrade the pgboss schema
 *   2. create/update every queue with our retry + dead-letter defaults
 *   3. grant the app role (crm_app) DML only. It can never alter the job tables' structure.
 * Idempotent: safe to run on every deploy.
 */
export async function installJobs(
  ownerUrl: string,
  jobs: AnyJob[],
  extraQueues: { name: string; options?: object }[] = [],
) {
  const boss = new PgBoss({
    connectionString: ownerUrl,
    schema: PGBOSS_SCHEMA,
    supervise: false,
    schedule: false,
  });
  await boss.start(); // creates schema + runs pg-boss migrations if needed

  const wanted = [
    {
      name: DEAD_LETTER_QUEUE,
      options: {
        retryLimit: 0,
        retentionSeconds: 30 * 24 * 3600,
        deleteAfterSeconds: 30 * 24 * 3600,
      },
    },
    ...jobs.map((j) => ({
      name: j.name,
      options: {
        ...DEFAULT_QUEUE_OPTIONS,
        ...(j.queue ?? {}),
        deadLetter: DEAD_LETTER_QUEUE,
      },
    })),
    ...extraQueues.map((q) => ({
      name: q.name,
      options: {
        ...DEFAULT_QUEUE_OPTIONS,
        ...(q.options ?? {}),
        deadLetter: DEAD_LETTER_QUEUE,
      },
    })),
  ];
  for (const q of wanted) {
    const existing = await boss.getQueue(q.name);
    if (existing) await boss.updateQueue(q.name, q.options);
    else await boss.createQueue(q.name, q.options);
  }
  await boss.stop({ graceful: true, close: true });

  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query(`
      grant usage on schema ${PGBOSS_SCHEMA} to crm_app;
      grant select, insert, update, delete on all tables in schema ${PGBOSS_SCHEMA} to crm_app;
      grant usage, select on all sequences in schema ${PGBOSS_SCHEMA} to crm_app;
      grant execute on all functions in schema ${PGBOSS_SCHEMA} to crm_app;
      alter default privileges in schema ${PGBOSS_SCHEMA} grant select, insert, update, delete on tables to crm_app;
      alter default privileges in schema ${PGBOSS_SCHEMA} grant usage, select on sequences to crm_app;
      alter default privileges in schema ${PGBOSS_SCHEMA} grant execute on functions to crm_app;
    `);
  } finally {
    await client.end();
  }
  return wanted.map((q) => q.name);
}
