import { z } from "zod";
import { idRef, isoDateTime } from "./common.js";

/**
 * Reports (D6-I4-04d UI): counsellor performance + CSV exports. PROPOSED CONTRACT — endpoints not built yet.
 * Spec: docs/specs/reports-matrix.md. Roles: owner/admin/admission_head. NOT in Appendix A (handbook §7.5 lists
 * "exports" as a capability; §D6-I4-04 the performance view) — proposed with this naming.
 * The seat/deadline matrix (/programs/matrix) needs no new endpoint: it reuses GET /api/programs and
 * PUT /api/programs/:id/seat from programs.ts.
 *
 *   GET  /api/reports/performance           ?from&to (YYYY-MM-DD, tenant-local) → performanceResponse
 *   GET  /api/reports/exports               → exportsResponse (newest first)
 *   POST /api/reports/exports               createExportBody → 202 exportJob (built by a job)
 *   GET  /api/reports/exports/:id/file      → text/csv (when status = ready)
 */

export const performanceRow = z.object({
  counsellor: idRef,
  /** AI labels this counsellor verified or overrode. */
  callsReviewed: z.number().int().min(0),
  overrides: z.number().int().min(0),
  queueResolved: z.number().int().min(0),
  slaBreaches: z.number().int().min(0),
  visitsBooked: z.number().int().min(0),
  visitsAttended: z.number().int().min(0),
  /** Leads that reached fee_paid or enrolled in the period. */
  conversions: z.number().int().min(0),
  /** Median minutes from a needs-counsellor item to first action; null when none. */
  medianResponseMinutes: z.number().min(0).nullable(),
});
export type PerformanceRow = z.infer<typeof performanceRow>;

export const performanceResponse = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  rows: z.array(performanceRow),
});
export type PerformanceResponse = z.infer<typeof performanceResponse>;

export const EXPORT_KINDS = ["leads", "calls", "applications"] as const;
export const exportKind = z.enum(EXPORT_KINDS);
export type ExportKind = z.infer<typeof exportKind>;

export const exportJob = z.object({
  id: z.uuid(),
  kind: exportKind,
  status: z.enum(["queued", "running", "ready", "failed"]),
  /** "1 Oct – 17 Oct 2026, Interested" — the server's summary of what's in it. */
  description: z.string(),
  rowCount: z.number().int().min(0).nullable(),
  requestedBy: z.string().nullable(),
  createdAt: isoDateTime,
  readyAt: isoDateTime.nullable(),
  /** Files are deleted after this. */
  expiresAt: isoDateTime.nullable(),
  failureReason: z.string().nullable(),
});
export type ExportJob = z.infer<typeof exportJob>;
export const exportsResponse = z.object({ items: z.array(exportJob) });

export const createExportBody = z
  .object({
    kind: exportKind,
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((b) => !b.from || !b.to || b.from <= b.to, {
    path: ["to"],
    message: "End after the start",
  });
export type CreateExportBody = z.infer<typeof createExportBody>;
