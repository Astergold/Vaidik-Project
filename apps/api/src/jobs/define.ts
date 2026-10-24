import { z } from "zod";
import type { Db, Tx } from "@vernacular/db";
import type { QueueOptions } from "pg-boss";
import type { VoiceDialer } from "../modules/calls/dialer.js";
import type { SecretsService } from "../modules/secrets/service.js";
import type { PlatformResolver } from "../modules/campaigns/platform.js";
import type { JobQueue } from "./queue.js";

/** External services jobs may use. The worker entrypoint wires the real implementations. */
export interface JobDeps {
  dialer: VoiceDialer;
  /** Calling-platform client per tenant (campaign mirroring). Jobs that need it fail clearly without it. */
  platform?: PlatformResolver;
  /** Global platform key: dev/staging fallback for tenants without their own key. Never set in production. */
  globalPlatformKey?: string | null;
}

/** Every job payload MUST carry the tenant it belongs to. pg-boss tables are not tenant-scoped. */
export const tenantPayload = z.object({ tenantId: z.uuid() });

export interface JobContext {
  db: Db;
  tenantId: string;
  jobId: string;
  /** Decrypts this tenant's integration secrets. `await ctx.secrets.getSecret(ctx.tenantId, "dograh_api_key")` */
  secrets: SecretsService;
  deps: JobDeps;
  /** Enqueue follow-up jobs. ONLY via `ctx.jobs.enqueueInTx(tx, ...)` inside `ctx.withTx`. */
  jobs: JobQueue;
  log: {
    info(o: object, m?: string): void;
    warn(o: object, m?: string): void;
    error(o: object, m?: string): void;
  };
  /**
   * Run tenant-scoped work. Open a transaction per unit of work and keep it SHORT:
   * never hold one open across an external call (provider, LLM, R2).
   */
  withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

export interface JobDef<
  S extends z.ZodType<{ tenantId: string }> = z.ZodType<{ tenantId: string }>,
> {
  /** e.g. "call.dial". Lower-case, dot-separated. */
  name: string;
  schema: S;
  handler(ctx: JobContext, data: z.infer<S>): Promise<void>;
  /** Overrides for DEFAULT_QUEUE_OPTIONS (retries, expiry...). Applied by `pnpm jobs:install`. */
  queue?: QueueOptions;
  work?: { pollingIntervalSeconds?: number; localConcurrency?: number };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyJob = JobDef<any>;

export function defineJob<S extends z.ZodType<{ tenantId: string }>>(def: JobDef<S>): JobDef<S> {
  if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(def.name)) {
    throw new Error(`job name "${def.name}" must look like "domain.action"`);
  }
  return def;
}
