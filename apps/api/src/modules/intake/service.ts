import { sql } from "kysely";
import {
  fieldMapping as fieldMappingSchema,
  type FieldMapping,
  type IntakeResponse,
} from "@vernacular/contracts";
import { withTenant, type Db, type Tx } from "@vernacular/db";
import { AppError, validation } from "../../errors.js";
import type { JobQueue } from "../../jobs/queue.js";
import { dialJob } from "../calls/dial.js";
import { applyMapping, type MappedLead } from "./mapping.js";

export interface IntakeSource {
  id: string;
  tenantId: string;
  fieldMapping: unknown;
  defaultProgramId: string | null;
  defaultAgentId: string | null;
  autoDial: boolean;
}

export interface IntakeEvidence {
  ip: string | null;
  userAgent: string | null;
  receivedAt: Date;
}

/** Stored mapping JSON is untrusted history (edited over time): anything that no longer validates falls back to {}. */
export function parseStoredMapping(raw: unknown): FieldMapping {
  const r = fieldMappingSchema.safeParse(raw);
  return r.success ? r.data : {};
}

async function ensureConsent(
  tx: Tx,
  tenantId: string,
  personId: string,
  channel: "voice" | "whatsapp",
  granted: boolean,
  sourceName: string,
  evidence: IntakeEvidence & { sourceId: string },
) {
  const latest = await tx
    .selectFrom("consent_record")
    .select("granted")
    .where("person_id", "=", personId)
    .where("channel", "=", channel)
    .where("purpose", "=", "admission")
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  if (latest?.granted === granted) return; // already on record: don't spam the append-only log with duplicates
  await tx
    .insertInto("consent_record")
    .values({
      tenant_id: tenantId,
      person_id: personId,
      channel,
      purpose: "admission",
      granted,
      source: `form:${sourceName}`,
      evidence: JSON.stringify({
        sourceId: evidence.sourceId,
        sourceName,
        ip: evidence.ip,
        userAgent: evidence.userAgent,
        receivedAt: evidence.receivedAt.toISOString(),
      }),
    })
    .execute();
}

/** Creates (or finds) the person, creates the lead for the current cycle, records consent, queues the AI call. */
export async function ingestLead(
  deps: { db: Db; jobs: JobQueue },
  source: IntakeSource,
  payload: Record<string, unknown>,
  evidence: IntakeEvidence,
): Promise<IntakeResponse> {
  const mapping = parseStoredMapping(source.fieldMapping);
  const result = applyMapping(payload, mapping);
  if (!result.ok || !result.mapped) {
    throw validation("Lead could not be accepted", result.errors);
  }
  const m: MappedLead = result.mapped;
  const warnings = [...result.warnings];
  const tenantId = source.tenantId;

  return withTenant(deps.db, tenantId, async (tx) => {
    // Serialise submissions for the same phone: 5 identical posts in 2 s => one person, one lead, one call.
    await sql`select pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${m.phone}`}, 0))`.execute(
      tx,
    );

    const src = await tx
      .selectFrom("intake_source")
      .select(["name"])
      .where("id", "=", source.id)
      .executeTakeFirstOrThrow();

    // ---- person (dedupe on the normalised phone) ---------------------------------------------------
    const existing = await tx
      .selectFrom("person_identifier")
      .select("person_id")
      .where("kind", "=", "phone")
      .where("value_norm", "=", m.phone!)
      .executeTakeFirst();
    let personId = existing?.person_id;
    if (!personId) {
      const p = await tx
        .insertInto("person")
        .values({
          tenant_id: tenantId,
          full_name: m.fullName,
          city: m.city,
          state: m.state,
          preferred_language: m.language,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      personId = p.id;
      await tx
        .insertInto("person_identifier")
        .values({
          tenant_id: tenantId,
          person_id: personId,
          kind: "phone",
          value_raw: m.phone!,
          value_norm: m.phone!,
          is_primary: true,
        })
        .onConflict((oc) => oc.columns(["tenant_id", "kind", "value_norm"]).doNothing())
        .execute();
    } else {
      // returning student: fill gaps only, never overwrite what we already know
      await sql`update person set
          full_name = coalesce(full_name, ${m.fullName}),
          city = coalesce(city, ${m.city}),
          state = coalesce(state, ${m.state}),
          preferred_language = coalesce(preferred_language, ${m.language})
        where id = ${personId}`.execute(tx);
    }

    // ---- secondary identifiers (an identifier that already belongs to someone else => review candidate) --------
    const secondary: ["email" | "external_id", string, string][] = [];
    if (m.email) secondary.push(["email", m.email, m.email]);
    if (m.externalId) secondary.push(["external_id", `${source.id}:${m.externalId}`, m.externalId]);
    for (const [kind, norm, raw] of secondary) {
      const owner = await tx
        .selectFrom("person_identifier")
        .select("person_id")
        .where("kind", "=", kind)
        .where("value_norm", "=", norm)
        .executeTakeFirst();
      if (!owner) {
        await tx
          .insertInto("person_identifier")
          .values({
            tenant_id: tenantId,
            person_id: personId,
            kind,
            value_raw: raw,
            value_norm: norm,
          })
          .onConflict((oc) => oc.columns(["tenant_id", "kind", "value_norm"]).doNothing())
          .execute();
      } else if (owner.person_id !== personId) {
        const [a, b] = [personId, owner.person_id].sort() as [string, string];
        await tx
          .insertInto("duplicate_candidate")
          .values({ tenant_id: tenantId, person_a: a, person_b: b, reason: `same_${kind}` })
          .onConflict((oc) => oc.columns(["tenant_id", "person_a", "person_b"]).doNothing())
          .execute();
      }
    }

    // ---- program / cycle -------------------------------------------------------------------------------
    let programId = source.defaultProgramId;
    if (m.program) {
      const prog = await tx
        .selectFrom("program")
        .select("id")
        .where(sql<boolean>`lower(name) = lower(${m.program})`)
        .where("is_active", "=", true)
        .executeTakeFirst();
      if (prog) programId = prog.id;
      else warnings.push("PROGRAM_NOT_FOUND");
    }
    const cycle = await tx
      .selectFrom("admission_cycle")
      .select("id")
      .where("is_current", "=", true)
      .executeTakeFirst();
    if (!cycle)
      throw new AppError(
        409,
        "NO_ACTIVE_CYCLE",
        "This institution has no current admission cycle configured",
      );

    // ---- lead (one per person per cycle) ---------------------------------------------------------------
    const inserted = await tx
      .insertInto("lead")
      .values({
        tenant_id: tenantId,
        person_id: personId,
        cycle_id: cycle.id,
        source_id: source.id,
        program_id: programId,
        ai_agent_id: source.defaultAgentId,
        stage: "new",
      })
      .onConflict((oc) => oc.columns(["tenant_id", "person_id", "cycle_id"]).doNothing())
      .returning("id")
      .executeTakeFirst();
    const isNew = Boolean(inserted);
    const leadId =
      inserted?.id ??
      (
        await tx
          .selectFrom("lead")
          .select("id")
          .where("person_id", "=", personId)
          .where("cycle_id", "=", cycle.id)
          .executeTakeFirstOrThrow()
      ).id;

    if (isNew) {
      await tx
        .insertInto("lead_stage_history")
        .values({
          tenant_id: tenantId,
          lead_id: leadId,
          from_stage: null,
          to_stage: "new",
          actor: "integration",
          reason: `source: ${src.name}`,
        })
        .execute();
    }

    // ---- consent, with the evidence we hold ------------------------------------------------------------
    for (const channel of m.consentChannels) {
      await ensureConsent(tx, tenantId, personId, channel, m.consent, src.name, {
        ...evidence,
        sourceId: source.id,
      });
    }

    // ---- speed-to-lead: queue the call in THE SAME transaction (commit => job exists, rollback => it never does) ----
    let queued = false;
    if (isNew && source.autoDial) {
      await deps.jobs.enqueueInTx(tx, dialJob, { tenantId, leadId, trigger: "intake" });
      queued = true;
    }

    return { status: "accepted" as const, reference: leadId, duplicate: !isNew, queued, warnings };
  });
}
