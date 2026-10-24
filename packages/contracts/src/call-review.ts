import { z } from "zod";
import { isoDateTime } from "./common.js";
import { nextStep, temperature } from "./enums.js";

/**
 * Call review (D4-I4-01 UI ↔ D4-I2-03 / D3-I1-01 backend). PROPOSED CONTRACT — endpoints not built yet.
 * Spec: docs/specs/counsellor-workspace.md.
 *
 *   GET  /api/calls/:id                    → callReview
 *   GET  /api/calls/:id/recording          → 302 to a short-lived signed URL (range requests)
 *   POST /api/calls/:id/review/verify      {} → callReview
 *   POST /api/calls/:id/review/override    overrideReviewBody → callReview
 *
 * Verify/override insert a lead_temperature_observation (source 'counsellor'); the DB trigger updates
 * lead.current_temperature. Nothing here writes that column.
 */
export const REVIEW_STATES = ["pending", "verified", "overridden"] as const;
export const reviewState = z.enum(REVIEW_STATES);

export const callReview = z.object({
  callId: z.uuid(),
  leadId: z.uuid(),
  leadName: z.string().nullable(),
  /** As received: masked for counsellors by the API. */
  phone: z.string().nullable(),
  direction: z.enum(["outbound", "inbound"]),
  status: z.string(),
  durationS: z.number().int().nullable(),
  recordedAt: isoDateTime.nullable(),
  hasRecording: z.boolean(),
  /** call_attempt.transcript_text — the text AI quotes are validated against. */
  transcriptText: z.string().nullable(),
  /** The AI's label for this call (not the lead's current value). */
  temperature: temperature.nullable(),
  temperatureQuote: z.string().nullable(),
  nextStep: nextStep.nullable(),
  nextStepDueAt: isoDateTime.nullable(),
  summary: z.string().nullable(),
  objections: z.array(z.object({ type: z.string(), quote: z.string() })),
  languageDetected: z.string().nullable(),
  needsCounsellor: z.boolean(),
  needsCounsellorReason: z.string().nullable(),
  analysisModel: z.string().nullable(),
  review: z.object({
    state: reviewState,
    /** Value after review (verified = AI value; overridden = counsellor's). */
    temperature: temperature.nullable(),
    byName: z.string().nullable(),
    at: isoDateTime.nullable(),
    reason: z.string().nullable(),
  }),
});
export type CallReview = z.infer<typeof callReview>;

export const verifyReviewBody = z.object({});
export const overrideReviewBody = z.object({
  temperature,
  nextStep: nextStep.optional(),
  nextStepDueAt: z.iso.datetime({ offset: true }).optional(),
  reason: z.string().trim().min(3, "Say why (at least 3 characters)").max(500),
});
export type OverrideReviewBody = z.infer<typeof overrideReviewBody>;

export const reviewResultResponse = callReview;
