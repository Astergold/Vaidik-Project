/** Duplicates routes — tenant-scoped (D6-I4-04c). */
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { apiError, duplicatesResponse, dismissDuplicateResponse } from "@vernacular/contracts";
import { tenantCtx } from "../../context.js";

export const duplicatesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/api/duplicates",
    {
      schema: {
        tags: ["duplicates"],
        summary: "List duplicate candidates",
        querystring: z.object({
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        }),
        response: { 200: duplicatesResponse, 401: apiError },
      },
    },
    async (req) => {
      tenantCtx(req); // enforces the session (401 otherwise); items are stubbed until D6 dispatch lands
      return { items: [], nextCursor: null, total: 0 };
    },
  );

  app.post(
    "/api/duplicates/:id/dismiss",
    {
      schema: {
        tags: ["duplicates"],
        summary: "Dismiss duplicate candidate",
        params: z.object({ id: z.string() }),
        response: { 200: dismissDuplicateResponse, 401: apiError, 404: apiError },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      tenantCtx(req);
      return { id, status: "dismissed" as const };
    },
  );
};
