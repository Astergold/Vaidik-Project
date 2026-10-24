import { z } from "zod";

/** Typed reject codes from handbook §7.3 — shown on Lead 360 and stored on planner proposals. */
export const POLICY_REJECT_CODES = [
  "TENANT_SUSPENDED",
  "WALLET_EMPTY",
  "SUPPRESSED",
  "NDNC_LISTED",
  "NDNC_UNKNOWN",
  "NO_CONSENT",
  "OUTSIDE_WINDOW",
  "CAP_REACHED",
  "TOO_SOON",
  "PROMO_NUMBER_REQUIRED",
  "CALL_IN_PROGRESS",
] as const;
export const policyRejectCode = z.enum(POLICY_REJECT_CODES);
export type PolicyRejectCode = z.infer<typeof policyRejectCode>;

export const policyAction = z.enum(["dial", "whatsapp", "planner"]);
export type PolicyAction = z.infer<typeof policyAction>;

/** evaluate() result shape. Implementation lands in D3-I2-01. */
export type PolicyDecision =
  { allow: true } | { allow: false; code: PolicyRejectCode; retryAt?: Date };
