import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  type FastifyPluginAsyncZod,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { createDb, type Db } from "@vernacular/db";
import { createAuth, createAuthPool, type Auth } from "./auth/auth.js";
import { createJobQueue, type JobQueue } from "./jobs/queue.js";
import { createSecretsService, type SecretsService } from "./modules/secrets/service.js";
import { createPlatformResolver, type PlatformResolver } from "./modules/campaigns/platform.js";
import type { Config } from "./config.js";
import { forbidden } from "./errors.js";
import { ConsoleMailer, type Mailer } from "./lib/mailer.js";
import { intakeRoutes } from "./modules/intake/routes.js";
import { tenantModules } from "./modules/index.js";
import { godrahWebhookRoutes } from "./modules/calls/webhooks.js";
import { brandingRoutes } from "./modules/branding/routes.js";
import { registerAuthRoute, toWebHeaders } from "./plugins/auth-route.js";
import { registerErrorHandling } from "./plugins/errors.js";
import { registerRawBody } from "./plugins/raw-body.js";
import { tenantScope } from "./plugins/tenant.js";

export interface RouteInfo {
  method: string;
  url: string;
  public: boolean;
}

export interface BuildOptions {
  config: Config;
  /** Extra tenant-scoped route plugins. Tests use this for probe routes; production passes none. */
  extraTenantModules?: FastifyPluginAsyncZod[];
  /** Inject for tests. Defaults are created (and closed on shutdown) here. */
  db?: Db;
  auth?: Auth;
  mailer?: Mailer;
  jobs?: JobQueue;
  secrets?: SecretsService;
  /** Calling-platform client per tenant. Tests inject an in-memory fake. */
  platform?: PlatformResolver;
}

export async function buildServer(opts: BuildOptions): Promise<FastifyInstance> {
  const { config } = opts;

  const app = Fastify({
    logger:
      config.env === "test" && config.logLevel === "silent"
        ? false
        : {
            level: config.logLevel,
            redact: [
              "req.headers.cookie",
              "req.headers.authorization",
              "res.headers['set-cookie']",
            ],
          },
    trustProxy: true, // behind Caddy only (internal Docker network)
    bodyLimit: 1_048_576,
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
  });

  // Every registered route is recorded so tests can prove "everything non-public returns 401".
  const routes: RouteInfo[] = [];
  app.addHook("onRoute", (r) => {
    const methods = Array.isArray(r.method) ? r.method : [r.method];
    for (const m of methods) {
      if (m === "HEAD" || m === "OPTIONS") continue;
      routes.push({ method: m, url: r.url, public: r.config?.public === true });
    }
  });
  app.decorate("routes", routes);

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerRawBody(app);

  // ---- shared services -------------------------------------------------------------------------
  const ownDb = !opts.db;
  const db = opts.db ?? createDb(config.databaseUrl);
  const mailer = opts.mailer ?? new ConsoleMailer((m) => app.log.warn(m));
  let ownedPool: ReturnType<typeof createAuthPool> | undefined;
  let auth = opts.auth;
  if (!auth) {
    ownedPool = createAuthPool(config.databaseUrl);
    auth = createAuth({ config, mailer, pool: ownedPool });
  }
  app.decorate("config", config);
  app.decorate("db", db);
  app.decorate("auth", auth);
  app.decorate("mailer", mailer);
  const jobs = opts.jobs ?? createJobQueue(config.databaseUrl);
  app.decorate("jobs", jobs);
  const secrets = opts.secrets ?? createSecretsService({ db, keyring: config.masterKeys });
  app.decorate("secrets", secrets);
  app.decorate(
    "platform",
    opts.platform ??
      createPlatformResolver({
        secrets,
        baseUrl: config.godrahBaseUrl,
        globalApiKey: config.godrahGlobalApiKey,
      }),
  );
  for (const name of config.deprecatedEnv)
    app.log.warn(`${name} is deprecated; use the DOGRAH_* name (see .env.example)`);
  app.decorateRequest("authCtx", null);
  app.decorateRequest("tx", null);
  app.decorateRequest("rawBody", undefined);
  app.addHook("onClose", async () => {
    if (ownDb) await db.destroy();
    if (!opts.jobs) await jobs.stop();
    await ownedPool?.end();
  });
  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("x-request-id", req.id);
    return payload;
  });

  // ---- rate limiting, errors -----------------------------------------------------------------
  if (config.rateLimitEnabled) {
    await app.register(rateLimit, {
      global: true,
      max: 600,
      timeWindow: "1 minute",
      errorResponseBuilder: () =>
        Object.assign(new Error("Too many requests"), { statusCode: 429 }),
    });
  }
  registerErrorHandling(app);

  // ---- OpenAPI (internal) --------------------------------------------------------------------
  if (config.enableApiDocs) {
    await app.register(swagger, {
      openapi: {
        info: { title: "Vernacular AI CRM API", version: config.version },
        components: {
          securitySchemes: {
            cookieAuth: {
              type: "apiKey",
              in: "cookie",
              name: "better-auth.session_token",
            },
          },
        },
        security: [{ cookieAuth: [] }],
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, {
      routePrefix: "/api/docs",
      uiHooks: {
        // internal only: open in dev/test, super-admin session required in production
        onRequest: async (req) => {
          if (config.env !== "production") return;
          const s = await app.auth.api.getSession({
            headers: toWebHeaders(req.headers),
          });
          if (!(s?.user as { isPlatformAdmin?: boolean } | undefined)?.isPlatformAdmin)
            throw forbidden();
        },
      },
    });
  }

  // ---- PUBLIC routes (explicitly marked) -------------------------------------------------------
  app.get("/health", { config: { public: true }, schema: { hide: true } }, async () => ({
    ok: true,
    version: config.version,
  }));
  app.get(
    "/health/ready",
    { config: { public: true }, schema: { hide: true } },
    async (_req, reply) => {
      try {
        await db.selectFrom("tenant").select("id").where("id", "=", randomUUID()).execute(); // proves DB + role work
        return { ok: true };
      } catch {
        return reply.status(503).send({ ok: false });
      }
    },
  );
  registerAuthRoute(app);
  await app.register(intakeRoutes); // public: provider endpoint, authenticated by per-source bearer token
  await app.register(godrahWebhookRoutes); // public: GODRAH webhooks, authenticated by HMAC
  await app.register(brandingRoutes); // public: branding by host

  // ---- TENANT routes: 401 without a session, RLS transaction in request.tx -----------------------
  await app.register(async (scope) => {
    await tenantScope(scope);
    const typed = scope.withTypeProvider<ZodTypeProvider>();
    for (const mod of [...tenantModules, ...(opts.extraTenantModules ?? [])])
      await typed.register(mod);
  });

  return app;
}
