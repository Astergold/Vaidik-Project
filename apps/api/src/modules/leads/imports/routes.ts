/** Lead CSV import routes — tenant-scoped (D3-I3-03). */
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { apiError } from "@vernacular/contracts";
import { tenantCtx } from "../../../context.js";
import { notFound } from "../../../errors.js";

export const leadsImportsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/api/leads/imports",
    {
      schema: {
        tags: ["leads-import"],
        summary: "Upload import CSV",
        response: { 201: z.object({ id: z.string(), status: z.string() }), 401: apiError },
      },
    },
    async (req) => {
      const { auth } = tenantCtx(req);
      return { id: "import-001", status: "pending", tenantId: auth.tenantId };
    },
  );

  app.get(
    "/api/leads/imports/:id",
    {
      schema: {
        tags: ["leads-import"],
        params: z.object({ id: z.string() }),
        response: { 200: z.object({ id: z.string(), status: z.string() }), 401: apiError, 404: apiError },
      },
    },
    async (req) => {
      // STUB (real import pipeline is D3-I3-03): no import is actually persisted, so any id
      // that was not minted by the POST above is unknown. Never echo rows for arbitrary ids.
      if (req.params.id !== "import-001") throw notFound("Import");
      return { id: req.params.id, status: "running" };
    },
  );
};
