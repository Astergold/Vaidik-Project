import { z } from "zod";
import { idRef, isoDateTime } from "./common.js";
import { importStatus } from "./leads-import.js";

/**
 * Applications + fee tracking (D5-I4-01 UI ↔ D5-I1-01 backend). PROPOSED CONTRACT — the endpoints don't exist yet.
 * Spec: docs/specs/applications-ui.md. Roles: owner/admin/admission_head, except `?leadId=` (any role with access
 * to that lead, for the Lead 360 panel).
 *
 *   GET  /api/applications                       applicationsQuery → applicationsListResponse
 *   POST /api/applications/import                multipart: `file` (.csv) → 201 createApplicationImportResponse
 *   PUT  /api/applications/import/:id/mapping    applicationImportMappingBody → applicationImport
 *   GET  /api/applications/import/:id/preview    → applicationImportPreviewResponse
 *   POST /api/applications/import/:id/commit     {} → 202 applicationImport (enqueues the sync job)
 *   GET  /api/applications/import/:id            → applicationImport (poll while queued/running)
 *   GET  /api/applications/import/:id/errors     → text/csv (row, column, reason)
 *   GET  /api/applications/unmatched             unmatchedQuery → unmatchedListResponse
 *   POST /api/applications/:id/link              linkApplicationBody → application (409 ALREADY_LINKED)
 *   POST /api/applications/:id/dismiss           dismissApplicationBody → { id, dismissed: true }
 *
 * Matching (server): application no. → phone → email; no match = unmatched list. Stage auto-advance is D5-I1-02.
 */

/** Same values as the planned crm.application.status CHECK. Kept here (not enums.ts) until the API ships. */
export const APPLICATION_STATUSES = [
  "not_started",
  "form_started",
  "form_submitted",
  "fee_paid",
  "admitted",
  "enrolled",
  "withdrawn",
] as const;
export const applicationStatus = z.enum(APPLICATION_STATUSES);
export type ApplicationStatus = z.infer<typeof applicationStatus>;

export const application = z.object({
  id: z.uuid(),
  /** Phone arrives masked for counsellors (server-side); render as received. */
  lead: z.object({ id: z.uuid(), name: z.string().nullable(), phone: z.string().nullable() }),
  program: idRef.nullable(),
  externalApplicationNo: z.string().nullable(),
  status: applicationStatus,
  /** Whole rupees. */
  feeAmount: z.number().int().min(0).nullable(),
  paidAt: isoDateTime.nullable(),
  /** Where the last update came from: "csv", "api", "portal". */
  source: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Application = z.infer<typeof application>;

/** Query string (arrays repeat the key). Dates are tenant-local YYYY-MM-DD on `updatedAt`. */
export const applicationsQuery = z.object({
  status: z.array(applicationStatus).optional(),
  programId: z.array(z.uuid()).optional(),
  /** true = has a paidAt; false = not paid yet. */
  feePaid: z.boolean().optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  /** Application no., name, phone last digits, email. */
  q: z.string().trim().min(1).max(100).optional(),
  leadId: z.uuid().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type ApplicationsQuery = z.input<typeof applicationsQuery>;

export const applicationsListResponse = z.object({
  items: z.array(application),
  nextCursor: z.string().nullable(),
  /** Rows matching the filters (all pages). */
  total: z.number().int().min(0),
});
export type ApplicationsListResponse = z.infer<typeof applicationsListResponse>;

/* ---- import (CSV/Excel export from the admissions portal) ---- */

export const APPLICATION_IMPORT_FIELDS = [
  "external_application_no",
  "full_name",
  "phone",
  "email",
  "program",
  "status",
  "fee_amount",
  "paid_at",
] as const;
export type ApplicationImportField = (typeof APPLICATION_IMPORT_FIELDS)[number];

/** Our field → the CSV column header it comes from (exact match); missing = not imported. */
export const applicationColumnMapping = z.partialRecord(
  z.enum(APPLICATION_IMPORT_FIELDS),
  z.string().min(1),
);
export type ApplicationColumnMapping = z.infer<typeof applicationColumnMapping>;

export const applicationImportMappingBody = z.object({
  mapping: applicationColumnMapping
    .refine((m) => Boolean(m.external_application_no || m.phone || m.email), {
      message: "Map the application number, phone or email so rows can be matched",
    })
    .refine((m) => Boolean(m.status), { message: "Map the status column" }),
});

export const createApplicationImportResponse = z.object({
  importId: z.uuid(),
  fileName: z.string(),
  rowCount: z.number().int().min(0),
  columns: z.array(z.string()).min(1),
  sampleRows: z.array(z.array(z.string())).max(5),
  /** The mapping saved from the last import, to pre-fill the step. */
  mapping: applicationColumnMapping,
});
export type CreateApplicationImportResponse = z.infer<typeof createApplicationImportResponse>;

export const MATCH_KINDS = ["application_no", "phone", "email", "none"] as const;
export const applicationPreviewRow = z.object({
  rowNumber: z.number().int().min(1),
  mapped: z
    .object({
      externalApplicationNo: z.string().nullable(),
      fullName: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      program: z.string().nullable(),
      status: applicationStatus.nullable(),
      feeAmount: z.number().int().nullable(),
      paidAt: isoDateTime.nullable(),
    })
    .nullable(),
  /** How the row would be matched to a lead; "none" lands in the unmatched list. */
  match: z.enum(MATCH_KINDS),
  errors: z.array(z.object({ path: z.string(), message: z.string() })),
});
export const applicationImportPreviewResponse = z.object({
  rows: z.array(applicationPreviewRow).max(20),
  totalRows: z.number().int().min(0),
});
export type ApplicationImportPreviewResponse = z.infer<typeof applicationImportPreviewResponse>;

export const applicationImport = z.object({
  id: z.uuid(),
  fileName: z.string(),
  status: importStatus,
  totalRows: z.number().int().min(0),
  counts: z.object({
    updated: z.number().int().min(0),
    created: z.number().int().min(0),
    unmatched: z.number().int().min(0),
    failed: z.number().int().min(0),
    pending: z.number().int().min(0),
  }),
  errorReportAvailable: z.boolean(),
  createdAt: isoDateTime,
  finishedAt: isoDateTime.nullable(),
});
export type ApplicationImport = z.infer<typeof applicationImport>;

/* ---- unmatched review ---- */

export const unmatchedApplication = z.object({
  id: z.uuid(),
  externalApplicationNo: z.string().nullable(),
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  /** The program text as received (not resolved to a program). */
  program: z.string().nullable(),
  status: applicationStatus,
  feeAmount: z.number().int().min(0).nullable(),
  paidAt: isoDateTime.nullable(),
  source: z.string(),
  receivedAt: isoDateTime,
  /** no_match = nothing matched; ambiguous = several leads matched. */
  reason: z.enum(["no_match", "ambiguous"]),
});
export type UnmatchedApplication = z.infer<typeof unmatchedApplication>;

export const unmatchedQuery = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const unmatchedListResponse = z.object({
  items: z.array(unmatchedApplication),
  nextCursor: z.string().nullable(),
  total: z.number().int().min(0),
});
export type UnmatchedListResponse = z.infer<typeof unmatchedListResponse>;

export const linkApplicationBody = z.object({ leadId: z.uuid() });
export const dismissApplicationBody = z.object({
  reason: z.string().trim().max(500).optional(),
});
export const dismissApplicationResponse = z.object({ id: z.uuid(), dismissed: z.literal(true) });
