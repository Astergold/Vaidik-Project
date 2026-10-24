import { z } from "zod";
import { isoDateTime } from "./common.js";

/**
 * Programs + knowledge base (D4-I4-03 UI ↔ D4-I2-01 backend). PROPOSED CONTRACT — endpoints not built yet.
 * Spec: docs/specs/programs-kb-admin.md. crm.program (name, code, is_active) exists; the rest is Day-4.
 */

/** Seat availability is categorical ONLY — the agent never quotes a count (handbook §7.4). PROPOSED CHECK values. */
export const SEAT_BUCKETS = ["open", "limited", "closed"] as const;
export const seatBucket = z.enum(SEAT_BUCKETS);
export type SeatBucket = z.infer<typeof seatBucket>;

export const FEE_KINDS = ["tuition", "hostel", "application", "other"] as const;
export const feeKind = z.enum(FEE_KINDS);
export const DEADLINE_KINDS = [
  "application",
  "fee_payment",
  "documents",
  "admission_close",
] as const;
export const deadlineKind = z.enum(DEADLINE_KINDS);

/** "2026-27" */
const academicYear = z.string().regex(/^\d{4}-\d{2}$/, "Use the form 2026-27");

export const programFee = z.object({
  id: z.uuid(),
  amount: z.number().int().min(0),
  currency: z.literal("INR"),
  academicYear,
  kind: feeKind,
});
export const programSeat = z.object({ academicYear, bucket: seatBucket });
export const programDeadline = z.object({ id: z.uuid(), kind: deadlineKind, dueAt: isoDateTime });
export const programEligibility = z.object({
  summary: z.string(),
  minimums: z.array(z.object({ label: z.string(), value: z.string() })),
});

export const programDetail = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  isActive: z.boolean(),
  fees: z.array(programFee),
  seats: z.array(programSeat),
  deadlines: z.array(programDeadline),
  eligibility: programEligibility.nullable(),
  updatedAt: isoDateTime,
});
export type ProgramDetail = z.infer<typeof programDetail>;
export const programsListResponse = z.object({ items: z.array(programDetail) });

export const createProgramBody = z.object({
  name: z.string().trim().min(1, "Give the program a name").max(150),
  code: z.string().trim().max(30).optional(),
  isActive: z.boolean().default(true),
});
export const patchProgramBody = createProgramBody
  .extend({ code: z.string().trim().max(30).nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change" });
export const createFeeBody = z.object({
  amount: z.number().int("Whole rupees").min(0).max(100_000_000),
  currency: z.literal("INR").default("INR"),
  academicYear,
  kind: feeKind,
});
export const putSeatBody = z.object({ academicYear, bucket: seatBucket });
export const createDeadlineBody = z.object({
  kind: deadlineKind,
  dueAt: z.iso.datetime({ offset: true }),
});
export const putEligibilityBody = z.object({
  summary: z.string().trim().min(1, "Describe who can apply").max(2000),
  minimums: z
    .array(z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) }))
    .max(20),
});

/* ---- knowledge base ---- */

export const kbDocument = z.object({
  id: z.uuid(),
  title: z.string(),
  programId: z.uuid().nullable(),
  tags: z.array(z.string()),
  /** Markdown. */
  body: z.string(),
  updatedAt: isoDateTime,
});
export type KbDocument = z.infer<typeof kbDocument>;
export const kbSearchQuery = z.object({
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(50).optional(),
  programId: z.uuid().optional(),
});
export const kbSearchResponse = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      /** Plain-text excerpt chosen by the server (what the agent would cite). */
      snippet: z.string(),
      tags: z.array(z.string()),
      programId: z.uuid().nullable(),
    }),
  ),
});
export type KbSearchResponse = z.infer<typeof kbSearchResponse>;
export const kbDocumentBody = z.object({
  title: z.string().trim().min(1, "Give the article a title").max(200),
  programId: z.uuid().nullable(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20),
  body: z.string().trim().min(1, "Write something").max(50_000),
});
export const patchKbDocumentBody = kbDocumentBody.partial();
