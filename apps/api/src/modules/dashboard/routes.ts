import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { apiError, dashboardQuery, dashboardResponse } from "@vernacular/contracts";
import { tenantCtx } from "../../context.js";
import { requireRole } from "../../guards.js";
import { getDashboard } from "./service.js";

export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/api/dashboard",
    {
      preHandler: requireRole("owner", "admin", "admission_head"),
      schema: {
        tags: ["dashboard"],
        summary: "Funnel, temperature, call and source/agent aggregates",
        querystring: dashboardQuery,
        response: { 200: dashboardResponse, 403: apiError, 422: apiError },
      },
    },
    async (req) => getDashboard(tenantCtx(req).tx, req.query),
  );
};
