import type { Tx } from "@vernacular/db";
import { notFound } from "../../errors.js";

/**
 * What the voice agent knows at turn 0 (handbook flow B). Snake_case on purpose: these keys become
 * {{initial_context.lead_id}}, {{initial_context.person_name}} ... inside the agent workflow.
 * The SAME shape is returned by the inbound pre-call webhook (D3-I3-05), so outbound and inbound greet identically.
 * Contains no phone number or email.
 */
export interface InitialContext {
  lead_id: string;
  person_name: string | null;
  program: string | null;
  language: string;
  stage: string;
  last_call_summary: string | null;
  ai_disclosure: string | null;
  is_new_caller: boolean;
  /** Set for outbound dials so webhooks can link a provider run back to our reserved attempt. */
  call_attempt_id?: string;
}

export async function buildInitialContext(
  tx: Tx,
  leadId: string,
  extra: { isNewCaller?: boolean } = {},
): Promise<InitialContext> {
  const row = await tx
    .selectFrom("lead as l")
    .innerJoin("person as p", "p.id", "l.person_id")
    .leftJoin("program as pr", "pr.id", "l.program_id")
    .leftJoin("ai_agent as a", "a.id", "l.ai_agent_id")
    .select([
      "l.id as lead_id",
      "l.stage as stage",
      "p.full_name as name",
      "p.preferred_language as lang",
      "pr.name as program",
      "a.language as agent_lang",
    ])
    .where("l.id", "=", leadId)
    .executeTakeFirst();
  if (!row) throw notFound("Lead");

  const last = await tx
    .selectFrom("analysis as an")
    .innerJoin("call_attempt as c", "c.id", "an.call_attempt_id")
    .select("an.summary")
    .where("c.lead_id", "=", leadId)
    .orderBy("c.created_at", "desc")
    .executeTakeFirst();
  const policy = await tx
    .selectFrom("tenant_policy")
    .select("ai_disclosure_text")
    .executeTakeFirst();

  return {
    lead_id: row.lead_id,
    person_name: row.name,
    program: row.program,
    language: row.lang ?? row.agent_lang ?? "en",
    stage: row.stage,
    last_call_summary: last?.summary ?? null,
    ai_disclosure: policy?.ai_disclosure_text ?? null,
    is_new_caller: extra.isNewCaller ?? false,
  };
}
