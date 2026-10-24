import { z } from "zod";
import { isoDateTime } from "./common.js";
import { fieldMapping, mappedLead } from "./intake.js";

/**
 * CSV lead import (D3-I4-03b UI ↔ D3-I3-03 backend). PROPOSED CONTRACT: the UI is built against these
 * shapes; the endpoints do not exist yet. The backend should implement to this file (or change it here,
 * in one PR with the UI). Spec: docs/specs/lead-sources-ui.md → "CSV import".
 *
 *   POST /api/leads/imports                  multipart/form-data: `sourceId` (uuid) + `file` (.csv)
 *                                            → 201 createImportResponse            owner/admin
 *   PUT  /api/leads/imports/:id/mapping      importMappingBody → 200 leadImport (also saved on the source)
 *   GET  /api/leads/imports/:id/preview      → 200 importPreviewResponse (first PREVIEW_ROWS mapped rows)
 *   POST /api/leads/imports/:id/commit       {} → 202 leadImport (enqueues the import job)
 *   GET  /api/leads/imports/:id              → 200 leadImport (poll while queued/running)
 *   GET  /api/leads/imports/:id/errors       → 200 text/csv (row number, column, reason) once finished
 *
 * Rows go through the same ingest path as intake (normalizePhone / normalizeEmail, dedupe, consent):
 * the browser sends the raw file and never normalises values itself.
 */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMPORT_ROWS = 50_000;
export const PREVIEW_ROWS = 20;
export const SAMPLE_ROWS = 5;

export const IMPORT_STATUSES = [
  "uploaded", // parsed, waiting for a mapping
  "mapped", // mapping saved, preview available
  "queued", // commit accepted, job enqueued
  "running",
  "completed", // finished; some rows may have failed (see counts.failed + errors CSV)
  "failed", // the job itself failed (nothing or part imported); retry by committing again
] as const;
export const importStatus = z.enum(IMPORT_STATUSES);
export type ImportStatus = z.infer<typeof importStatus>;

/**
 * For CSV a mapping "path" is a column header, matched exactly; several columns are joined with a space;
 * `{ const }` and `consent_channels` work as for webhooks. Same schema as the source's field mapping.
 */
export const createImportResponse = z.object({
  importId: z.uuid(),
  sourceId: z.uuid(),
  fileName: z.string(),
  /** Data rows detected (header excluded). */
  rowCount: z.number().int().min(0).max(MAX_IMPORT_ROWS),
  columns: z.array(z.string()).min(1),
  /** First rows as raw strings, in `columns` order — for showing what each column holds. */
  sampleRows: z.array(z.array(z.string())).max(SAMPLE_ROWS),
  /** The source's saved mapping, to pre-fill the mapping step. */
  mapping: fieldMapping,
});
export type CreateImportResponse = z.infer<typeof createImportResponse>;

export const importMappingBody = z.object({ fieldMapping });

export const importRowError = z.object({
  /** Our field ("phone", "email", …) or "row". */
  path: z.string(),
  message: z.string(),
});

export const importPreviewRow = z.object({
  /** 1-based data row number (header excluded), as in the errors CSV. */
  rowNumber: z.number().int().min(1),
  mapped: mappedLead.nullable(),
  errors: z.array(importRowError),
});
export const importPreviewResponse = z.object({
  rows: z.array(importPreviewRow).max(PREVIEW_ROWS),
  totalRows: z.number().int().min(0),
});
export type ImportPreviewResponse = z.infer<typeof importPreviewResponse>;

export const leadImport = z.object({
  id: z.uuid(),
  sourceId: z.uuid(),
  fileName: z.string(),
  status: importStatus,
  totalRows: z.number().int().min(0),
  counts: z.object({
    imported: z.number().int().min(0),
    /** Person already had a lead this cycle: nothing new created (intake semantics). */
    duplicates: z.number().int().min(0),
    failed: z.number().int().min(0),
    pending: z.number().int().min(0),
  }),
  errorReportAvailable: z.boolean(),
  createdAt: isoDateTime,
  finishedAt: isoDateTime.nullable(),
});
export type LeadImport = z.infer<typeof leadImport>;
