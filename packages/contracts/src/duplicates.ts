import { z } from "zod";
import { isoDateTime } from "./common.js";
import { coreStage } from "./enums.js";

/**
 * Duplicate review + merge (D6-I4-04c UI ↔ D6-I3-05). PROPOSED CONTRACT — endpoints not built yet.
 * Spec: docs/specs/duplicates-ui.md. View: all tenant roles (scoped); merge/dismiss: owner/admin/admission_head.
 *
 *   GET  /api/duplicates                  ?cursor → duplicatesResponse (open candidates)   NOT in Appendix A — proposed
 *   POST /api/duplicates/:id/dismiss      dismissDuplicateBody → { id, status: "dismissed" }  proposed
 *   POST /api/persons/merge               mergePersonsBody → mergeResult                     Appendix A
 *
 * Merge rule (handbook §6.1): identifiers, leads, consent and notes move to the survivor; both ids are audit-logged;
 * call history is never deleted. The browser only says which person survives.
 */

export const DUPLICATE_REASONS = [
  "same_phone",
  "same_email",
  "same_application_no",
  "similar_name_phone",
] as const;

export const duplicatePerson = z.object({
  id: z.uuid(),
  fullName: z.string().nullable(),
  city: z.string().nullable(),
  /** Phones arrive masked for counsellors (server-side); render as received. */
  identifiers: z.array(
    z.object({
      kind: z.enum(["phone", "email", "application_no", "external_id"]),
      value: z.string(),
    }),
  ),
  leads: z.array(
    z.object({
      id: z.uuid(),
      stage: coreStage,
      cycle: z.string(),
      program: z.string().nullable(),
      source: z.string().nullable(),
      createdAt: isoDateTime,
    }),
  ),
  callCount: z.number().int().min(0),
  lastActivityAt: isoDateTime.nullable(),
});
export type DuplicatePerson = z.infer<typeof duplicatePerson>;

export const duplicateCandidate = z.object({
  id: z.uuid(),
  reason: z.enum(DUPLICATE_REASONS),
  /** 0–1: how sure the detector is. */
  score: z.number().min(0).max(1),
  a: duplicatePerson,
  b: duplicatePerson,
  detectedAt: isoDateTime,
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidate>;

export const duplicatesResponse = z.object({
  items: z.array(duplicateCandidate),
  nextCursor: z.string().nullable(),
  total: z.number().int().min(0),
});
export type DuplicatesResponse = z.infer<typeof duplicatesResponse>;

export const dismissDuplicateBody = z.object({ reason: z.string().trim().max(500).optional() });
export const dismissDuplicateResponse = z.object({ id: z.uuid(), status: z.literal("dismissed") });

export const mergePersonsBody = z
  .object({
    candidateId: z.uuid(),
    survivorId: z.uuid(),
    mergedId: z.uuid(),
  })
  .refine((b) => b.survivorId !== b.mergedId, {
    message: "Pick two different people",
    path: ["mergedId"],
  });
export const mergeResult = z.object({
  survivorId: z.uuid(),
  moved: z.object({
    leads: z.number().int().min(0),
    calls: z.number().int().min(0),
    identifiers: z.number().int().min(0),
    notes: z.number().int().min(0),
  }),
});
export type MergeResult = z.infer<typeof mergeResult>;
