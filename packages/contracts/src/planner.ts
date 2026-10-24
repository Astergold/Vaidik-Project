import { z } from "zod";
import { idRef, isoDateTime } from "./common.js";
import { callStatus, temperature } from "./enums.js";
import { policyRejectCode } from "./policy.js";

/**
 * Planner approvals, compliance report and the calls log (D6-I4-04e UI ↔ D6-I2-03/04 planner + A6 supervisor queue,
 * D6-I1-04 A5 auditor, D3-I1/I3 call attempts). PROPOSED CONTRACT — endpoints not built yet.
 * Spec: docs/specs/planner-compliance-calls.md.
 *
 *   GET  /api/planner/proposals               ?status&approval&cursor → proposalsResponse      managers   (proposed)
 *   POST /api/planner/proposals/:id/approve   {} → proposal                                     managers   (proposed)
 *   POST /api/planner/proposals/:id/reject    rejectProposalBody → proposal                     managers   (proposed)
 *   GET  /api/settings/planner                → plannerSettings                                 managers   (proposed)
 *   PUT  /api/settings/planner                putPlannerSettingsBody → plannerSettings          owner/admin (proposed)
 *   GET  /api/admin/compliance-report         ?date → complianceReport                          managers   (Appendix A)
 *   GET  /api/calls                           callsQuery → callsResponse                        all roles, scoped (Appendix A)
 *   GET  /api/calls/:id/recording             → 302 signed URL (call-review.ts; the <audio> element follows it)
 *
 * Every planner action is permitted by the policy engine before it is effected; a rejected proposal carries the typed
 * reject code. With approval mode on, nothing is sent until a manager approves.
 */

/* ---- planner ---- */

export const PROPOSAL_ACTIONS = ["callback", "whatsapp_info", "counsellor_call"] as const;
export const PROPOSAL_STATUSES = ["proposed", "permitted", "rejected", "effected"] as const;
export const APPROVAL_STATES = ["not_required", "pending", "approved", "declined"] as const;

export const proposal = z.object({
  id: z.uuid(),
  lead: z.object({ id: z.uuid(), name: z.string().nullable(), phone: z.string().nullable() }),
  action: z.enum(PROPOSAL_ACTIONS),
  scheduledFor: isoDateTime,
  /** The planner's reasoning, shown verbatim. */
  rationale: z.string(),
  status: z.enum(PROPOSAL_STATUSES),
  /** Set when the policy engine refused it. */
  rejectCode: policyRejectCode.nullable(),
  approval: z.enum(APPROVAL_STATES),
  decidedBy: z.string().nullable(),
  decidedAt: isoDateTime.nullable(),
  /** What happened once effected (link target). */
  effect: z.object({ kind: z.enum(["call", "message", "queue_item"]), id: z.uuid() }).nullable(),
  createdAt: isoDateTime,
});
export type Proposal = z.infer<typeof proposal>;

export const proposalsResponse = z.object({
  items: z.array(proposal),
  nextCursor: z.string().nullable(),
  pendingApproval: z.number().int().min(0),
});
export type ProposalsResponse = z.infer<typeof proposalsResponse>;

export const rejectProposalBody = z.object({
  reason: z.string().trim().min(3, "Say why (it's recorded)").max(500),
});

export const PLANNER_MODES = ["auto", "approval"] as const;
export const plannerSettings = z.object({
  mode: z.enum(PLANNER_MODES),
  updatedAt: isoDateTime.nullable(),
  updatedBy: z.string().nullable(),
});
export type PlannerSettings = z.infer<typeof plannerSettings>;
export const putPlannerSettingsBody = z.object({ mode: z.enum(PLANNER_MODES) });

/* ---- A5 compliance report (nightly, deterministic) ---- */

export const VIOLATION_KINDS = ["outside_window", "no_consent", "suppressed", "over_cap"] as const;
export const complianceReport = z.object({
  /** The night the auditor covered (tenant-local date). */
  date: z.iso.date(),
  generatedAt: isoDateTime,
  checkedCalls: z.number().int().min(0),
  violations: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(VIOLATION_KINDS),
      callId: z.uuid(),
      lead: z.object({ id: z.uuid(), name: z.string().nullable() }),
      occurredAt: isoDateTime,
      /** "Called at 21:14, window ends 21:00". */
      detail: z.string(),
    }),
  ),
});
export type ComplianceReport = z.infer<typeof complianceReport>;

/* ---- calls log ---- */

export const callsQuery = z.object({
  status: z.array(callStatus).optional(),
  disposition: z.array(z.string()).optional(),
  agentId: z.array(z.uuid()).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const callListItem = z.object({
  id: z.uuid(),
  /** Phone as received: masked for counsellors by the server. */
  lead: z.object({ id: z.uuid(), name: z.string().nullable(), phone: z.string().nullable() }),
  agent: z.object({ id: z.uuid(), displayName: z.string() }).nullable(),
  campaign: idRef.nullable(),
  direction: z.enum(["outbound", "inbound"]),
  status: callStatus,
  /** Provider-neutral outcome label, e.g. "interested", "callback_requested", "wrong_number". */
  disposition: z.string().nullable(),
  rejectCode: policyRejectCode.nullable(),
  startedAt: isoDateTime.nullable(),
  durationS: z.number().int().min(0).nullable(),
  hasRecording: z.boolean(),
  temperature: temperature.nullable(),
  createdAt: isoDateTime,
});
export type CallListItem = z.infer<typeof callListItem>;

export const callsResponse = z.object({
  items: z.array(callListItem),
  nextCursor: z.string().nullable(),
  total: z.number().int().min(0),
  /** Dispositions seen in this tenant, for the filter. */
  dispositions: z.array(z.string()),
});
export type CallsResponse = z.infer<typeof callsResponse>;
