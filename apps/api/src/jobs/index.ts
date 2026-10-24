import type { AnyJob } from "./define.js";
import { dialJob } from "../modules/calls/dial.js";
import { syncRunsJob } from "../modules/calls/sync.js";
import { systemPing } from "./system.js";
import {
  campaignControlJob,
  campaignStartJob,
  campaignSyncJob,
} from "../modules/campaigns/jobs.js";

export * from "./define.js";
export {
  createJobQueue,
  createBoss,
  DEAD_LETTER_QUEUE,
  DEFAULT_QUEUE_OPTIONS,
  PGBOSS_SCHEMA,
  type JobQueue,
} from "./queue.js";
export { startWorker } from "./worker.js";
export { installJobs } from "./install.js";
export { systemPing, dialJob, syncRunsJob, campaignStartJob, campaignSyncJob, campaignControlJob };

/**
 * EVERY job the worker runs and `jobs:install` creates a queue for. To add a job: define it in
 * modules/<feature>/jobs.ts with defineJob(...) and add ONE line here.
 */
export const allJobs: AnyJob[] = [
  systemPing,
  dialJob,
  syncRunsJob,
  campaignStartJob,
  campaignSyncJob,
  campaignControlJob,
];
