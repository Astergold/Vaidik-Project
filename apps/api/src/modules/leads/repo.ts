import { sql, type ExpressionBuilder, type SelectQueryBuilder } from "kysely";
import type { DB, Tx } from "@vernacular/db";
import type { LeadsListQuery } from "@vernacular/contracts";

type Q = SelectQueryBuilder<DB & { l: DB["lead"]; p: DB["person"] }, "l" | "p", object>;

export interface LeadFilter extends Omit<LeadsListQuery, "page" | "pageSize" | "sort" | "order"> {
  /** When set, only leads assigned to this user or to an AI agent allocated to them. */
  scopeToUser: string | null;
}

const arr = <T>(v: T | T[] | undefined): T[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v : [v];

/** LIKE-escape so user input can't act as a wildcard. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function applyFilters(q: Q, f: LeadFilter): Q {
  const stage = arr(f.stage);
  if (stage) q = q.where("l.stage", "in", stage);
  const temp = arr(f.temperature);
  if (temp) q = q.where("l.current_temperature", "in", temp);
  const src = arr(f.sourceId);
  if (src) q = q.where("l.source_id", "in", src);
  const agent = arr(f.agentId);
  if (agent) q = q.where("l.ai_agent_id", "in", agent);
  const owner = arr(f.counsellorId);
  if (owner) q = q.where("l.owner_counsellor_id", "in", owner);
  if (f.createdFrom) q = q.where("l.created_at", ">=", new Date(f.createdFrom));
  if (f.createdTo) {
    // a bare date means "through the end of that day"
    const to = /^\d{4}-\d{2}-\d{2}$/.test(f.createdTo)
      ? new Date(`${f.createdTo}T23:59:59.999Z`)
      : new Date(f.createdTo);
    q = q.where("l.created_at", "<=", to);
  }

  if (f.scopeToUser) {
    const uid = f.scopeToUser;
    q = q.where((eb: ExpressionBuilder<DB & { l: DB["lead"]; p: DB["person"] }, "l" | "p">) =>
      eb.or([
        eb("l.owner_counsellor_id", "=", uid),
        eb(
          "l.ai_agent_id",
          "in",
          eb.selectFrom("ai_agent_counsellor").select("ai_agent_id").where("user_id", "=", uid),
        ),
      ]),
    );
  }

  if (f.q) {
    const term = likeEscape(f.q);
    const digits = f.q.replace(/\D/g, "");
    q = q.where((eb) => {
      const ors = [eb("p.full_name", "ilike", `%${term}%`)];
      if (digits.length >= 3) {
        ors.push(
          eb.exists(
            eb
              .selectFrom("person_identifier as pi")
              .select("pi.id")
              .whereRef("pi.person_id", "=", "p.id")
              .where("pi.kind", "=", "phone")
              .where("pi.value_norm", "like", `%${digits}%`),
          ),
        );
      }
      if (f.q!.includes("@")) {
        ors.push(
          eb.exists(
            eb
              .selectFrom("person_identifier as pi")
              .select("pi.id")
              .whereRef("pi.person_id", "=", "p.id")
              .where("pi.kind", "=", "email")
              .where("pi.value_norm", "like", `%${likeEscape(f.q!.toLowerCase())}%`),
          ),
        );
      }
      return eb.or(ors);
    });
  }
  return q;
}

const SORT_SQL = {
  created_at: sql.raw("l.created_at"),
  updated_at: sql.raw("l.updated_at"),
  next_step_due_at: sql.raw("l.next_step_due_at"),
  full_name: sql.raw("lower(p.full_name)"),
} as const;

export async function countLeads(tx: Tx, f: LeadFilter): Promise<number> {
  const base = tx
    .selectFrom("lead as l")
    .innerJoin("person as p", "p.id", "l.person_id") as unknown as Q;
  const row = await applyFilters(base, f)
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

/**
 * Lead ids matching a filter, oldest first. Campaign start uses THIS (same applyFilters as GET /api/leads and the
 * create form's match count), so the preview and the dialled list can never diverge.
 */
export async function findMatchingLeadIds(tx: Tx, f: LeadFilter): Promise<string[]> {
  const base = tx
    .selectFrom("lead as l")
    .innerJoin("person as p", "p.id", "l.person_id") as unknown as Q;
  const rows = await applyFilters(base, f)
    .select("l.id as id")
    .orderBy("l.created_at", "asc")
    .orderBy("l.id", "asc")
    .execute();
  return rows.map((r) => (r as { id: string }).id);
}

export async function findLeadRows(
  tx: Tx,
  f: LeadFilter,
  opts: {
    sort: LeadsListQuery["sort"];
    order: "asc" | "desc";
    limit: number;
    offset: number;
  },
) {
  const base = tx
    .selectFrom("lead as l")
    .innerJoin("person as p", "p.id", "l.person_id") as unknown as Q;
  const dir = sql.raw(opts.order === "asc" ? "asc" : "desc"); // enum-validated upstream
  return applyFilters(base, f)
    .leftJoin("lead_sub_stage as ss", "ss.id", "l.sub_stage_id")
    .leftJoin("user as u", "u.id", "l.owner_counsellor_id")
    .leftJoin("ai_agent as a", "a.id", "l.ai_agent_id")
    .leftJoin("intake_source as s", "s.id", "l.source_id")
    .leftJoin("program as pr", "pr.id", "l.program_id")
    .select([
      "l.id as id",
      "l.stage as stage",
      "l.current_temperature as temperature",
      "l.next_step as next_step",
      "l.next_step_due_at as next_step_due_at",
      "l.last_reject_code as last_reject_code",
      "l.created_at as created_at",
      "l.updated_at as updated_at",
      "l.owner_counsellor_id as owner_id",
      "u.name as owner_name",
      "l.ai_agent_id as agent_id",
      "a.display_name as agent_name",
      "l.source_id as source_id",
      "s.name as source_name",
      "l.program_id as program_id",
      "pr.name as program_name",
      "ss.name as sub_stage",
      "p.id as person_id",
      "p.full_name as full_name",
      "p.city as city",
    ])
    .select(
      sql<string | null>`(
        select pi.value_norm from person_identifier pi
         where pi.person_id = p.id and pi.kind = 'phone'
         order by pi.is_primary desc, pi.created_at asc limit 1)`.as("phone"),
    )
    .select(
      sql<number>`(select count(*)::int from call_attempt c where c.lead_id = l.id)`.as(
        "call_count",
      ),
    )
    .select(
      sql<Date | null>`(select max(coalesce(c.started_at, c.created_at)) from call_attempt c where c.lead_id = l.id)`.as(
        "last_call_at",
      ),
    )
    .orderBy(sql`${SORT_SQL[opts.sort]} ${dir} nulls last`)
    .orderBy("l.id", "desc")
    .limit(opts.limit)
    .offset(opts.offset)
    .execute();
}

// ---- filter options (GET /api/leads/filters, D2-I4-03a) ---------------------------------------------

/** Active intake sources (RLS-scoped to the transaction's tenant). */
export function findFilterSources(tx: Tx) {
  return tx
    .selectFrom("intake_source")
    .select(["id", "name", "is_active"])
    .where("is_active", "=", true)
    .orderBy("name")
    .orderBy("id")
    .execute();
}

/** Active AI agents; `allocatedTo` limits them to one counsellor's allocations (same rule as scopeToUser). */
export function findFilterAgents(tx: Tx, allocatedTo: string | null) {
  let q = tx
    .selectFrom("ai_agent")
    .select(["id", "display_name as name", "is_active"])
    .where("is_active", "=", true);
  if (allocatedTo) {
    q = q.where("id", "in", (eb) =>
      eb.selectFrom("ai_agent_counsellor").select("ai_agent_id").where("user_id", "=", allocatedTo),
    );
  }
  return q.orderBy("display_name").orderBy("id").execute();
}

/**
 * Counsellors of the tenant. crm.member and crm."user" are Better Auth tables with NO tenant_id and
 * NO RLS — the organizationId filter below is the only tenant boundary here. Never remove it.
 */
export function findFilterCounsellors(tx: Tx, tenantId: string, onlyUser: string | null) {
  let q = tx
    .selectFrom("member as m")
    .innerJoin("user as u", "u.id", "m.userId")
    .select(["u.id", "u.name", "u.banned"])
    .where("m.organizationId", "=", tenantId)
    .where("m.role", "=", "counsellor");
  if (onlyUser) q = q.where("u.id", "=", onlyUser);
  return q.orderBy("u.name").orderBy("u.id").execute();
}
