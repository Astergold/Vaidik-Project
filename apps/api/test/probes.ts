import { sql } from "kysely";
import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { tenantCtx } from "../src/context.js";
import { AppError } from "../src/errors.js";
import { assertLeadAccess, requireRole } from "../src/guards.js";

/** Test-only tenant routes (passed via buildServer({ extraTenantModules })). Never in production. */
export const probes: FastifyPluginAsyncZod = async (app) => {
  app.get("/api/_probe/tenant", async (req) => {
    const { tx } = tenantCtx(req);
    const r = await sql<{ t: string; n: number }>`
      select current_setting('app.tenant_id', true) as t,
             (select count(*)::int from crm.person) as n`.execute(tx);
    return r.rows[0];
  });

  const body = z.object({ name: z.string() });
  app.post("/api/_probe/write-ok", { schema: { body } }, async (req) => {
    const { tx, auth } = tenantCtx(req);
    await tx
      .insertInto("person")
      .values({ tenant_id: auth.tenantId, full_name: req.body.name })
      .execute();
    return { ok: true };
  });
  app.post("/api/_probe/write-then-409", { schema: { body } }, async (req) => {
    const { tx, auth } = tenantCtx(req);
    await tx
      .insertInto("person")
      .values({ tenant_id: auth.tenantId, full_name: req.body.name })
      .execute();
    throw new AppError(409, "CONFLICT", "nope");
  });
  app.post("/api/_probe/write-then-crash", { schema: { body } }, async (req) => {
    const { tx, auth } = tenantCtx(req);
    await tx
      .insertInto("person")
      .values({ tenant_id: auth.tenantId, full_name: req.body.name })
      .execute();
    throw new Error("boom: secret internal detail");
  });

  app.get("/api/_probe/admin", { preHandler: requireRole("owner", "admin") }, async () => ({
    ok: true,
  }));
  app.get("/api/_probe/head", { preHandler: requireRole("admission_head") }, async () => ({
    ok: true,
  }));
  app.get(
    "/api/_probe/anyone",
    { preHandler: requireRole("owner", "admin", "admission_head", "counsellor") },
    async () => ({ ok: true }),
  );

  app.get(
    "/api/_probe/lead/:leadId",
    { schema: { params: z.object({ leadId: z.uuid() }) } },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      await assertLeadAccess(tx, auth, req.params.leadId);
      return { ok: true };
    },
  );
};
