import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sql } from "kysely";
import { ROLES, type Role } from "@vernacular/contracts";
import { forbidden, unauthenticated } from "../errors.js";
import type { AuthContext } from "../types.js";
import { toWebHeaders } from "./auth-route.js";

const roleSet = new Set<string>(ROLES);

/**
 * Everything registered inside this plugin is a TENANT route:
 *   1. onRequest  — resolve session -> user, tenant (active organisation), role. No session => 401.
 *   2. preHandler — open ONE transaction, set app.tenant_id (RLS), expose it as request.tx.
 *   3. onSend     — commit on success (<400), roll back otherwise. Handlers never manage transactions.
 * Routes that must be public are registered OUTSIDE this plugin and marked config.public = true.
 */
export async function tenantScope(app: FastifyInstance) {
  app.addHook("onRequest", async (req) => {
    req.authCtx = await resolveAuth(app, req);
    req.log = req.log.child({ tenantId: req.authCtx.tenantId, userId: req.authCtx.userId });
  });

  app.addHook("preHandler", async (req) => {
    const ctx = req.authCtx!;
    const trx = await app.db.startTransaction().execute();
    try {
      await sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`.execute(trx);
      const tenant = await trx.selectFrom("tenant").select("status").executeTakeFirst();
      if (!tenant) throw forbidden("Tenant not found", "NO_TENANT_CONTEXT");
      if (tenant.status !== "active" && !ctx.isPlatformAdmin) {
        throw forbidden("This account is suspended", "TENANT_SUSPENDED");
      }
    } catch (e) {
      await trx.rollback().execute();
      throw e;
    }
    req.tx = trx;
    openTx.add(req);
  });

  app.addHook("onSend", async (req, reply, payload) => {
    await finish(req, reply.statusCode < 400);
    return payload;
  });
  // Safety nets so a connection is never leaked (client abort, hook error before onSend).
  app.addHook("onRequestAbort", async (req) => finish(req, false));
  app.addHook("onResponse", async (req) => finish(req, false));
}

const openTx = new WeakSet<FastifyRequest>();

async function finish(req: FastifyRequest, commit: boolean) {
  if (!req.tx || !openTx.has(req)) return;
  openTx.delete(req);
  const trx = req.tx;
  if (commit) await trx.commit().execute();
  else await trx.rollback().execute();
}

async function resolveAuth(app: FastifyInstance, req: FastifyRequest): Promise<AuthContext> {
  const session = await app.auth.api.getSession({ headers: toWebHeaders(req.headers) });
  if (!session) throw unauthenticated();

  const user = session.user as typeof session.user & {
    isPlatformAdmin?: boolean;
    banned?: boolean | null;
  };
  if (user.banned) throw forbidden("This account is disabled", "ACCOUNT_DISABLED");

  const s = session.session as typeof session.session & {
    activeOrganizationId?: string | null;
    impersonatedBy?: string | null;
  };
  let tenantId = s.activeOrganizationId ?? null;
  if (!tenantId) {
    const first = await app.db
      .selectFrom("member")
      .select("organizationId")
      .where("userId", "=", user.id)
      .orderBy("createdAt", "asc")
      .executeTakeFirst();
    tenantId = first?.organizationId ?? null;
  }
  if (!tenantId) throw forbidden("No tenant context for this account", "NO_TENANT_CONTEXT");

  const member = await app.db
    .selectFrom("member")
    .select("role")
    .where("organizationId", "=", tenantId)
    .where("userId", "=", user.id)
    .executeTakeFirst();
  if (!member || !roleSet.has(member.role)) {
    throw forbidden("You are not a member of this tenant", "NOT_A_MEMBER");
  }

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    tenantId,
    role: member.role as Role,
    isPlatformAdmin: user.isPlatformAdmin === true,
    sessionId: s.id,
    impersonatedBy: s.impersonatedBy ?? null,
  };
}

export type { FastifyReply };
