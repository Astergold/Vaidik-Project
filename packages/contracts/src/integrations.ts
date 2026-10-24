import { z } from "zod";
import { isoDateTime } from "./common.js";

/**
 * Settings → Integrations (D5-I4-03 UI ↔ D5-I2-01 API keys, D5-I2-03 webhooks). PROPOSED CONTRACT — endpoints not
 * built yet. Spec: docs/specs/integrations-ui.md. Roles: owner/admin.
 *
 *   GET    /api/settings/api-keys                          → apiKeysResponse
 *   POST   /api/settings/api-keys                          createApiKeyBody → 201 createApiKeyResponse (secret ONCE)
 *   POST   /api/settings/api-keys/:id/revoke               {} → apiKey (revokedAt set; 401 for that key immediately)
 *   GET    /api/settings/webhooks                          → webhooksResponse
 *   POST   /api/settings/webhooks                          createWebhookBody → 201 createWebhookResponse (secret ONCE)
 *   PATCH  /api/settings/webhooks/:id                      patchWebhookBody → webhook (re-enable, events, url)
 *   DELETE /api/settings/webhooks/:id                      → 204
 *   POST   /api/settings/webhooks/:id/test                 {} → webhookDelivery (a signed `test.ping`)
 *   GET    /api/settings/webhooks/:id/deliveries           ?cursor → deliveriesResponse (newest first)
 *   POST   /api/settings/webhooks/:id/deliveries/:did/replay   {} → webhookDelivery (new attempt)
 *
 * Signing: `X-Vernacular-Signature = hex(HMAC-SHA256(secret, timestamp + "." + rawBody))`, with the timestamp in
 * `X-Vernacular-Timestamp`. Retries 1m, 5m, 30m, 2h, 12h; auto-disabled after 24 h of failures.
 */

export const API_KEY_SCOPES = [
  "leads:read",
  "leads:write",
  "applications:write",
  "calls:read",
  "webhooks:manage",
] as const;
export const apiKeyScope = z.enum(API_KEY_SCOPES);
export type ApiKeyScope = z.infer<typeof apiKeyScope>;

export const apiKey = z.object({
  id: z.uuid(),
  name: z.string(),
  /** The visible start of the key, e.g. "vk_live_3fA9". The rest is never stored in clear. */
  prefix: z.string(),
  scopes: z.array(apiKeyScope),
  createdAt: isoDateTime,
  createdBy: z.string().nullable(),
  lastUsedAt: isoDateTime.nullable(),
  revokedAt: isoDateTime.nullable(),
});
export type ApiKey = z.infer<typeof apiKey>;

export const apiKeysResponse = z.object({ items: z.array(apiKey) });

export const createApiKeyBody = z.object({
  name: z.string().trim().min(1, "Give the key a name").max(80),
  scopes: z.array(apiKeyScope).min(1, "Pick at least one scope"),
});
export type CreateApiKeyBody = z.infer<typeof createApiKeyBody>;

export const createApiKeyResponse = z.object({
  key: apiKey,
  /** The full key. Returned once, never again. */
  secret: z.string().min(16),
});
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponse>;

export const WEBHOOK_EVENTS = [
  "lead.created",
  "lead.stage_changed",
  "call.completed",
  "analysis.ready",
  "visit.booked",
  "visit.attended",
  "application.updated",
  "counsellor.requested",
] as const;
export const webhookEvent = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof webhookEvent>;

export const webhook = z.object({
  id: z.uuid(),
  url: z.url(),
  events: z.array(webhookEvent),
  isActive: z.boolean(),
  /** auto_failing = turned off by us after 24 h of failed deliveries. */
  disabledReason: z.enum(["auto_failing", "manual"]).nullable(),
  disabledAt: isoDateTime.nullable(),
  /** First failure of the current failing streak (null when the last delivery succeeded). */
  failingSince: isoDateTime.nullable(),
  lastDeliveryAt: isoDateTime.nullable(),
  lastStatusCode: z.number().int().nullable(),
  createdAt: isoDateTime,
});
export type Webhook = z.infer<typeof webhook>;

export const webhooksResponse = z.object({ items: z.array(webhook) });

const httpsUrl = z
  .url("Enter a full URL, e.g. https://erp.example.edu/hooks/vernacular")
  .refine((u) => u.startsWith("https://"), "Use an https:// URL");

export const createWebhookBody = z.object({
  url: httpsUrl,
  events: z.array(webhookEvent).min(1, "Pick at least one event"),
});
export type CreateWebhookBody = z.infer<typeof createWebhookBody>;

export const createWebhookResponse = z.object({
  webhook,
  /** Signing secret. Returned once, never again. */
  secret: z.string().min(16),
});
export type CreateWebhookResponse = z.infer<typeof createWebhookResponse>;

export const patchWebhookBody = z.object({
  url: httpsUrl.optional(),
  events: z.array(webhookEvent).min(1, "Pick at least one event").optional(),
  isActive: z.boolean().optional(),
});

export const DELIVERY_STATUSES = ["pending", "retrying", "succeeded", "failed"] as const;
export const webhookDelivery = z.object({
  id: z.uuid(),
  /** A WEBHOOK_EVENTS value, or "test.ping". */
  event: z.string(),
  status: z.enum(DELIVERY_STATUSES),
  attempt: z.number().int().min(1),
  statusCode: z.number().int().nullable(),
  /** Short, human reason ("Timed out after 10 s", "HTTP 500"). */
  error: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  nextRetryAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type WebhookDelivery = z.infer<typeof webhookDelivery>;

export const deliveriesResponse = z.object({
  items: z.array(webhookDelivery),
  nextCursor: z.string().nullable(),
});
export type DeliveriesResponse = z.infer<typeof deliveriesResponse>;
