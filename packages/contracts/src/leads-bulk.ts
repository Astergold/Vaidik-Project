import { z } from "zod";
import { idRef, isoDateTime } from "./common.js";
import { coreStage, temperature } from "./enums.js";
import { LEAD_SORT_FIELDS } from "./leads.js";

/**
 * Saved views + bulk actions on /leads (D6-I4-04b UI ↔ D6-I2-05). PROPOSED CONTRACT — endpoints not built yet.
 * Spec: docs/specs/leads-views-bulk.md.
 *
 *   GET    /api/saved-views?entity=lead     → savedViewsResponse (mine + shared)      all tenant roles
 *   POST   /api/saved-views                 createSavedViewBody → 201 savedView      shared: managers only (403)
 *   PATCH  /api/saved-views/:id             patchSavedViewBody → savedView           owner of the view (or managers for shared)
 *   DELETE /api/saved-views/:id             → 204
 *   POST   /api/leads/bulk                  bulkLeadsBody → bulkLeadsResult          owner/admin/admission_head (Appendix A)
 *
 * Saved views are NOT in Appendix A (the saved_view table is in handbook §6) — proposed with this naming.
 * Bulk writes go through the server's services: stage changes use moveStage(mode: "manual") with the reason, assigning
 * and campaign membership are audit-logged; nothing is written client-side.
 */

/** The Leads-list filter vocabulary (same names and meaning as the /leads URL and GET /api/leads). */
export const savedLeadFilters = z.object({
  q: z.string().trim().max(100).optional(),
  stage: z.array(coreStage).optional(),
  temperature: z.array(temperature).optional(),
  sourceId: z.array(z.uuid()).optional(),
  agentId: z.array(z.uuid()).optional(),
  counsellorId: z.array(z.uuid()).optional(),
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  sort: z.enum(LEAD_SORT_FIELDS).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});
export type SavedLeadFilters = z.infer<typeof savedLeadFilters>;

export const savedView = z.object({
  id: z.uuid(),
  name: z.string(),
  entity: z.literal("lead"),
  filters: savedLeadFilters,
  isShared: z.boolean(),
  owner: idRef,
  /** The viewer created it (and may edit/delete it). */
  isMine: z.boolean(),
  createdAt: isoDateTime,
});
export type SavedView = z.infer<typeof savedView>;
export const savedViewsResponse = z.object({ items: z.array(savedView) });

export const createSavedViewBody = z.object({
  entity: z.literal("lead"),
  name: z.string().trim().min(1, "Name the view").max(60),
  filters: savedLeadFilters,
  isShared: z.boolean(),
});
export const patchSavedViewBody = createSavedViewBody.omit({ entity: true }).partial();

/* ---- bulk ---- */

export const MAX_BULK_IDS = 500;

/** Either explicit ids, or "everything matching this filter" with the count the user saw (guards against drift). */
export const bulkTarget = z.union([
  z.object({ leadIds: z.array(z.uuid()).min(1).max(MAX_BULK_IDS) }),
  z.object({ filter: savedLeadFilters, expectedCount: z.number().int().min(1).max(10_000) }),
]);
export type BulkTarget = z.infer<typeof bulkTarget>;

export const bulkLeadsBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    target: bulkTarget,
    counsellorId: z.uuid("Choose a counsellor"),
  }),
  z.object({
    action: z.literal("stage"),
    target: bulkTarget,
    to: coreStage,
    reason: z.string().trim().min(3, "Say why (it's recorded on every lead)").max(500),
  }),
  z.object({
    action: z.literal("add_to_campaign"),
    target: bulkTarget,
    campaignId: z.uuid("Choose a campaign"),
  }),
  z.object({ action: z.literal("export"), target: bulkTarget }),
]);
export type BulkLeadsBody = z.infer<typeof bulkLeadsBody>;

export const bulkLeadsResult = z.object({
  action: z.enum(["assign", "stage", "add_to_campaign", "export"]),
  affected: z.number().int().min(0),
  /** Leads the server left alone, with a human reason (e.g. "Already enrolled", "Not in your scope"). */
  skipped: z.array(z.object({ leadId: z.uuid(), reason: z.string() })),
  /** export only: appears under Reports → Exports when ready. */
  exportId: z.uuid().nullable(),
});
export type BulkLeadsResult = z.infer<typeof bulkLeadsResult>;
