import type { CallNowResponse, PatchLeadBody } from "@vernacular/contracts";
import type { Tx } from "@vernacular/db";
import { AppError, forbidden, validation } from "../../errors.js";
import { assertLeadAccess, hasFullLeadAccess } from "../../guards.js";
import { audit } from "../../lib/audit.js";
import type { JobQueue } from "../../jobs/queue.js";
import type { AuthContext } from "../../types.js";
import { dialJob } from "../calls/dial.js";
import { previewDial } from "../policy/facts.js";
import { assertReasonForManualMove, CLOSED_STAGES, moveStage, TERMINAL_STAGES } from "./stage.js";
import type { CoreStage } from "@vernacular/contracts";

/**
 * PATCH /api/leads/:id. Rules (handbook §7.1/7.2):
 *  - changing the stage needs a reason, is allowed in any direction for users, and writes lead_stage_history
 *  - changing the owner is for owner/admin/head only, and the new owner must be a member of this tenant
 *  - a non-terminal lead must keep a next step: moving stage (or clearing the step) without one is rejected
 *  - a sub-stage must belong to the lead's (resulting) core stage
 * Everything runs in the request transaction: any 4xx rolls the whole change back.
 */
export async function patchLead(
  tx: Tx,
  auth: AuthContext,
  leadId: string,
  body: PatchLeadBody,
  ip?: string,
): Promise<void> {
  await assertLeadAccess(tx, auth, leadId);
  const cur = await tx
    .selectFrom("lead")
    .select(["stage", "owner_counsellor_id"])
    .where("id", "=", leadId)
    .forUpdate()
    .executeTakeFirstOrThrow();

  if (body.ownerCounsellorId !== undefined) {
    if (!hasFullLeadAccess(auth))
      throw forbidden("Only managers can reassign leads", "ONLY_MANAGERS_CAN_REASSIGN");
    if (body.ownerCounsellorId) {
      const m = await tx
        .selectFrom("member")
        .select("userId")
        .where("organizationId", "=", auth.tenantId)
        .where("userId", "=", body.ownerCounsellorId)
        .executeTakeFirst();
      if (!m)
        throw validation("Unknown user", [
          { path: "ownerCounsellorId", message: "Not a member of this institution" },
        ]);
    }
    await tx
      .updateTable("lead")
      .set({ owner_counsellor_id: body.ownerCounsellorId })
      .where("id", "=", leadId)
      .execute();
    await audit(tx, auth, {
      action: "lead.reassign",
      entity: "lead",
      entityId: leadId,
      diff: { from: cur.owner_counsellor_id, to: body.ownerCounsellorId },
      ip,
    });
  }

  let stage = cur.stage as CoreStage;
  let stageChanged = false;
  if (body.stage !== undefined && body.stage !== stage) {
    assertReasonForManualMove(body.reason);
    await moveStage(tx, {
      leadId,
      to: body.stage,
      actor: "user",
      actorUserId: auth.userId,
      reason: body.reason,
      mode: "manual",
    });
    stage = body.stage;
    stageChanged = true;
  }

  if (body.subStageId !== undefined) {
    if (body.subStageId !== null) {
      const ss = await tx
        .selectFrom("lead_sub_stage")
        .select("core_stage")
        .where("id", "=", body.subStageId)
        .executeTakeFirst();
      if (!ss)
        throw validation("Unknown sub-stage", [
          { path: "subStageId", message: "Sub-stage not found" },
        ]);
      if (ss.core_stage !== stage) {
        throw validation("Sub-stage belongs to a different stage", [
          {
            path: "subStageId",
            message: `This sub-stage is under "${ss.core_stage}", the lead is in "${stage}"`,
          },
        ]);
      }
    }
    await tx
      .updateTable("lead")
      .set({ sub_stage_id: body.subStageId })
      .where("id", "=", leadId)
      .execute();
  }

  const stepChange: { next_step?: string | null; next_step_due_at?: Date | null } = {};
  if (body.nextStep !== undefined) {
    stepChange.next_step = body.nextStep;
    if (body.nextStep === null && body.nextStepDueAt === undefined)
      stepChange.next_step_due_at = null;
  }
  if (body.nextStepDueAt !== undefined)
    stepChange.next_step_due_at = body.nextStepDueAt ? new Date(body.nextStepDueAt) : null;
  if (Object.keys(stepChange).length)
    await tx
      .updateTable("lead")
      .set(stepChange as never)
      .where("id", "=", leadId)
      .execute();

  if ((stageChanged || body.nextStep === null) && !TERMINAL_STAGES.has(stage)) {
    const after = await tx
      .selectFrom("lead")
      .select("next_step")
      .where("id", "=", leadId)
      .executeTakeFirstOrThrow();
    if (after.next_step === null) {
      throw new AppError(422, "NEXT_STEP_REQUIRED", "Every open lead needs a next step", [
        { path: "nextStep", message: "Choose a next step (and due date) for this lead" },
      ]);
    }
  }
}

export async function addNote(
  tx: Tx,
  auth: AuthContext,
  leadId: string,
  body: string,
  kind: "note" | "outcome",
): Promise<{ id: string }> {
  await assertLeadAccess(tx, auth, leadId);
  const row = await tx
    .insertInto("lead_note")
    .values({ tenant_id: auth.tenantId, lead_id: leadId, author_id: auth.userId, body, kind })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row;
}

/**
 * "Call now" from Lead 360. Evaluates the policy right away so the user sees WHY a call can't happen
 * (not an HTTP error), then queues call.dial (which re-checks everything at dial time).
 */
export async function callNow(
  tx: Tx,
  auth: AuthContext,
  jobs: JobQueue,
  leadId: string,
  now = new Date(),
): Promise<CallNowResponse> {
  await assertLeadAccess(tx, auth, leadId);
  const lead = await tx
    .selectFrom("lead")
    .select("stage")
    .where("id", "=", leadId)
    .executeTakeFirstOrThrow();
  if (CLOSED_STAGES.has(lead.stage as CoreStage)) {
    throw new AppError(409, "LEAD_CLOSED", `This lead is ${lead.stage}; reopen it before calling`);
  }

  const decision = await previewDial(tx, leadId, now);
  if (!decision.allow) {
    if (decision.code !== "CALL_IN_PROGRESS") {
      await tx
        .updateTable("lead")
        .set({ last_reject_code: decision.code, last_reject_at: now })
        .where("id", "=", leadId)
        .execute();
    }
    return {
      queued: false,
      rejection: {
        code: decision.code,
        ...(decision.retryAt ? { retryAt: decision.retryAt.toISOString() } : {}),
      },
    };
  }

  await jobs.enqueueInTx(
    tx,
    dialJob,
    { tenantId: auth.tenantId, leadId, trigger: "call_now" },
    { singletonKey: `dial:${leadId}:now`, singletonSeconds: 30 }, // a double-click is one call
  );
  return { queued: true };
}
