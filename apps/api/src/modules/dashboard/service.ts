import { sql, type RawBuilder } from "kysely";
import {
  dashboardResponse,
  type DashboardQuery,
  type DashboardResponse,
} from "@vernacular/contracts";
import type { Tx } from "@vernacular/db";
import { addDaysToDateKey, localParts, startOfLocalDay, zonedTimeToUtc } from "@vernacular/policy";
import { validation } from "../../errors.js";
import { STAGE_ORDER } from "../leads/stage.js";

const FUNNEL_STAGES = [...STAGE_ORDER, "lost", "invalid"] as const;
const MAX_RANGE_DAYS = 366;

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const round1 = (v: unknown) =>
  v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10;

/**
 * Exact SQL aggregates (no sampling). Dates are LOCAL dates in the tenant timezone; "connected" means a
 * completed call with at least 15 s of talk time (the same rule that moves a lead to `connected`).
 */
export async function getDashboard(
  tx: Tx,
  q: DashboardQuery,
  now = new Date(),
): Promise<DashboardResponse> {
  const { timezone } = await tx.selectFrom("tenant").select("timezone").executeTakeFirstOrThrow();

  const to = q.to ?? localParts(now, timezone).dateKey;
  const from = q.from ?? addDaysToDateKey(to, -29);
  if (from > to)
    throw validation("Invalid date range", [
      { path: "from", message: "from must be on or before to" },
    ]);
  if (dayDiff(from, to) >= MAX_RANGE_DAYS)
    throw validation("Date range too large", [
      { path: "to", message: `At most ${MAX_RANGE_DAYS} days` },
    ]);

  const at = (key: string) => {
    const [y, m, d] = key.split("-").map(Number) as [number, number, number];
    return zonedTimeToUtc(y, m, d, 0, 0, timezone);
  };
  const start = at(from);
  const end = at(addDaysToDateKey(to, 1)); // exclusive
  const dayStart = startOfLocalDay(now, timezone);

  const leadFilters: RawBuilder<unknown> = sql`${q.agentId ? sql`and l.ai_agent_id = ${q.agentId}` : sql``} ${q.sourceId ? sql`and l.source_id = ${q.sourceId}` : sql``}`;
  const callFilters: RawBuilder<unknown> = sql`${q.agentId ? sql`and c.ai_agent_id = ${q.agentId}` : sql``} ${q.sourceId ? sql`and l.source_id = ${q.sourceId}` : sql``}`;
  const PLACED = sql`c.status not in ('reserved', 'dialing')`;
  const CONNECTED = sql`(c.status = 'completed' and c.duration_s >= 15)`;
  const callTime = sql`coalesce(c.started_at, c.created_at)`;

  const [funnel, temp, bySource, callsRange, callsToday, agentLeads, agentCalls] =
    await Promise.all([
      sql<{ stage: string; n: number }>`select l.stage, count(*)::int as n from lead l
        where l.created_at >= ${start} and l.created_at < ${end} ${leadFilters} group by l.stage`.execute(
        tx,
      ),
      sql<{
        v: string;
        n: number;
      }>`select coalesce(l.current_temperature, 'unrated') as v, count(*)::int as n from lead l
        where l.created_at >= ${start} and l.created_at < ${end} ${leadFilters} group by 1`.execute(
        tx,
      ),
      sql<{ id: string | null; name: string; leads: number; hot: number; applied: number }>`
        select s.id, coalesce(s.name, 'Unknown') as name, count(*)::int as leads,
               count(*) filter (where l.current_temperature = 'hot')::int as hot,
               count(*) filter (where l.stage in ('applied', 'fee_paid', 'enrolled'))::int as applied
          from lead l left join intake_source s on s.id = l.source_id
         where l.created_at >= ${start} and l.created_at < ${end} ${leadFilters}
         group by s.id, s.name order by leads desc, name`.execute(tx),
      sql<{ placed: number; connected: number; avg: string | null }>`
        select count(*) filter (where ${PLACED})::int as placed,
               count(*) filter (where ${CONNECTED})::int as connected,
               avg(c.duration_s) filter (where ${CONNECTED}) as avg
          from call_attempt c join lead l on l.id = c.lead_id
         where ${callTime} >= ${start} and ${callTime} < ${end} ${callFilters}`.execute(tx),
      sql<{ n: number }>`select count(*) filter (where ${PLACED})::int as n
          from call_attempt c join lead l on l.id = c.lead_id
         where ${callTime} >= ${dayStart} ${callFilters}`.execute(tx),
      sql<{
        id: string | null;
        n: number;
      }>`select l.ai_agent_id as id, count(*)::int as n from lead l
        where l.created_at >= ${start} and l.created_at < ${end} ${leadFilters} group by 1`.execute(
        tx,
      ),
      sql<{ id: string | null; calls: number; connected: number; avg: string | null }>`
        select c.ai_agent_id as id, count(*) filter (where ${PLACED})::int as calls,
               count(*) filter (where ${CONNECTED})::int as connected,
               avg(c.duration_s) filter (where ${CONNECTED}) as avg
          from call_attempt c join lead l on l.id = c.lead_id
         where ${callTime} >= ${start} and ${callTime} < ${end} ${callFilters} group by 1`.execute(
        tx,
      ),
    ]);

  const stageCount = new Map(funnel.rows.map((r) => [r.stage, r.n]));
  const funnelOut = FUNNEL_STAGES.map((stage) => ({ stage, count: stageCount.get(stage) ?? 0 }));

  const names = new Map(
    (await tx.selectFrom("ai_agent").select(["id", "display_name"]).execute()).map((a) => [
      a.id,
      a.display_name,
    ]),
  );
  const agentIds = new Set<string | null>([
    ...agentLeads.rows.map((r) => r.id),
    ...agentCalls.rows.map((r) => r.id),
  ]);
  const byAgent = [...agentIds]
    .map((id) => {
      const l = agentLeads.rows.find((r) => r.id === id);
      const c = agentCalls.rows.find((r) => r.id === id);
      return {
        agentId: id,
        name: id ? (names.get(id) ?? "Unknown agent") : "Unassigned",
        leads: l?.n ?? 0,
        calls: c?.calls ?? 0,
        connected: c?.connected ?? 0,
        avgDurationS: round1(c?.avg),
      };
    })
    .sort((a, b) => b.calls - a.calls || b.leads - a.leads);

  const cr = callsRange.rows[0]!;
  return dashboardResponse.parse({
    range: { from, to, timezone },
    totals: { leads: funnelOut.reduce((s, f) => s + f.count, 0) },
    funnel: funnelOut,
    temperature: temp.rows.map((r) => ({ value: r.v, count: r.n })),
    calls: {
      today: callsToday.rows[0]!.n,
      inRange: cr.placed,
      connected: cr.connected,
      connectRate: cr.placed > 0 ? Math.round((cr.connected / cr.placed) * 1000) / 1000 : null,
      avgDurationS: round1(cr.avg),
    },
    bySource: bySource.rows.map((r) => ({
      sourceId: r.id,
      name: r.name,
      leads: r.leads,
      hot: r.hot,
      applied: r.applied,
    })),
    byAgent,
    generatedAt: now.toISOString(),
  });
}
