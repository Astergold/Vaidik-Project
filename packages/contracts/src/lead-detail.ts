import { z } from "zod";
import { idRef, isoDateTime } from "./common.js";
import { coreStage, nextStep, temperature } from "./enums.js";
import { policyRejectCode } from "./policy.js";

export const leadDetail = z.object({
  id: z.uuid(),
  stage: coreStage,
  subStage: idRef.nullable(),
  temperature: temperature.nullable(),
  nextStep: nextStep.nullable(),
  nextStepDueAt: isoDateTime.nullable(),
  owner: idRef.nullable(),
  aiAgent: z.object({ id: z.uuid(), displayName: z.string() }).nullable(),
  source: idRef.nullable(),
  program: idRef.nullable(),
  cycle: idRef,
  person: z.object({
    id: z.uuid(),
    fullName: z.string().nullable(),
    preferredLanguage: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    ndncStatus: z.enum(["clear", "listed", "unknown"]),
    /** Counsellors get masked values (phone: last 4 digits, email: first letter + domain). */
    identifiers: z.array(
      z.object({
        id: z.uuid(),
        kind: z.enum(["phone", "email", "application_no", "external_id"]),
        value: z.string(),
        isPrimary: z.boolean(),
      }),
    ),
  }),
  /** Why the last call attempt was blocked (e.g. OUTSIDE_WINDOW). Cleared when a call is placed. */
  lastRejectCode: z.string().nullable(),
  lastRejectAt: isoDateTime.nullable(),
  lostReason: z.string().nullable(),
  callCount: z.number().int(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type LeadDetail = z.infer<typeof leadDetail>;

const eventBase = { id: z.string(), at: isoDateTime };
export const timelineEvent = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("call"),
    data: z.object({
      callId: z.uuid(),
      direction: z.enum(["outbound", "inbound"]),
      status: z.string(),
      durationS: z.number().int().nullable(),
      disposition: z.string().nullable(),
      hasRecording: z.boolean(),
      hasTranscript: z.boolean(),
      agentName: z.string().nullable(),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("stage_change"),
    data: z.object({
      from: z.string().nullable(),
      to: z.string(),
      reason: z.string().nullable(),
      actor: z.enum(["user", "ai", "system", "integration"]),
      actorName: z.string().nullable(),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("note"),
    data: z.object({
      body: z.string(),
      kind: z.enum(["note", "outcome", "comment"]),
      authorName: z.string().nullable(),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("temperature"),
    data: z.object({
      value: temperature,
      source: z.enum(["ai_analyst", "counsellor", "system"]),
      /** Verbatim transcript quote backing an AI label (validated by the database). */
      quote: z.string().nullable(),
      reason: z.string().nullable(),
      observerName: z.string().nullable(),
      callId: z.uuid().nullable(),
    }),
  }),
]);
export type TimelineEvent = z.infer<typeof timelineEvent>;

export const timelineQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  /** Opaque. Pass back `nextCursor` from the previous page. */
  cursor: z.string().max(200).optional(),
});
export const timelineResponse = z.object({
  items: z.array(timelineEvent),
  nextCursor: z.string().nullable(),
});
export type TimelineResponse = z.infer<typeof timelineResponse>;

/** PATCH /api/leads/:id. Changing the stage requires a reason (it is written to the timeline). */
export const patchLeadBody = z
  .object({
    stage: coreStage,
    subStageId: z.uuid().nullable(),
    nextStep: nextStep.nullable(),
    nextStepDueAt: z.iso.datetime({ offset: true }).nullable(),
    /** Owner/admin/head only. */
    ownerCounsellorId: z.uuid().nullable(),
    reason: z.string().trim().min(3).max(500),
  })
  .partial()
  .refine((v) => Object.keys(v).some((k) => k !== "reason"), {
    message: "Provide at least one field to change",
  });
export type PatchLeadBody = z.infer<typeof patchLeadBody>;

export const addNoteBody = z.object({
  body: z.string().trim().min(1).max(4000),
  kind: z.enum(["note", "outcome"]).default("note"),
});

/** POST /api/leads/:id/call-now */
export const callNowResponse = z.object({
  queued: z.boolean(),
  /** Present when the policy engine blocked the call. Not an HTTP error: show it to the user. */
  rejection: z.object({ code: policyRejectCode, retryAt: isoDateTime.optional() }).optional(),
});
export type CallNowResponse = z.infer<typeof callNowResponse>;
