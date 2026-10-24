import { z } from "zod";
import { isoDateTime } from "./common.js";
import { suppressionReason } from "./enums.js";
import { policyRejectCode } from "./policy.js";

/**
 * WhatsApp messaging (D5-I4-02 UI ↔ D5-I3-01..04 backend). PROPOSED CONTRACT — the endpoints don't exist yet.
 * Spec: docs/specs/whatsapp-ui.md.
 *
 *   GET  /api/leads/:id/messages      ?cursor → leadMessagesResponse            any role with access to the lead
 *   POST /api/messages                sendMessageBody → sendMessageResponse     any role with access to the lead
 *   GET  /api/whatsapp/templates      ?leadId&language → templatesResponse      (approved only; leadId fills defaults)
 *   GET  /api/settings/whatsapp       → whatsappSettings                        owner/admin
 *   PUT  /api/settings/whatsapp       putWhatsappSettingsBody → whatsappSettings owner/admin
 *
 * Every send goes through the `whatsapp.send` job and the policy engine (consent, suppression, wallet). A policy block
 * is not an HTTP error: `sendMessageResponse.rejection` carries the typed code, like POST /api/leads/:id/call-now.
 */

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
/** queued = accepted by us, not yet handed to WhatsApp. Kept local (not enums.ts) until the API ships. */
export const MESSAGE_STATUSES = ["queued", "sent", "delivered", "read", "failed"] as const;
export const messageStatus = z.enum(MESSAGE_STATUSES);
export type MessageStatus = z.infer<typeof messageStatus>;

export const whatsappMessage = z.object({
  id: z.uuid(),
  direction: z.enum(MESSAGE_DIRECTIONS),
  /** Inbound messages are always "delivered"/"read" from our side; status matters for outbound. */
  status: messageStatus,
  kind: z.enum(["template", "text"]),
  /** Final text as sent/received (template variables already filled in). */
  body: z.string(),
  template: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Outbound only: who sent it. */
  sentBy: z
    .object({ kind: z.enum(["user", "ai", "system"]), name: z.string().nullable() })
    .nullable(),
  /** Human-readable reason when status = failed (never a provider error dump). */
  failureReason: z.string().nullable(),
  createdAt: isoDateTime,
  /** When the current status was reached. */
  statusAt: isoDateTime.nullable(),
});
export type WhatsappMessage = z.infer<typeof whatsappMessage>;

export const leadMessagesResponse = z.object({
  /** Oldest first. `nextCursor` loads older messages. */
  items: z.array(whatsappMessage),
  nextCursor: z.string().nullable(),
  /**
   * Free text is allowed only within 24 h of the student's last inbound message. The SERVER decides (its clock):
   * `freeTextAllowed` is computed at response time; `freeTextWindowEndsAt` is for display. The UI never computes it.
   */
  freeTextAllowed: z.boolean(),
  freeTextWindowEndsAt: isoDateTime.nullable(),
  /** Set when the number is suppressed (e.g. the student replied STOP). Sends will be rejected with SUPPRESSED. */
  suppression: z.object({ reason: suppressionReason, since: isoDateTime }).nullable(),
});
export type LeadMessagesResponse = z.infer<typeof leadMessagesResponse>;

/** Lead fields a template variable can be filled from (resolved by the server per lead). */
export const TEMPLATE_VARIABLE_FIELDS = [
  "full_name",
  "first_name",
  "program",
  "counsellor_name",
  "institution_name",
  "visit_date",
  "tracked_link",
] as const;
export const templateVariableField = z.enum(TEMPLATE_VARIABLE_FIELDS);
export type TemplateVariableField = z.infer<typeof templateVariableField>;

export const templateVariable = z.object({
  /** The placeholder key: "1" for {{1}}. */
  key: z.string().regex(/^\d{1,2}$/),
  label: z.string(),
  /** Mapped lead field (Settings → WhatsApp), or null = typed by the sender. */
  field: templateVariableField.nullable(),
  /** With `?leadId=`: the mapped field's value for that lead, as a starting point. */
  defaultValue: z.string().nullable(),
});
export type TemplateVariable = z.infer<typeof templateVariable>;

export const TEMPLATE_STATUSES = ["approved", "pending", "rejected", "paused"] as const;

export const whatsappTemplate = z.object({
  id: z.uuid(),
  name: z.string(),
  /** BCP-47-ish code: "en", "hi", "mr". */
  language: z.string(),
  category: z.enum(["utility", "marketing", "authentication"]),
  /** Body with {{1}}, {{2}} placeholders. */
  body: z.string(),
  variables: z.array(templateVariable),
  status: z.enum(TEMPLATE_STATUSES),
});
export type WhatsappTemplate = z.infer<typeof whatsappTemplate>;

export const templatesResponse = z.object({
  items: z.array(whatsappTemplate),
  syncedAt: isoDateTime.nullable(),
});
export type TemplatesResponse = z.infer<typeof templatesResponse>;

export const sendMessageBody = z.discriminatedUnion("kind", [
  z.object({
    leadId: z.uuid(),
    kind: z.literal("template"),
    templateId: z.uuid(),
    /** key → value for every template variable. */
    variables: z.record(z.string(), z.string().trim().min(1, "Fill in every variable").max(1000)),
  }),
  z.object({
    leadId: z.uuid(),
    kind: z.literal("text"),
    text: z.string().trim().min(1, "Write a message").max(4096),
  }),
]);
export type SendMessageBody = z.infer<typeof sendMessageBody>;

export const sendMessageResponse = z.object({
  /** The queued message, or null when the policy engine blocked it. */
  message: whatsappMessage.nullable(),
  rejection: z.object({ code: policyRejectCode, retryAt: isoDateTime.optional() }).optional(),
});
export type SendMessageResponse = z.infer<typeof sendMessageResponse>;

/* ---- Settings → WhatsApp ---- */

export const whatsappSettings = z.object({
  status: z.enum(["connected", "not_connected", "error"]),
  /** Display name students see. */
  senderName: z.string().nullable(),
  /** The business number, as registered (display only). */
  senderNumber: z.string().nullable(),
  /** Whether a provider key is stored (the key itself is never returned). */
  hasApiKey: z.boolean(),
  lastSyncedAt: isoDateTime.nullable(),
  /** All synced templates, any status, with their variable → field mapping. */
  templates: z.array(whatsappTemplate),
});
export type WhatsappSettings = z.infer<typeof whatsappSettings>;

export const putWhatsappSettingsBody = z.object({
  senderName: z.string().trim().min(1, "Enter a sender name").max(100),
  /** Write-only; omit to keep the stored key. */
  apiKey: z.string().trim().min(8).max(500).optional(),
  variableMappings: z.array(
    z.object({ templateId: z.uuid(), key: z.string(), field: templateVariableField.nullable() }),
  ),
});
export type PutWhatsappSettingsBody = z.infer<typeof putWhatsappSettingsBody>;
