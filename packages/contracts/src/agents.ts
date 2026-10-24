import { z } from "zod";

/**
 * AI agents (D4-I4-04 UI ↔ D4-I2-02 backend). PROPOSED CONTRACT — endpoints not built yet.
 * Spec: docs/specs/ai-agents-ui.md.
 *
 *   GET   /api/agents                    → agentsListResponse
 *   POST  /api/agents                    createAgentBody → 201 agent
 *   PATCH /api/agents/:id                patchAgentBody → agent
 *   PUT   /api/agents/:id/counsellors    putAgentCounsellorsBody → agent
 *   GET   /api/agents/workflows          → workflowOptionsResponse
 *
 * White-label: the provider's workflow id is internal only (see the ai_agent migration) and is NOT part of
 * any shape here. Workflows are picked through an opaque option id the server maps.
 */
export const agent = z
  .object({
    id: z.uuid(),
    /** Tenant-facing name, e.g. "Asha (English)". */
    displayName: z.string(),
    /** BCP-47-ish language code, e.g. "en", "hi", "mr". */
    language: z.string(),
    voice: z.string().nullable(),
    isActive: z.boolean(),
    counsellors: z.array(z.object({ id: z.uuid(), name: z.string() })),
  })
  .strict();
export type Agent = z.infer<typeof agent>;

export const agentsListResponse = z.object({ items: z.array(agent) });

/** A voice workflow template the tenant may use. `label` is sanitised server-side (no provider names). */
export const workflowOption = z.object({ id: z.string().min(1), label: z.string() }).strict();
export type WorkflowOption = z.infer<typeof workflowOption>;
export const workflowOptionsResponse = z.object({ items: z.array(workflowOption) });

const displayName = z.string().trim().min(1, "Give the agent a name").max(80);
const language = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, "Choose a language");

export const createAgentBody = z.object({
  displayName,
  language,
  voice: z.string().trim().max(80).optional(),
  workflowOptionId: z.string().min(1, "Choose a voice workflow template"),
  isActive: z.boolean().default(true),
});
export type CreateAgentBody = z.infer<typeof createAgentBody>;

export const patchAgentBody = z
  .object({
    displayName,
    language,
    voice: z.string().trim().max(80).nullable(),
    workflowOptionId: z.string().min(1),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change" });
export type PatchAgentBody = z.infer<typeof patchAgentBody>;

export const putAgentCounsellorsBody = z.object({ counsellorIds: z.array(z.uuid()).max(200) });
