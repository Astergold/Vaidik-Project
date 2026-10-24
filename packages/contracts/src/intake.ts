import { z } from "zod";
import { idRef, isoDateTime } from "./common.js";

export const SOURCE_KINDS = [
  "form",
  "aggregator",
  "meta",
  "google",
  "csv",
  "erp",
  "inbound_call",
  "whatsapp",
  "manual",
] as const;
export const sourceKind = z.enum(SOURCE_KINDS);

/** A mapping value: a path into the payload, several paths joined with a space, or a constant. */
const mappingValue = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
  z.object({ const: z.string() }),
]);

/**
 * How a provider's payload becomes our fields. Paths are dot/bracket paths like "contact.mobile" or
 * "$.leads[0].name" (the leading "$." is optional). Only these keys exist; `phone` is required for a lead.
 */
export const fieldMapping = z
  .object({
    full_name: mappingValue.optional(),
    phone: mappingValue.optional(),
    email: mappingValue.optional(),
    city: mappingValue.optional(),
    state: mappingValue.optional(),
    language: mappingValue.optional(),
    /** Matched (case-insensitive) against program names; falls back to the source's default program. */
    program: mappingValue.optional(),
    /** Provider's own lead id; stored as an identifier so the same lead from the same provider dedupes. */
    external_id: mappingValue.optional(),
    /** If mapped: falsy values ("no", "false", "0") record NO consent; otherwise the form submit counts as consent. */
    consent: mappingValue.optional(),
    /** Channels the form's consent covers. Default ["voice"]. */
    consent_channels: z
      .array(z.enum(["voice", "whatsapp"]))
      .min(1)
      .optional(),
  })
  .strict();
export type FieldMapping = z.infer<typeof fieldMapping>;

export const intakeResponse = z.object({
  status: z.literal("accepted"),
  /** Our lead id. Quote it when asking support about a lead. */
  reference: z.uuid(),
  /** True when this person already had a lead in the current cycle (nothing new was created or dialled). */
  duplicate: z.boolean(),
  /** True when an AI call was queued (still subject to calling hours, consent, DND at dial time). */
  queued: z.boolean(),
  warnings: z.array(z.string()),
});
export type IntakeResponse = z.infer<typeof intakeResponse>;

// ---- Settings -> Lead sources (D3-I4-03) -----------------------------------------------------------

export const leadSource = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: sourceKind,
  fieldMapping,
  defaultProgramId: z.uuid().nullable(),
  defaultAgentId: z.uuid().nullable(),
  autoDial: z.boolean(),
  isActive: z.boolean(),
  /** Absolute URL the provider posts to. The bearer token is NOT recoverable (shown once at creation/rotation). */
  endpointUrl: z.string(),
  hasToken: z.boolean(),
  createdAt: isoDateTime,
});
export type LeadSource = z.infer<typeof leadSource>;

export const createSourceBody = z.object({
  name: z.string().trim().min(1).max(100),
  kind: sourceKind.default("form"),
  fieldMapping: fieldMapping.default({}),
  defaultProgramId: z.uuid().nullable().optional(),
  defaultAgentId: z.uuid().nullable().optional(),
  autoDial: z.boolean().default(true),
});
export type CreateSourceBody = z.infer<typeof createSourceBody>;

export const createSourceResponse = leadSource.extend({
  /** Shown ONCE. Send as `Authorization: Bearer <token>`. */
  token: z.string(),
});

export const patchSourceBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    fieldMapping,
    defaultProgramId: z.uuid().nullable(),
    defaultAgentId: z.uuid().nullable(),
    autoDial: z.boolean(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to change" });

export const rotateTokenResponse = z.object({ token: z.string() });

export const sourcesListResponse = z.object({ items: z.array(leadSource) });

/** "Test payload" box in the mapping editor: nothing is written. */
export const testMappingBody = z.object({
  payload: z.record(z.string(), z.unknown()),
  fieldMapping: fieldMapping.optional(),
});
/** One payload/row after mapping (values normalised by the API: phone E.164, email lower-case). */
export const mappedLead = z.object({
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  language: z.string().nullable(),
  program: z.string().nullable(),
  externalId: z.string().nullable(),
  consent: z.boolean(),
});
export type MappedLead = z.infer<typeof mappedLead>;

export const testMappingResponse = z.object({
  ok: z.boolean(),
  mapped: mappedLead.nullable(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })),
  warnings: z.array(z.string()),
});
export type TestMappingResponse = z.infer<typeof testMappingResponse>;

export { idRef };
