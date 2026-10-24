import { sql } from "kysely";
import type { LeadDetail, TimelineEvent, TimelineResponse } from "@vernacular/contracts";
import type { Tx } from "@vernacular/db";
import { notFound, validation } from "../../errors.js";
import { assertLeadAccess, maskIdentifier } from "../../guards.js";
import type { AuthContext } from "../../types.js";

export async function getLeadDetail(
  tx: Tx,
  auth: AuthContext,
  leadId: string,
): Promise<LeadDetail> {
  await assertLeadAccess(tx, auth, leadId);

  const r = await tx
    .selectFrom("lead as l")
    .innerJoin("person as p", "p.id", "l.person_id")
    .innerJoin("admission_cycle as c", "c.id", "l.cycle_id")
    .leftJoin("lead_sub_stage as ss", "ss.id", "l.sub_stage_id")
    .leftJoin("user as u", "u.id", "l.owner_counsellor_id")
    .leftJoin("ai_agent as a", "a.id", "l.ai_agent_id")
    .leftJoin("intake_source as s", "s.id", "l.source_id")
    .leftJoin("program as pr", "pr.id", "l.program_id")
    .select([
      "l.id",
      "l.stage",
      "l.current_temperature",
      "l.next_step",
      "l.next_step_due_at",
      "l.last_reject_code",
      "l.last_reject_at",
      "l.lost_reason",
      "l.created_at",
      "l.updated_at",
      "l.owner_counsellor_id",
      "l.ai_agent_id",
      "l.source_id",
      "l.program_id",
      "ss.id as sub_id",
      "ss.name as sub_name",
      "u.name as owner_name",
      "a.display_name as agent_name",
      "s.name as source_name",
      "pr.name as program_name",
      "c.id as cycle_id",
      "c.name as cycle_name",
      "p.id as person_id",
      "p.full_name",
      "p.preferred_language",
      "p.city",
      "p.state",
      "p.ndnc_status",
    ])
    .select(
      sql<number>`(select count(*)::int from call_attempt x where x.lead_id = l.id)`.as(
        "call_count",
      ),
    )
    .where("l.id", "=", leadId)
    .executeTakeFirst();
  if (!r) throw notFound("Lead");

  const ids = await tx
    .selectFrom("person_identifier")
    .select(["id", "kind", "value_norm", "is_primary"])
    .where("person_id", "=", r.person_id)
    .orderBy("kind")
    .orderBy("is_primary", "desc")
    .orderBy("created_at")
    .execute();

  return {
    id: r.id,
    stage: r.stage as LeadDetail["stage"],
    subStage: r.sub_id ? { id: r.sub_id, name: r.sub_name ?? "" } : null,
    temperature: r.current_temperature as LeadDetail["temperature"],
    nextStep: r.next_step as LeadDetail["nextStep"],
    nextStepDueAt: r.next_step_due_at?.toISOString() ?? null,
    owner: r.owner_counsellor_id ? { id: r.owner_counsellor_id, name: r.owner_name ?? "" } : null,
    aiAgent: r.ai_agent_id ? { id: r.ai_agent_id, displayName: r.agent_name ?? "" } : null,
    source: r.source_id ? { id: r.source_id, name: r.source_name ?? "" } : null,
    program: r.program_id ? { id: r.program_id, name: r.program_name ?? "" } : null,
    cycle: { id: r.cycle_id, name: r.cycle_name },
    person: {
      id: r.person_id,
      fullName: r.full_name,
      preferredLanguage: r.preferred_language,
      city: r.city,
      state: r.state,
      ndncStatus: r.ndnc_status as "clear" | "listed" | "unknown",
      identifiers: ids.map((i) => ({
        id: i.id,
        kind: i.kind as never,
        value: maskIdentifier(i.kind, i.value_norm, auth),
        isPrimary: i.is_primary,
      })),
    },
    lastRejectCode: r.last_reject_code,
    lastRejectAt: r.last_reject_at?.toISOString() ?? null,
    lostReason: r.lost_reason,
    callCount: r.call_count,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

// ---- timeline -----------------------------------------------------------------------------------------

const encodeCursor = (at: string, id: string) =>
  Buffer.from(JSON.stringify({ at, id })).toString("base64url");
function decodeCursor(c: string): { at: string; id: string } {
  try {
    const v = JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as {
      at?: unknown;
      id?: unknown;
    };
    if (typeof v.at === "string" && typeof v.id === "string" && !Number.isNaN(Date.parse(v.at)))
      return { at: v.at, id: v.id };
  } catch {
    /* fall through */
  }
  throw validation("Invalid cursor", [
    { path: "cursor", message: "Pass back nextCursor exactly as returned" },
  ]);
}

/**
 * One merged, newest-first feed. Keyset pagination on (time, id) using the database's full microsecond
 * timestamps, so pages never skip or repeat rows even when several events share a millisecond.
 */
export async function getTimeline(
  tx: Tx,
  auth: AuthContext,
  leadId: string,
  q: { limit: number; cursor?: string },
): Promise<TimelineResponse> {
  await assertLeadAccess(tx, auth, leadId);
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;

  const rows = await sql<{
    id: string;
    type: string;
    at: Date;
    at_text: string;
    data: Record<string, unknown>;
  }>`
    select t.id, t.type, t.at, data,
           to_char(t.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at_text
      from (
        select 'call:' || c.id::text as id, 'call' as type, coalesce(c.started_at, c.created_at) as at,
               jsonb_build_object('callId', c.id, 'direction', c.direction, 'status', c.status, 'durationS', c.duration_s,
                                  'disposition', c.disposition, 'hasRecording', c.recording_key is not null,
                                  'hasTranscript', c.transcript_text is not null, 'agentName', a.display_name) as data
          from call_attempt c left join ai_agent a on a.id = c.ai_agent_id
         where c.lead_id = ${leadId}
        union all
        select 'stage:' || h.id::text, 'stage_change', h.created_at,
               jsonb_build_object('from', h.from_stage, 'to', h.to_stage, 'reason', h.reason, 'actor', h.actor, 'actorName', u.name)
          from lead_stage_history h left join "user" u on u.id = h.actor_user_id
         where h.lead_id = ${leadId}
        union all
        select 'note:' || n.id::text, 'note', n.created_at,
               jsonb_build_object('body', n.body, 'kind', n.kind, 'authorName', u.name)
          from lead_note n left join "user" u on u.id = n.author_id
         where n.lead_id = ${leadId}
        union all
        select 'temp:' || o.id::text, 'temperature', o.observed_at,
               jsonb_build_object('value', o.value, 'source', o.source, 'quote', o.verbatim_quote, 'reason', o.reason,
                                  'observerName', u.name, 'callId', o.call_attempt_id)
          from lead_temperature_observation o left join "user" u on u.id = o.observer_user_id
         where o.lead_id = ${leadId}
      ) t
     where ${cursor ? sql`(t.at, t.id) < (${cursor.at}::timestamptz, ${cursor.id})` : sql`true`}
     order by t.at desc, t.id desc
     limit ${q.limit + 1}`.execute(tx);

  const page = rows.rows.slice(0, q.limit);
  const more = rows.rows.length > q.limit;
  const last = page[page.length - 1];
  return {
    items: page.map(
      (r) =>
        ({
          id: r.id,
          type: r.type,
          at: new Date(r.at).toISOString(),
          data: r.data,
        }) as TimelineEvent,
    ),
    nextCursor: more && last ? encodeCursor(last.at_text, last.id) : null,
  };
}
