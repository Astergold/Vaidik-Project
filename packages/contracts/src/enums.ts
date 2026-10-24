import { z } from "zod";

/**
 * Single source of truth for enum values. The DB uses text + CHECK constraints with the
 * same values (see docs/specs/data-model.md). A test in packages/db asserts they match.
 */
export const CORE_STAGES = [
  "new",
  "attempting",
  "connected",
  "interested",
  "visit_booked",
  "visited",
  "applied",
  "fee_paid",
  "enrolled",
  "lost",
  "invalid",
] as const;
export const coreStage = z.enum(CORE_STAGES);
export type CoreStage = z.infer<typeof coreStage>;

export const TEMPERATURES = ["hot", "warm", "cold", "invalid"] as const;
export const temperature = z.enum(TEMPERATURES);
export type Temperature = z.infer<typeof temperature>;

export const NEXT_STEPS = [
  "book_visit",
  "fill_form",
  "pay_fee",
  "callback",
  "counsellor_call",
  "send_info",
  "none",
] as const;
export const nextStep = z.enum(NEXT_STEPS);
export type NextStep = z.infer<typeof nextStep>;

export const ROLES = ["owner", "admin", "admission_head", "counsellor"] as const;
export const role = z.enum(ROLES);
export type Role = z.infer<typeof role>;

export const CALL_STATUSES = [
  "reserved",
  "dialing",
  "in_progress",
  "completed",
  "failed",
  "no_answer",
  "busy",
  "rejected",
] as const;
export const callStatus = z.enum(CALL_STATUSES);
export type CallStatus = z.infer<typeof callStatus>;
/** Statuses that count as "a call is active for this lead" (partial unique index). */
export const ACTIVE_CALL_STATUSES = ["reserved", "dialing", "in_progress"] as const;

export const ACTORS = ["user", "ai", "system", "integration"] as const;
export const actor = z.enum(ACTORS);
export type Actor = z.infer<typeof actor>;

export const IDENTIFIER_KINDS = ["phone", "email", "application_no", "external_id"] as const;
export const identifierKind = z.enum(IDENTIFIER_KINDS);
export type IdentifierKind = z.infer<typeof identifierKind>;

export const QUEUE_KINDS = ["needs_counsellor", "review_call", "sla_breach"] as const;
export const queueKind = z.enum(QUEUE_KINDS);
export type QueueKind = z.infer<typeof queueKind>;

export const SUPPRESSION_REASONS = ["dnd", "ndnc", "opt_out", "invalid"] as const;
export const suppressionReason = z.enum(SUPPRESSION_REASONS);
export type SuppressionReason = z.infer<typeof suppressionReason>;

export const USAGE_KINDS = ["call_minute", "whatsapp", "analyst_run", "sms"] as const;
export const usageKind = z.enum(USAGE_KINDS);
export type UsageKind = z.infer<typeof usageKind>;
