import { z } from "zod";

/**
 * Dev-only values shipped in .env.example. In production the process refuses to start with them.
 */
export const DEV_BETTER_AUTH_SECRET = "dev-only-better-auth-secret-change-me-0123456789";
export const DEV_MASTER_KEY = "s/Ub4iflbTkrMoIdOY/tUFx5PjRpq2kBndwu5z83UmI=";

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  APP_VERSION: z.string().default("0.1.0"),

  /** crm_app role (non-owner, no BYPASSRLS). Never the owner URL. */
  DATABASE_URL: z.url(),
  PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),

  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 chars"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  /** base64, exactly 32 bytes. Encrypts tenant_secret rows (AES-256-GCM). */
  MASTER_KEY: z.string().min(1),
  MASTER_KEY_VERSION: z.coerce.number().int().positive().default(1),
  /** Optional JSON {"1":"<base64>"} of retired keys, so old rows stay readable during rotation. */
  MASTER_KEY_PREVIOUS: z.string().optional(),

  /** Calling platform (Appendix D). Per-tenant keys live encrypted in crm.tenant_secret (dograh_api_key). */
  DOGRAH_BASE_URL: z.url().optional(),
  DOGRAH_API_BASE_URL: z.url().optional(),
  /** Global key: dev/staging fallback only. Ignored in production. */
  DOGRAH_PLATFORM_KEY: z.string().min(1).optional(),
  DOGRAH_API_KEY: z.string().min(1).optional(),
  /** Deprecated aliases of the two above (a warning is logged when used). */
  GODRAH_API_BASE_URL: z.url().optional(),
  GODRAH_API_KEY: z.string().min(1).optional(),

  ENABLE_API_DOCS: bool.optional(),
  RATE_LIMIT_ENABLED: bool.default(true),
});

export interface Config {
  env: "development" | "test" | "production";
  port: number;
  logLevel: string;
  version: string;
  databaseUrl: string;
  publicBaseUrl: string;
  betterAuthSecret: string;
  google: { clientId: string; clientSecret: string } | null;
  masterKeys: { current: number; keys: Map<number, Buffer> };
  enableApiDocs: boolean;
  rateLimitEnabled: boolean;
  godrahBaseUrl: string;
  godrahGlobalApiKey: string | null;
  /** Deprecated env names that were used, so the server can warn once at boot. */
  deprecatedEnv: string[];
}

function decodeKey(b64: string, label: string): Buffer {
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32)
    throw new Error(`${label} must be base64 of exactly 32 bytes (got ${buf.length})`);
  return buf;
}

/** Parses MASTER_KEY / MASTER_KEY_VERSION / MASTER_KEY_PREVIOUS. Shared by the API and the worker. */
export function loadMasterKeys(
  env: Record<string, string | undefined> = process.env,
): Config["masterKeys"] {
  const parsed = envSchema
    .pick({
      MASTER_KEY: true,
      MASTER_KEY_VERSION: true,
      MASTER_KEY_PREVIOUS: true,
    })
    .safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }
  const e = parsed.data;
  const keys = new Map<number, Buffer>();
  keys.set(e.MASTER_KEY_VERSION, decodeKey(e.MASTER_KEY, "MASTER_KEY"));
  if (e.MASTER_KEY_PREVIOUS) {
    let prev: Record<string, string>;
    try {
      prev = z.record(z.string(), z.string()).parse(JSON.parse(e.MASTER_KEY_PREVIOUS));
    } catch {
      throw new Error(
        'Invalid configuration: MASTER_KEY_PREVIOUS must be JSON like {"1":"<base64>"}',
      );
    }
    for (const [v, k] of Object.entries(prev)) {
      const version = Number(v);
      if (!Number.isInteger(version) || version === e.MASTER_KEY_VERSION) {
        throw new Error(
          `Invalid configuration: MASTER_KEY_PREVIOUS has bad or duplicate version "${v}"`,
        );
      }
      keys.set(version, decodeKey(k, `MASTER_KEY_PREVIOUS[${v}]`));
    }
  }
  return { current: e.MASTER_KEY_VERSION, keys };
}

/** Validates env and fails fast with a readable message. Pass an env object in tests. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }
  const e = parsed.data;

  const masterKeys = loadMasterKeys(env);

  if (e.NODE_ENV === "production") {
    if (e.BETTER_AUTH_SECRET === DEV_BETTER_AUTH_SECRET || e.MASTER_KEY === DEV_MASTER_KEY) {
      throw new Error("Invalid configuration: dev-only secrets must not be used in production");
    }
    if (e.GOOGLE_CLIENT_ID && !e.GOOGLE_CLIENT_SECRET) {
      throw new Error("Invalid configuration: GOOGLE_CLIENT_ID set without GOOGLE_CLIENT_SECRET");
    }
  }

  return {
    env: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    version: e.APP_VERSION,
    databaseUrl: e.DATABASE_URL,
    publicBaseUrl: e.PUBLIC_BASE_URL,
    betterAuthSecret: e.BETTER_AUTH_SECRET,
    google:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
        ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET }
        : null,
    masterKeys,
    // API docs are internal: on by default outside production, off in production unless explicitly enabled.
    enableApiDocs: e.ENABLE_API_DOCS ?? e.NODE_ENV !== "production",
    rateLimitEnabled: e.RATE_LIMIT_ENABLED,
    godrahBaseUrl:
      e.DOGRAH_BASE_URL ??
      e.DOGRAH_API_BASE_URL ??
      e.GODRAH_API_BASE_URL ??
      "https://godrah.laveric.com",
    // A global key is a dev/staging convenience; production must use per-tenant keys.
    godrahGlobalApiKey:
      e.NODE_ENV === "production"
        ? null
        : (e.DOGRAH_PLATFORM_KEY ?? e.DOGRAH_API_KEY ?? e.GODRAH_API_KEY ?? null),
    deprecatedEnv: (["GODRAH_API_BASE_URL", "GODRAH_API_KEY"] as const).filter((k) => e[k]),
  };
}
