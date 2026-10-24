import { sql } from "kysely";
import type { Tx } from "@vernacular/db";
import {
  DEFAULT_POLICY,
  addDaysToDateKey,
  evaluate,
  localParts,
  startOfLocalDay,
  type Channel,
  type PolicyDecision,
  type PolicyFacts,
  type TenantPolicy,
  type WalletState,
} from "@vernacular/policy";
import { notFound } from "../../errors.js";

/** crm.tenant_policy row (snake_case, time columns as "HH:MM:SS") -> engine shape. */
export function policyFromRow(row: {
  call_window_start: string;
  call_window_end: string;
  allowed_days: number[];
  max_attempts_per_day: number;
  max_attempts_total: number;
  min_gap_minutes: number;
  require_consent: boolean;
  ndnc_check: boolean;
  promo_requires_140: boolean;
}): TenantPolicy {
  return {
    callWindowStart: row.call_window_start.slice(0, 5),
    callWindowEnd: row.call_window_end.slice(0, 5),
    allowedDays: [...row.allowed_days].map(Number).sort((a, b) => a - b),
    maxAttemptsPerDay: row.max_attempts_per_day,
    maxAttemptsTotal: row.max_attempts_total,
    minGapMinutes: row.min_gap_minutes,
    requireConsent: row.require_consent,
    ndncCheck: row.ndnc_check,
    promoRequires140: row.promo_requires_140,
  };
}

/** The tenant's rules (RLS gives us exactly one row). Missing row = handbook defaults. */
export async function loadTenantPolicy(
  tx: Tx,
): Promise<{ policy: TenantPolicy; aiDisclosureText: string | null }> {
  const row = await tx.selectFrom("tenant_policy").selectAll().executeTakeFirst();
  if (!row) return { policy: { ...DEFAULT_POLICY }, aiDisclosureText: null };
  return { policy: policyFromRow(row as never), aiDisclosureText: row.ai_disclosure_text };
}

/**
 * SEAM for D6-I2-01 (billing ledger). Until wallets exist nothing can run out, so every tenant is "unmetered".
 * Day 6 replaces the body: prepaid tenants return { mode: "prepaid", balance } from wallet_transaction.
 */
export async function loadWalletState(_tx: Tx): Promise<WalletState> {
  return { mode: "unmetered" };
}

export interface PolicySubject {
  leadId: string;
  personId: string;
  stage: string;
  aiAgentId: string | null;
  programId: string | null;
  /** Primary phone, E.164. null if the person has none. */
  phone: string | null;
}

export interface LoadedFacts {
  facts: PolicyFacts;
  subject: PolicySubject;
  now: Date;
}

/**
 * Gathers every input the pure engine needs for one lead. Read-only. The dial job and the call-now route
 * both go through this, so "can I call?" always means the same thing.
 * `ignoreAttemptId`: a reservation that belongs to the caller (resume after a crash) must not count as
 * "a call is already in progress".
 */
export async function loadPolicyFacts(
  tx: Tx,
  leadId: string,
  now: Date,
  opts: { channel?: Channel; ignoreAttemptId?: string | null } = {},
): Promise<LoadedFacts> {
  const channel: Channel = opts.channel ?? "voice";

  const lead = await tx
    .selectFrom("lead")
    .select(["id", "person_id", "stage", "ai_agent_id", "program_id"])
    .where("id", "=", leadId)
    .executeTakeFirst();
  if (!lead) throw notFound("Lead");

  const tenant = await tx
    .selectFrom("tenant")
    .select(["status", "timezone"])
    .executeTakeFirstOrThrow();
  const { policy } = await loadTenantPolicy(tx);
  const wallet = await loadWalletState(tx);

  const person = await tx
    .selectFrom("person")
    .select("ndnc_status")
    .where("id", "=", lead.person_id)
    .executeTakeFirstOrThrow();
  const phoneRow = await tx
    .selectFrom("person_identifier")
    .select("value_norm")
    .where("person_id", "=", lead.person_id)
    .where("kind", "=", "phone")
    .orderBy("is_primary", "desc")
    .orderBy("created_at", "asc")
    .executeTakeFirst();
  const phone = phoneRow?.value_norm ?? null;

  // suppression (opt-out / DND / invalid). 'ndnc' rows are NDNC status, handled by rule 4, not rule 3.
  let suppressed = false;
  let ndncListed = person.ndnc_status === "listed";
  if (phone) {
    const rows = await tx
      .selectFrom("suppression")
      .select("reason")
      .where("kind", "=", "phone")
      .where("value_norm", "=", phone)
      .where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", now)]))
      .execute();
    suppressed = rows.some((r) => r.reason !== "ndnc");
    ndncListed = ndncListed || rows.some((r) => r.reason === "ndnc");
  }
  const ndnc = ndncListed ? "listed" : person.ndnc_status === "clear" ? "clear" : "unknown";

  const consentRow = await tx
    .selectFrom("consent_record")
    .select("granted")
    .where("person_id", "=", lead.person_id)
    .where("channel", "=", channel)
    .where("purpose", "=", "admission")
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  const consent = consentRow ? (consentRow.granted ? "granted" : "revoked") : "none";

  // holidays from yesterday on (local dates), enough for the engine's look-ahead
  const today = localParts(now, tenant.timezone).dateKey;
  const hol = await sql<{ d: string }>`
    select to_char(on_date, 'YYYY-MM-DD') as d from tenant_holiday
     where on_date >= ${addDaysToDateKey(today, -1)}::date order by on_date limit 800`.execute(tx);

  const dayStart = startOfLocalDay(now, tenant.timezone);
  const agg = await sql<{ today: number; total: number; last_at: Date | null; active: boolean }>`
    select count(*) filter (where status <> 'reserved' and coalesce(started_at, created_at) >= ${dayStart})::int as today,
           count(*) filter (where status <> 'reserved')::int as total,
           max(coalesce(started_at, created_at)) filter (where status <> 'reserved') as last_at,
           coalesce(bool_or(status in ('reserved', 'dialing', 'in_progress')
                            and (${opts.ignoreAttemptId ?? null}::uuid is null or id <> ${opts.ignoreAttemptId ?? null}::uuid)), false) as active
      from call_attempt where lead_id = ${leadId}`.execute(tx);
  const a = agg.rows[0]!;

  return {
    now,
    subject: {
      leadId: lead.id,
      personId: lead.person_id,
      stage: lead.stage,
      aiAgentId: lead.ai_agent_id,
      programId: lead.program_id,
      phone,
    },
    facts: {
      tenant: { status: tenant.status, timezone: tenant.timezone },
      policy,
      wallet,
      suppressed,
      ndnc,
      consent,
      holidays: hol.rows.map((r) => r.d),
      attempts: { today: a.today, total: a.total, lastAttemptAt: a.last_at },
      activeCall: a.active,
      // Admission outreach is promotional. No caller-id classification exists yet (legal open item #1):
      // with promo_requires_140 = false (default) this has no effect.
      promotional: true,
      callerId140: false,
    },
  };
}

/** Would a call to this lead be allowed right now? (call-now route, planner proposals, campaigns). */
export async function previewDial(tx: Tx, leadId: string, now: Date): Promise<PolicyDecision> {
  const { facts } = await loadPolicyFacts(tx, leadId, now);
  return evaluate("dial", facts, now);
}
