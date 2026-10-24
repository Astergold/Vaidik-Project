import { z } from "zod";
import { idRef, isoDateTime, pageMeta, pageQuery } from "./common.js";
import { coreStage, nextStep, temperature } from "./enums.js";

export const LEAD_SORT_FIELDS = [
  "created_at",
  "updated_at",
  "next_step_due_at",
  "full_name",
] as const;

/** A filter accepts one value (?stage=new) or several (?stage=new&stage=attempting). */
const oneOrMany = <T extends z.ZodType>(s: T) => z.union([s, z.array(s)]);

/** GET /api/leads */
export const leadsListQuery = pageQuery.extend({
  sort: z.enum(LEAD_SORT_FIELDS).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
  /** Searches name, phone digits (>= 3) and email. */
  q: z.string().trim().min(1).max(100).optional(),
  stage: oneOrMany(coreStage).optional(),
  temperature: oneOrMany(temperature).optional(),
  sourceId: oneOrMany(z.uuid()).optional(),
  agentId: oneOrMany(z.uuid()).optional(),
  counsellorId: oneOrMany(z.uuid()).optional(),
  /** Inclusive range on lead.created_at, ISO date or datetime. */
  createdFrom: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
  createdTo: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
});
export type LeadsListQuery = z.infer<typeof leadsListQuery>;

export const leadListItem = z.object({
  id: z.uuid(),
  person: z.object({
    id: z.uuid(),
    fullName: z.string().nullable(),
    /** Full number for owner/admin/head; masked to the last 4 digits for counsellors (enforced server-side). */
    phone: z.string().nullable(),
    city: z.string().nullable(),
  }),
  stage: coreStage,
  subStage: z.string().nullable(),
  temperature: temperature.nullable(),
  nextStep: nextStep.nullable(),
  nextStepDueAt: isoDateTime.nullable(),
  owner: idRef.nullable(),
  aiAgent: z.object({ id: z.uuid(), displayName: z.string() }).nullable(),
  source: idRef.nullable(),
  program: idRef.nullable(),
  callCount: z.number().int(),
  lastCallAt: isoDateTime.nullable(),
  lastRejectCode: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type LeadListItem = z.infer<typeof leadListItem>;

export const leadsListResponse = pageMeta.extend({ items: z.array(leadListItem) });
export type LeadsListResponse = z.infer<typeof leadsListResponse>;

// ---- GET /api/leads/filters (D2-I4-03a) ------------------------------------------------------------
/** One option in a Leads-list filter dropdown. Deliberately slim: no secrets, mappings, provider ids or URLs. */
export const leadsFilterOption = z.object({
  id: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
});
export type LeadsFilterOption = z.infer<typeof leadsFilterOption>;

/**
 * Options for the sourceId / agentId / counsellorId filters of `GET /api/leads`, ordered by name.
 * Scoped like the list itself: a counsellor gets only themselves and the AI agents allocated to them.
 */
export const leadsFiltersResponse = z.object({
  sources: z.array(leadsFilterOption),
  agents: z.array(leadsFilterOption),
  counsellors: z.array(leadsFilterOption),
});
export type LeadsFiltersResponse = z.infer<typeof leadsFiltersResponse>;
