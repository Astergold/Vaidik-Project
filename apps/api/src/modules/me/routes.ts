import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { apiError, meResponse } from "@vernacular/contracts";
import { tenantCtx } from "../../context.js";
import { notFound } from "../../errors.js";

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/api/me",
    {
      schema: {
        tags: ["auth"],
        summary: "Current user, tenant and role",
        response: { 200: meResponse, 401: apiError, 403: apiError },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      const tenant = await tx
        .selectFrom("tenant")
        .select(["id", "name", "slug", "timezone", "status"])
        .where("id", "=", auth.tenantId)
        .executeTakeFirst();
      if (!tenant) throw notFound("Tenant");
      return {
        user: { id: auth.userId, name: auth.name, email: auth.email },
        tenant: { ...tenant, status: tenant.status as "active" | "suspended" },
        role: auth.role,
        isPlatformAdmin: auth.isPlatformAdmin,
        impersonatedBy: auth.impersonatedBy,
      };
    },
  );
};
