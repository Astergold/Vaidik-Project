import { z } from "zod";
import { createDb } from "@vernacular/db";
import { allJobs, startWorker } from "@vernacular/api/jobs";
import { FakeDialer } from "@vernacular/api/dialer";
import { loadMasterKeys } from "@vernacular/api/config";
import { createSecretsService } from "@vernacular/api/secrets";
import { createPlatformResolver } from "@vernacular/api/platform";
import { DograhDialer } from "@vernacular/integration-dograh";

const env = z
  .object({
    DATABASE_URL: z.url(),
    LOG_LEVEL: z.enum(["error", "warn", "info", "debug", "silent"]).default("info"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DOGRAH_BASE_URL: z.url().optional(),
    DOGRAH_API_BASE_URL: z.url().optional(),
    GODRAH_API_BASE_URL: z.url().optional(),
    DOGRAH_PLATFORM_KEY: z.string().min(1).optional(),
    DOGRAH_API_KEY: z.string().min(1).optional(),
    GODRAH_API_KEY: z.string().min(1).optional(),
  })
  .parse(process.env);

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3, silent: -1 } as const;
const emit = (level: "error" | "warn" | "info") => (o: object, msg?: string) => {
  if (LEVELS[level] > LEVELS[env.LOG_LEVEL]) return;
  console.warn(
    JSON.stringify({
      level,
      time: new Date().toISOString(),
      service: "worker",
      msg,
      ...o,
    }),
  );
};
const log = { info: emit("info"), warn: emit("warn"), error: emit("error") };

// App role only. The pgboss schema + queues are installed at deploy time by `pnpm jobs:install` (owner role).
const db = createDb(env.DATABASE_URL, { max: 10 });
const secrets = createSecretsService({ db, keyring: loadMasterKeys() }); // fails fast if MASTER_KEY is missing/invalid

// Calling platform for campaigns: the tenant's own key (tenant_secret) first; a global key only outside production.
for (const name of ["GODRAH_API_BASE_URL", "GODRAH_API_KEY"] as const)
  if (env[name]) log.warn({ name }, "deprecated env var; use the DOGRAH_* name");
const baseUrl =
  env.DOGRAH_BASE_URL ??
  env.DOGRAH_API_BASE_URL ??
  env.GODRAH_API_BASE_URL ??
  "https://godrah.laveric.com";
const globalPlatformKey =
  env.NODE_ENV === "production"
    ? null
    : (env.DOGRAH_PLATFORM_KEY ?? env.DOGRAH_API_KEY ?? env.GODRAH_API_KEY ?? null);
const platform = createPlatformResolver({ secrets, baseUrl, globalApiKey: globalPlatformKey });

// Single calls: the real platform dialer. DIAL_MODE=fake (dev/tests ONLY) pretends calls were placed and is refused in
// production, so production can never silently not dial.
if (process.env.DIAL_MODE === "fake" && env.NODE_ENV === "production") {
  log.error({}, "DIAL_MODE=fake is not allowed in production");
  process.exit(1);
}
const dialer = process.env.DIAL_MODE === "fake" ? new FakeDialer() : new DograhDialer({ baseUrl });
if (process.env.DIAL_MODE === "fake")
  log.warn({}, "DIAL_MODE=fake: calls are simulated, nothing is dialled");

const worker = await startWorker({
  databaseUrl: env.DATABASE_URL,
  db,
  jobs: allJobs,
  log,
  secrets,
  deps: { dialer, platform, globalPlatformKey },
});
log.info({ jobs: allJobs.map((j) => j.name) }, "worker started");

const shutdown = async (signal: string) => {
  log.info({ signal }, "worker shutting down");
  await worker.stop();
  await db.destroy();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
