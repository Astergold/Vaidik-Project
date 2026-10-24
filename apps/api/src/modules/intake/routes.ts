import formbody from "@fastify/formbody";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { sql } from "kysely";
import { z } from "zod";
import { apiError, intakeResponse } from "@vernacular/contracts";
import { forbidden, unauthenticated } from "../../errors.js";
import { bearerToken, tokenMatches } from "./mapping.js";
import { ingestLead } from "./service.js";

interface SourceRow {
  id: string;
  tenant_id: string;
  secret_token_hash: string | null;
  field_mapping: unknown;
  default_program_id: string | null;
  default_agent_id: string | null;
  auto_dial: boolean;
  tenant_status: string;
}

/**
 * PUBLIC endpoint for lead providers (website forms' backends, aggregators, Meta/Google lead webhooks, ERPs).
 *   POST /api/intake/:sourceKey      Authorization: Bearer <source token>
 * JSON or application/x-www-form-urlencoded. No cookies, no CORS: call it from a server, never from a browser
 * (the token would be public). Responds 202 with no external calls, so it stays far below 300 ms.
 */
export const intakeRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(formbody); // urlencoded bodies for this route only (encapsulated)

  app.post(
    "/api/intake/:sourceKey",
    {
      bodyLimit: 100 * 1024,
      config: {
        public: true,
        // per-source limit so one noisy provider can't starve the others
        rateLimit: app.config.rateLimitEnabled
          ? {
              max: 600,
              timeWindow: "1 minute",
              keyGenerator: (req: { params: unknown }) =>
                `intake:${(req.params as { sourceKey?: string }).sourceKey}`,
            }
          : false,
      },
      schema: {
        tags: ["intake"],
        summary: "Submit a lead (provider endpoint)",
        params: z.object({ sourceKey: z.string().min(16).max(128) }),
        body: z.record(z.string(), z.unknown()),
        response: {
          202: intakeResponse,
          401: apiError,
          403: apiError,
          409: apiError,
          422: apiError,
        },
      },
    },
    async (req, reply) => {
      const rows =
        await sql<SourceRow>`select * from crm.resolve_intake_source(${req.params.sourceKey})`.execute(
          app.db,
        );
      const src = rows.rows[0];
      // unknown key, wrong token and token-less source all look identical, and cost the same
      if (!tokenMatches(bearerToken(req.headers.authorization), src?.secret_token_hash) || !src) {
        throw unauthenticated("Invalid credentials");
      }
      if (src.tenant_status !== "active")
        throw forbidden("This account is suspended", "TENANT_SUSPENDED");

      const out = await ingestLead(
        { db: app.db, jobs: app.jobs },
        {
          id: src.id,
          tenantId: src.tenant_id,
          fieldMapping: src.field_mapping,
          defaultProgramId: src.default_program_id,
          defaultAgentId: src.default_agent_id,
          autoDial: src.auto_dial,
        },
        req.body,
        {
          ip: req.ip,
          userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
          receivedAt: new Date(),
        },
      );
      return reply.status(202).send(out);
    },
  );
};
