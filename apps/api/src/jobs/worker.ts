import { withTenant, type Db } from "@vernacular/db";
import type { AnyJob, JobContext, JobDeps } from "./define.js";
import type { SecretsService } from "../modules/secrets/service.js";
import { createBoss, createJobQueue } from "./queue.js";

type Logger = JobContext["log"];

/**
 * Registers every job, opens tenant context per job, and lets pg-boss handle retries / dead-lettering
 * (a thrown error = failed attempt). Returns a stop function.
 */
export async function startWorker(opts: {
  databaseUrl: string;
  db: Db;
  jobs: AnyJob[];
  log: Logger;
  secrets: SecretsService;
  deps: JobDeps;
  supervise?: boolean;
}) {
  const boss = createBoss(opts.databaseUrl, {
    supervise: opts.supervise ?? true,
  });
  boss.on("error", (err) => opts.log.error({ err }, "pg-boss error"));
  await boss.start();
  const queue = createJobQueue(opts.databaseUrl); // publisher for follow-up jobs (reschedules)

  for (const job of opts.jobs) {
    await boss.work<Record<string, unknown>>(
      job.name,
      {
        pollingIntervalSeconds: job.work?.pollingIntervalSeconds ?? 2,
        localConcurrency: job.work?.localConcurrency ?? 1,
      },
      async (batch) => {
        for (const j of batch) {
          const data = job.schema.parse(j.data); // invalid payload => throws => retried => dead-lettered
          const ctx: JobContext = {
            db: opts.db,
            tenantId: data.tenantId,
            jobId: j.id,
            secrets: opts.secrets,
            deps: opts.deps,
            jobs: queue,
            log: opts.log,
            withTx: (fn) => withTenant(opts.db, data.tenantId, fn),
          };
          await job.handler(ctx, data);
        }
      },
    );
  }
  return {
    boss,
    stop: async () => {
      await boss.stop({ graceful: true, close: true, timeout: 20_000 });
      await queue.stop();
    },
  };
}
