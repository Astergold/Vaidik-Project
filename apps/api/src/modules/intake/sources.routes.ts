import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  apiError,
  createSourceBody,
  createSourceResponse,
  leadSource,
  patchSourceBody,
  rotateTokenResponse,
  sourcesListResponse,
  testMappingBody,
  testMappingResponse,
  type LeadSource,
} from "@vernacular/contracts";
import type { Tx } from "@vernacular/db";
import { tenantCtx } from "../../context.js";
import { notFound, validation } from "../../errors.js";
import { requireRole } from "../../guards.js";
import { audit } from "../../lib/audit.js";
import { applyMapping, generateSourceToken, hashToken } from "./mapping.js";
import { parseStoredMapping } from "./service.js";

const idParam = z.object({ id: z.uuid() });
const admins = requireRole("owner", "admin");
const viewers = requireRole("owner", "admin", "admission_head");

type Row = {
  id: string;
  name: string;
  kind: string;
  field_mapping: unknown;
  default_program_id: string | null;
  default_agent_id: string | null;
  auto_dial: boolean;
  is_active: boolean;
  source_key: string;
  secret_token_hash: string | null;
  created_at: Date;
};

const toWire = (r: Row, baseUrl: string): LeadSource => ({
  id: r.id,
  name: r.name,
  kind: r.kind as LeadSource["kind"],
  fieldMapping: parseStoredMapping(r.field_mapping),
  defaultProgramId: r.default_program_id,
  defaultAgentId: r.default_agent_id,
  autoDial: r.auto_dial,
  isActive: r.is_active,
  endpointUrl: `${baseUrl.replace(/\/$/, "")}/api/intake/${r.source_key}`,
  hasToken: r.secret_token_hash !== null,
  createdAt: r.created_at.toISOString(),
});

/** Defaults must belong to THIS tenant. (A foreign key alone would happily accept another tenant's id.) */
async function assertDefaults(
  tx: Tx,
  programId: string | null | undefined,
  agentId: string | null | undefined,
) {
  if (programId) {
    const p = await tx
      .selectFrom("program")
      .select("id")
      .where("id", "=", programId)
      .executeTakeFirst();
    if (!p)
      throw validation("Unknown program", [
        { path: "defaultProgramId", message: "Program not found" },
      ]);
  }
  if (agentId) {
    const a = await tx
      .selectFrom("ai_agent")
      .select("id")
      .where("id", "=", agentId)
      .executeTakeFirst();
    if (!a)
      throw validation("Unknown AI agent", [
        { path: "defaultAgentId", message: "AI agent not found" },
      ]);
  }
}

export const sourcesRoutes: FastifyPluginAsyncZod = async (app) => {
  const tag = ["settings"];

  app.get(
    "/api/settings/sources",
    {
      preHandler: viewers,
      schema: { tags: tag, summary: "List lead sources", response: { 200: sourcesListResponse } },
    },
    async (req) => {
      const { tx } = tenantCtx(req);
      const rows = await tx
        .selectFrom("intake_source")
        .selectAll()
        .orderBy("created_at", "desc")
        .execute();
      return { items: rows.map((r) => toWire(r as Row, app.config.publicBaseUrl)) };
    },
  );

  app.post(
    "/api/settings/sources",
    {
      preHandler: admins,
      schema: {
        tags: tag,
        summary: "Create a lead source (returns its token ONCE)",
        body: createSourceBody,
        response: { 201: createSourceResponse, 422: apiError },
      },
    },
    async (req, reply) => {
      const { tx, auth } = tenantCtx(req);
      const b = req.body;
      await assertDefaults(tx, b.defaultProgramId, b.defaultAgentId);
      const token = generateSourceToken();
      const row = await tx
        .insertInto("intake_source")
        .values({
          tenant_id: auth.tenantId,
          name: b.name,
          kind: b.kind,
          field_mapping: JSON.stringify(b.fieldMapping),
          default_program_id: b.defaultProgramId ?? null,
          default_agent_id: b.defaultAgentId ?? null,
          auto_dial: b.autoDial,
          secret_token_hash: hashToken(token),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit(tx, auth, {
        action: "source.create",
        entity: "intake_source",
        entityId: row.id,
        diff: { name: b.name, kind: b.kind },
        ip: req.ip,
      });
      return reply.status(201).send({ ...toWire(row as Row, app.config.publicBaseUrl), token });
    },
  );

  app.patch(
    "/api/settings/sources/:id",
    {
      preHandler: admins,
      schema: {
        tags: tag,
        summary: "Edit a lead source",
        params: idParam,
        body: patchSourceBody,
        response: { 200: leadSource, 404: apiError, 422: apiError },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      const b = req.body;
      await assertDefaults(tx, b.defaultProgramId, b.defaultAgentId);
      const set: Record<string, unknown> = {};
      if (b.name !== undefined) set.name = b.name;
      if (b.fieldMapping !== undefined) set.field_mapping = JSON.stringify(b.fieldMapping);
      if (b.defaultProgramId !== undefined) set.default_program_id = b.defaultProgramId;
      if (b.defaultAgentId !== undefined) set.default_agent_id = b.defaultAgentId;
      if (b.autoDial !== undefined) set.auto_dial = b.autoDial;
      if (b.isActive !== undefined) set.is_active = b.isActive;
      const row = await tx
        .updateTable("intake_source")
        .set(set as never)
        .where("id", "=", req.params.id)
        .returningAll()
        .executeTakeFirst();
      if (!row) throw notFound("Lead source");
      await audit(tx, auth, {
        action: "source.update",
        entity: "intake_source",
        entityId: row.id,
        diff: b,
        ip: req.ip,
      });
      return toWire(row as Row, app.config.publicBaseUrl);
    },
  );

  app.post(
    "/api/settings/sources/:id/rotate-token",
    {
      preHandler: admins,
      schema: {
        tags: tag,
        summary: "Issue a new token (the old one stops working immediately)",
        params: idParam,
        response: { 200: rotateTokenResponse, 404: apiError },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      const token = generateSourceToken();
      const row = await tx
        .updateTable("intake_source")
        .set({ secret_token_hash: hashToken(token) })
        .where("id", "=", req.params.id)
        .returning("id")
        .executeTakeFirst();
      if (!row) throw notFound("Lead source");
      await audit(tx, auth, {
        action: "source.rotate_token",
        entity: "intake_source",
        entityId: row.id,
        ip: req.ip,
      });
      return { token };
    },
  );

  app.post(
    "/api/settings/sources/:id/test-mapping",
    {
      preHandler: admins,
      schema: {
        tags: tag,
        summary: "Dry-run a sample payload through the mapping (writes nothing)",
        params: idParam,
        body: testMappingBody,
        response: { 200: testMappingResponse, 404: apiError },
      },
    },
    async (req) => {
      const { tx } = tenantCtx(req);
      const row = await tx
        .selectFrom("intake_source")
        .select("field_mapping")
        .where("id", "=", req.params.id)
        .executeTakeFirst();
      if (!row) throw notFound("Lead source");
      const mapping = req.body.fieldMapping ?? parseStoredMapping(row.field_mapping);
      const r = applyMapping(req.body.payload, mapping);
      return {
        ok: r.ok,
        mapped: r.mapped
          ? {
              fullName: r.mapped.fullName,
              phone: r.mapped.phone,
              email: r.mapped.email,
              city: r.mapped.city,
              state: r.mapped.state,
              language: r.mapped.language,
              program: r.mapped.program,
              externalId: r.mapped.externalId,
              consent: r.mapped.consent,
            }
          : null,
        errors: r.errors,
        warnings: r.warnings,
      };
    },
  );
};
