import { z } from "zod";
import { isoDateTime } from "./common.js";

/**
 * LLM provider + tenant extraction rules (D6-I4-02 UI ↔ D4-I1-02). PROPOSED CONTRACT — endpoints not built yet.
 * Spec: docs/specs/settings-ui.md. Roles: owner/admin.
 *
 *   GET    /api/settings/llm                       → llmSettings
 *   PUT    /api/settings/llm                       putLlmBody → llmSettings (key write-only; omit to keep)
 *   GET    /api/settings/extraction-rules          → extractionRulesResponse
 *   POST   /api/settings/extraction-rules          extractionRuleBody → 201 extractionRule (409 FIELD_KEY_TAKEN)
 *   PATCH  /api/settings/extraction-rules/:id      extractionRuleBody.partial() → extractionRule
 *   DELETE /api/settings/extraction-rules/:id      → 204
 */

export const LLM_PROVIDERS = ["anthropic", "openai", "google", "openrouter"] as const;
export const llmProvider = z.enum(LLM_PROVIDERS);
export type LlmProvider = z.infer<typeof llmProvider>;
export const LLM_PURPOSES = ["analyst", "planner"] as const;
export const llmPurpose = z.enum(LLM_PURPOSES);
export type LlmPurpose = z.infer<typeof llmPurpose>;

export const llmConfig = z.object({
  purpose: llmPurpose,
  provider: llmProvider,
  model: z.string(),
  /** Whether a key is stored (never the key). false = the platform's default key is used. */
  hasKey: z.boolean(),
  updatedAt: isoDateTime.nullable(),
});
export type LlmConfig = z.infer<typeof llmConfig>;

export const llmSettings = z.object({
  configs: z.array(llmConfig),
  /** Suggested models per provider (free text is still accepted). */
  suggestedModels: z.partialRecord(llmProvider, z.array(z.string())),
});
export type LlmSettings = z.infer<typeof llmSettings>;

export const putLlmBody = z.object({
  purpose: llmPurpose,
  provider: llmProvider,
  model: z.string().trim().min(1, "Enter a model name").max(100),
  apiKey: z.string().trim().min(8, "That key looks too short").max(500).optional(),
});
export type PutLlmBody = z.infer<typeof putLlmBody>;

/* ---- extraction rules: custom fields the analyst pulls from every transcript ---- */

export const EXTRACTION_DATA_TYPES = ["text", "number", "boolean", "enum", "date"] as const;
export const extractionDataType = z.enum(EXTRACTION_DATA_TYPES);

/** Core analysis fields a custom rule may not shadow (the API re-checks). */
export const RESERVED_FIELD_KEYS = [
  "summary",
  "next_step",
  "temperature",
  "objections",
  "needs_counsellor",
  "verbatim_quote",
  "language",
] as const;

export const extractionRule = z.object({
  id: z.uuid(),
  fieldKey: z.string(),
  label: z.string(),
  dataType: extractionDataType,
  enumValues: z.array(z.string()),
  /** Instruction to the model. */
  description: z.string(),
  requiresQuote: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type ExtractionRule = z.infer<typeof extractionRule>;
export const extractionRulesResponse = z.object({ items: z.array(extractionRule) });

export const extractionRuleBody = z
  .object({
    fieldKey: z
      .string()
      .trim()
      .regex(
        /^[a-z][a-z0-9_]{1,39}$/,
        "Lowercase letters, digits and _; start with a letter (2–40)",
      )
      .refine(
        (k) => !(RESERVED_FIELD_KEYS as readonly string[]).includes(k),
        "That name is used by the core analysis",
      ),
    label: z.string().trim().min(1, "Give it a label").max(80),
    dataType: extractionDataType,
    enumValues: z.array(z.string().trim().min(1).max(60)).max(30),
    description: z
      .string()
      .trim()
      .min(10, "Tell the model what to look for (10+ characters)")
      .max(1000),
    requiresQuote: z.boolean(),
    isActive: z.boolean(),
  })
  .refine((r) => r.dataType !== "enum" || r.enumValues.length >= 2, {
    path: ["enumValues"],
    message: "List at least two values",
  });
export type ExtractionRuleBody = z.infer<typeof extractionRuleBody>;
