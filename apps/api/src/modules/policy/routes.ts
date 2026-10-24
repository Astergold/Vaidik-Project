import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { sql } from "kysely";
import { z } from "zod";
import {
  apiError,
  createHolidayBody,
  holiday,
  holidaysResponse,
  policySettings,
  policySettingsBody,
} from "@vernacular/contracts";
import type { Tx } from "@vernacular/db";
import { tenantCtx } from "../../context.js";
import { notFound } from "../../errors.js";
import { requireRole } from "../../guards.js";
import { audit } from "../../lib/audit.js";
import { loadTenantPolicy } from "./facts.js";

const viewers = requireRole("owner", "admin", "admission_head");
const admins = requireRole("owner", "admin");

async function readPolicy(tx: Tx) {
  const { policy, aiDisclosureText } = await loadTenantPolicy(tx);
  return { ...policy, aiDisclosureText };
}

export const policyRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ["settings"];

  app.get(
    "/api/settings/policy",
    {
      preHandler: viewers,
      schema: { tags, summary: "Calling policy", response: { 200: policySettings } },
    },
    async (req) => {
      return readPolicy(tenantCtx(req).tx);
    },
  );

  app.put(
    "/api/settings/policy",
    {
      preHandler: admins,
      schema: {
        tags,
        summary: "Replace the calling policy (takes effect on the next dial)",
        body: policySettingsBody,
        response: { 200: policySettings, 422: apiError },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      const b = req.body;
      const before = await readPolicy(tx);
      const values = {
        call_window_start: b.callWindowStart,
        call_window_end: b.callWindowEnd,
        allowed_days: sql`${`{${[...b.allowedDays].sort((x, y) => x - y).join(",")}}`}::smallint[]`,
        max_attempts_per_day: b.maxAttemptsPerDay,
        max_attempts_total: b.maxAttemptsTotal,
        min_gap_minutes: b.minGapMinutes,
        require_consent: b.requireConsent,
        ndnc_check: b.ndncCheck,
        promo_requires_140: b.promoRequires140,
        ai_disclosure_text: b.aiDisclosureText,
      };
      await tx
        .insertInto("tenant_policy")
        .values({ tenant_id: auth.tenantId, ...values } as never)
        .onConflict((oc) => oc.column("tenant_id").doUpdateSet(values as never))
        .execute();
      const after = await readPolicy(tx);
      await audit(tx, auth, {
        action: "policy.update",
        entity: "tenant_policy",
        entityId: auth.tenantId,
        diff: { before, after },
        ip: req.ip,
      });
      return after;
    },
  );

  const holidayRow = (r: { id: string; d: string; name: string }) => ({
    id: r.id,
    date: r.d,
    name: r.name,
  });

  app.get(
    "/api/settings/holidays",
    {
      preHandler: viewers,
      schema: { tags, summary: "Calling holidays", response: { 200: holidaysResponse } },
    },
    async (req) => {
      const { tx } = tenantCtx(req);
      const rows = await sql<{ id: string; d: string; name: string }>`
      select id, to_char(on_date, 'YYYY-MM-DD') as d, name from tenant_holiday order by on_date`.execute(
        tx,
      );
      return { items: rows.rows.map(holidayRow) };
    },
  );

  app.post(
    "/api/settings/holidays",
    {
      preHandler: admins,
      schema: {
        tags,
        summary: "Add (or rename) a holiday",
        body: createHolidayBody,
        response: { 201: holiday },
      },
    },
    async (req, reply) => {
      const { tx, auth } = tenantCtx(req);
      const r = await sql<{ id: string; d: string; name: string }>`
        insert into tenant_holiday (tenant_id, on_date, name) values (${auth.tenantId}, ${req.body.date}::date, ${req.body.name})
        on conflict (tenant_id, on_date) do update set name = excluded.name
        returning id, to_char(on_date, 'YYYY-MM-DD') as d, name`.execute(tx);
      await audit(tx, auth, {
        action: "holiday.upsert",
        entity: "tenant_holiday",
        entityId: r.rows[0]!.id,
        diff: req.body,
        ip: req.ip,
      });
      return reply.status(201).send(holidayRow(r.rows[0]!));
    },
  );

  app.delete(
    "/api/settings/holidays/:id",
    {
      preHandler: admins,
      schema: {
        tags,
        summary: "Remove a holiday",
        params: z.object({ id: z.uuid() }),
        response: { 204: z.null(), 404: apiError },
      },
    },
    async (req, reply) => {
      const { tx, auth } = tenantCtx(req);
      const r = await tx
        .deleteFrom("tenant_holiday")
        .where("id", "=", req.params.id)
        .returning("id")
        .executeTakeFirst();
      if (!r) throw notFound("Holiday");
      await audit(tx, auth, {
        action: "holiday.delete",
        entity: "tenant_holiday",
        entityId: r.id,
        ip: req.ip,
      });
      return reply.status(204).send(null);
    },
  );
};
