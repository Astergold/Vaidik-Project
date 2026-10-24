import { z } from "zod";
import { isoDateTime } from "./common.js";
import { coreStage, queueKind, temperature } from "./enums.js";

/**
 * Counsellor queues (D4-I4-01 UI ↔ D4-I2-03 backend). PROPOSED CONTRACT — endpoints not built yet.
 * Spec: docs/specs/counsellor-workspace.md.
 *
 *   GET  /api/queue?kind&status&limit&cursor   → queueListResponse (422 on an unknown kind)
 *   POST /api/queue/:id/claim                   {} → queueItem
 *   POST /api/queue/:id/resolve                 resolveQueueBody → queueItem
 */

/** Same values as the crm.counsellor_queue_item.status CHECK (migration 20261006000600). Local until the API ships. */
export const QUEUE_STATUSES = ["open", "claimed", "resolved", "dismissed"] as const;
export const queueStatus = z.enum(QUEUE_STATUSES);
export type QueueStatus = z.infer<typeof queueStatus>;

export const queueItem = z.object({
  id: z.uuid(),
  kind: queueKind,
  status: queueStatus,
  reason: z.string().nullable(),
  dueAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  lead: z.object({
    id: z.uuid(),
    name: z.string().nullable(),
    /** As received: masked for counsellors by the API. */
    phone: z.string().nullable(),
    programName: z.string().nullable(),
    stage: coreStage,
    temperature: temperature.nullable(),
  }),
  callId: z.uuid().nullable(),
  assigneeName: z.string().nullable(),
});
export type QueueItem = z.infer<typeof queueItem>;

export const queueListQuery = z.object({
  kind: queueKind.optional(),
  status: queueStatus.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Opaque: pass back nextCursor. */
  cursor: z.string().max(200).optional(),
});
export const queueListResponse = z.object({
  items: z.array(queueItem),
  nextCursor: z.string().nullable(),
});
export type QueueListResponse = z.infer<typeof queueListResponse>;

/** How a counsellor closed the item. A follow-up (callback / visit / meeting) is created by the server at followUpAt. */
export const QUEUE_OUTCOMES = [
  "callback_scheduled",
  "visit_booked",
  "meeting_booked",
  "resolved_on_call",
  "no_action_needed",
] as const;
export const queueOutcome = z.enum(QUEUE_OUTCOMES);
export type QueueOutcome = z.infer<typeof queueOutcome>;

export const resolveQueueBody = z
  .object({
    outcome: queueOutcome,
    note: z.string().trim().min(3, "Add a short note (at least 3 characters)").max(2000),
    followUpAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine(
    (b) =>
      !["callback_scheduled", "visit_booked", "meeting_booked"].includes(b.outcome) ||
      b.followUpAt !== undefined,
    { path: ["followUpAt"], message: "Pick a date and time for the follow-up" },
  );
export type ResolveQueueBody = z.infer<typeof resolveQueueBody>;

export const claimResponse = queueItem;
