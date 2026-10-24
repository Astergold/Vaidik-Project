import type { Role } from "@vernacular/contracts";
import type { ControlledTx, Db } from "@vernacular/db";
import type { Auth } from "./auth/auth.js";
import type { Config } from "./config.js";
import type { JobQueue } from "./jobs/queue.js";
import type { Mailer } from "./lib/mailer.js";
import type { RouteInfo } from "./server.js";
import type { SecretsService } from "./modules/secrets/service.js";
import type { PlatformResolver } from "./modules/campaigns/platform.js";

/** Who is calling, resolved from the session cookie. Present on every tenant-scoped route. */
export interface AuthContext {
  userId: string;
  name: string;
  email: string;
  tenantId: string;
  role: Role;
  /** Laveric super-admin. Passes every role check (handbook §7.5) but still needs a tenant context. */
  isPlatformAdmin: boolean;
  sessionId: string;
  impersonatedBy: string | null;
}

declare module "fastify" {
  interface FastifyInstance {
    config: Config;
    db: Db;
    auth: Auth;
    mailer: Mailer;
    /** Enqueue background work: `app.jobs.enqueueInTx(req.tx, job, data)`. */
    jobs: JobQueue;
    /** Tenant secrets (AES-GCM). */
    secrets: SecretsService;
    /** Calling-platform client for a tenant (campaign mirroring). */
    platform: PlatformResolver;
    /** Every registered route (method/url/public). For the route-registry test. */
    routes: RouteInfo[];
  }
  interface FastifyRequest {
    /** Set by the tenant scope. null on public routes. */
    authCtx: AuthContext | null;
    /** The request's tenant-scoped transaction (RLS context already set). null on public routes. */
    tx: ControlledTx | null;
    /** Exact bytes of a JSON body — needed for HMAC signature checks. */
    rawBody?: Buffer;
  }
  interface FastifyContextConfig {
    /** Marks a route as intentionally public. The route registry test requires every other route to 401. */
    public?: boolean;
  }
}
