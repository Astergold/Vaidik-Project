import { z } from "zod";
import { isoDateTime } from "./common.js";

/**
 * Campus visits, meetings, tasks (D4-I4-02 UI ↔ D4-I2-04 backend). PROPOSED CONTRACT — endpoints not built yet.
 * Spec: docs/specs/visits-calendar.md.
 *
 *   GET/POST /api/visits · PATCH /api/visits/:id · GET /api/visits/slots
 *   GET/POST /api/meetings · PATCH /api/meetings/:id
 *   GET/POST /api/tasks
 */

/** PROPOSED: must equal the crm.campus_visit.status CHECK the Day-4 migration creates. */
export const VISIT_STATUSES = [
  "booked",
  "rescheduled",
  "attended",
  "no_show",
  "cancelled",
] as const;
export const visitStatus = z.enum(VISIT_STATUSES);
export type VisitStatus = z.infer<typeof visitStatus>;

export const BOOKED_BY = ["ai", "user"] as const;
export const bookedBy = z.enum(BOOKED_BY);

/** PROPOSED: must equal the crm.meeting.status CHECK the Day-4 migration creates. */
export const MEETING_STATUSES = ["scheduled", "attended", "no_show", "cancelled"] as const;
export const meetingStatus = z.enum(MEETING_STATUSES);
export type MeetingStatus = z.infer<typeof meetingStatus>;
export const MEETING_MODES = ["phone", "video", "in_person"] as const;
export const meetingMode = z.enum(MEETING_MODES);

/** Mirrors crm.task (migration 20261006000500) exactly. */
export const TASK_STATUSES = ["open", "done", "cancelled"] as const;
export const TASK_KINDS = ["callback", "follow_up", "document"] as const;
export const taskStatus = z.enum(TASK_STATUSES);
export const taskKind = z.enum(TASK_KINDS);

const leadRef = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  /** As received: masked for counsellors by the API. */
  phone: z.string().nullable(),
});
const userRef = z.object({ id: z.uuid(), name: z.string() });
const dateKey = z.iso.date();

export const visit = z.object({
  id: z.uuid(),
  lead: leadRef,
  campus: z.string(),
  scheduledAt: isoDateTime,
  status: visitStatus,
  bookedBy,
  /** Who booked it when bookedBy = user. */
  createdBy: userRef.nullable(),
  outcomeNote: z.string().nullable(),
  createdAt: isoDateTime,
});
export type Visit = z.infer<typeof visit>;

export const visitsQuery = z.object({
  from: dateKey.optional(),
  to: dateKey.optional(),
  status: z.array(visitStatus).optional(),
  campus: z.string().optional(),
  bookedBy: bookedBy.optional(),
  leadId: z.uuid().optional(),
});
export const visitsListResponse = z.object({ items: z.array(visit) });

export const createVisitBody = z.object({
  leadId: z.uuid(),
  campus: z.string().trim().min(1),
  /** One of the slots from GET /api/visits/slots. */
  scheduledAt: z.iso.datetime({ offset: true }),
  note: z.string().trim().max(1000).optional(),
});
export const patchVisitBody = z
  .object({
    status: visitStatus.exclude(["booked"]),
    scheduledAt: z.iso.datetime({ offset: true }),
    outcomeNote: z.string().trim().max(2000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change" })
  .refine((v) => v.status !== "rescheduled" || v.scheduledAt !== undefined, {
    path: ["scheduledAt"],
    message: "Pick the new time",
  })
  .refine(
    (v) =>
      !(v.status === "no_show" || v.status === "cancelled") || (v.outcomeNote?.length ?? 0) >= 3,
    {
      path: ["outcomeNote"],
      message: "Add a short note (at least 3 characters)",
    },
  );
export type PatchVisitBody = z.infer<typeof patchVisitBody>;

export const visitSlotsQuery = z.object({
  campus: z.string().optional(),
  from: dateKey,
  to: dateKey,
});
export const visitSlotsResponse = z.object({ slots: z.array(isoDateTime) });

export const meeting = z.object({
  id: z.uuid(),
  lead: leadRef,
  scheduledAt: isoDateTime,
  durationMin: z.number().int().min(5).max(240),
  mode: meetingMode,
  status: meetingStatus,
  counsellor: userRef.nullable(),
  note: z.string().nullable(),
  createdAt: isoDateTime,
});
export type Meeting = z.infer<typeof meeting>;
export const meetingsQuery = z.object({
  from: dateKey.optional(),
  to: dateKey.optional(),
  status: z.array(meetingStatus).optional(),
  leadId: z.uuid().optional(),
});
export const meetingsListResponse = z.object({ items: z.array(meeting) });
export const createMeetingBody = z.object({
  leadId: z.uuid(),
  scheduledAt: z.iso.datetime({ offset: true }),
  durationMin: z.number().int().min(5).max(240).default(30),
  mode: meetingMode,
  note: z.string().trim().max(1000).optional(),
});
export const patchMeetingBody = z
  .object({
    status: meetingStatus.exclude(["scheduled"]),
    scheduledAt: z.iso.datetime({ offset: true }),
    note: z.string().trim().max(2000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change" })
  .refine(
    (v) => !(v.status === "no_show" || v.status === "cancelled") || (v.note?.length ?? 0) >= 3,
    {
      path: ["note"],
      message: "Add a short note (at least 3 characters)",
    },
  );
export type PatchMeetingBody = z.infer<typeof patchMeetingBody>;

export const task = z.object({
  id: z.uuid(),
  lead: leadRef,
  title: z.string(),
  dueAt: isoDateTime.nullable(),
  status: taskStatus,
  kind: taskKind,
  assignee: userRef.nullable(),
});
export type Task = z.infer<typeof task>;
export const tasksQuery = z.object({
  status: taskStatus.optional(),
  /** Inclusive ISO instant. */
  dueBefore: z.iso.datetime({ offset: true }).optional(),
  /** Only the caller's tasks. */
  mine: z.coerce.boolean().optional(),
});
export const tasksListResponse = z.object({ items: z.array(task) });
export const createTaskBody = z.object({
  leadId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  dueAt: z.iso.datetime({ offset: true }).optional(),
  kind: taskKind.default("follow_up"),
});
