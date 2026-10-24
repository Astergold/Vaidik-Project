import { sql } from "kysely";
import type { Actor, CoreStage } from "@vernacular/contracts";
import type { Tx } from "@vernacular/db";
import { AppError, notFound } from "../../errors.js";

/** The forward pipeline. `lost` and `invalid` sit outside it (handbook §7.1). */
export const STAGE_ORDER: readonly CoreStage[] = [
  "new",
  "attempting",
  "connected",
  "interested",
  "visit_booked",
  "visited",
  "applied",
  "fee_paid",
  "enrolled",
];
const rank = (s: CoreStage) => STAGE_ORDER.indexOf(s);
/** Stages with no "next step". */
export const TERMINAL_STAGES: ReadonlySet<CoreStage> = new Set(["enrolled", "lost", "invalid"]);
/** Stages a dial must never be placed for. */
export const CLOSED_STAGES: ReadonlySet<CoreStage> = new Set(["enrolled", "lost", "invalid"]);

export interface MoveStageInput {
  leadId: string;
  to: CoreStage;
  actor: Actor;
  actorUserId?: string | null;
  reason?: string | null;
  /**
   * manual: a person moved it (any direction, caller must have collected a reason).
   * auto: integrations/system. Forward only, never out of lost/invalid, never backwards.
   */
  mode: "manual" | "auto";
}

export interface MoveStageResult {
  changed: boolean;
  from: CoreStage;
  to: CoreStage;
}

/**
 * The ONE way to change lead.stage. Locks the lead row, enforces the direction rule, writes
 * lead_stage_history, clears the sub-stage (it belongs to the old stage) and the next step for terminal stages.
 * Safe to call repeatedly: moving to the current stage (or an auto move that would go backwards) is a no-op.
 */
export async function moveStage(tx: Tx, input: MoveStageInput): Promise<MoveStageResult> {
  const lead = await tx
    .selectFrom("lead")
    .select(["stage"])
    .where("id", "=", input.leadId)
    .forUpdate()
    .executeTakeFirst();
  if (!lead) throw notFound("Lead");
  const from = lead.stage as CoreStage;
  const noop = { changed: false, from, to: from };

  if (from === input.to) return noop;
  if (input.mode === "auto") {
    if (from === "lost" || from === "invalid") return noop; // never leave a closed state automatically
    const toTerminalSidestep = input.to === "lost" || input.to === "invalid";
    if (!toTerminalSidestep && rank(input.to) <= rank(from)) return noop; // never backwards
  }

  const terminal = TERMINAL_STAGES.has(input.to);
  await tx
    .updateTable("lead")
    .set({
      stage: input.to,
      sub_stage_id: null,
      ...(terminal ? { next_step: null, next_step_due_at: null } : {}),
      ...(input.to === "lost" ? { lost_reason: input.reason ?? null } : {}),
    })
    .where("id", "=", input.leadId)
    .execute();

  const tenant = await sql<{
    t: string;
  }>`select current_setting('app.tenant_id', true) as t`.execute(tx);
  await tx
    .insertInto("lead_stage_history")
    .values({
      tenant_id: tenant.rows[0]!.t,
      lead_id: input.leadId,
      from_stage: from,
      to_stage: input.to,
      reason: input.reason ?? null,
      actor: input.actor,
      actor_user_id: input.actorUserId ?? null,
    })
    .execute();
  return { changed: true, from, to: input.to };
}

export function assertReasonForManualMove(reason: string | undefined | null) {
  if (!reason || reason.trim().length < 3) {
    throw new AppError(
      422,
      "REASON_REQUIRED",
      "Changing the stage needs a reason (it appears on the timeline)",
    );
  }
}
