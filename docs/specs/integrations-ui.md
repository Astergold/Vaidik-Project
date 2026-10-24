# Integrations UI (D5-I4-03)

## Goal

An admin connects an ERP or any tool without help: create an API key (shown once), subscribe a webhook to the events
they care about, send a test, read the delivery log and replay a failure. Lead sources (Day 3) and the public API docs
are one click away.

## Status

**Screens built against a proposed contract; the API-key and webhook endpoints (D5-I2-01, D5-I2-03) do not exist
yet**, so nothing can be demonstrated end to end. Each section shows "… service not available yet" when the API
answers `404 Route not found`. No data is faked. Contract: `packages/contracts/src/integrations.ts`. The Lead sources
link goes to the live Day-3 page; `/v1/docs` (D5-I2-02) is a plain link — the web app only calls `/api/*`, so it can't
probe it, and the card says the docs ship with the public API.

## Users & stories

- As an admin I create "ERP sync" with `leads:read` + `applications:write`, copy the key once, and later see its prefix,
  scopes and last use; I revoke it and it stops working immediately.
- As an admin I add `https://erp.example.edu/hooks`, tick `lead.created` and `application.updated`, copy the signing
  secret once, press **Send test** and see the delivery succeed (or the status code/error if not).
- As an admin I open a webhook's delivery log, see each attempt (event, status code, attempt no., next retry) and
  **Replay** a failed one. A webhook auto-disabled after 24 h of failures shows a banner with **Re-enable**.

## Endpoints (proposed)

| Call                                                     | Body / response                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/settings/api-keys`                             | → `apiKeysResponse`                                                                      |
| `POST /api/settings/api-keys`                            | `createApiKeyBody` → 201 `createApiKeyResponse` (`secret` once)                          |
| `POST /api/settings/api-keys/:id/revoke`                 | `{}` → `apiKey`                                                                          |
| `GET /api/settings/webhooks`                             | → `webhooksResponse`                                                                     |
| `POST /api/settings/webhooks`                            | `createWebhookBody` (https URL, ≥ 1 event) → 201 `createWebhookResponse` (`secret` once) |
| `PATCH /api/settings/webhooks/:id`                       | `patchWebhookBody` → `webhook`                                                           |
| `DELETE /api/settings/webhooks/:id`                      | → 204                                                                                    |
| `POST /api/settings/webhooks/:id/test`                   | `{}` → `webhookDelivery`                                                                 |
| `GET /api/settings/webhooks/:id/deliveries`              | `?cursor` → `deliveriesResponse` (newest first)                                          |
| `POST /api/settings/webhooks/:id/deliveries/:did/replay` | `{}` → `webhookDelivery`                                                                 |

Scopes: `leads:read | leads:write | applications:write | calls:read | webhooks:manage`. Events: `lead.created`,
`lead.stage_changed`, `call.completed`, `analysis.ready`, `visit.booked`, `visit.attended`, `application.updated`,
`counsellor.requested`. Both kept local to `integrations.ts`. Signature recipe shown in the UI:
`X-Vernacular-Signature = hex(HMAC-SHA256(secret, X-Vernacular-Timestamp + "." + rawBody))`.

## Tables touched

None by the UI. Backend: `api_key`, `webhook_subscription`, `webhook_delivery`.

## Pages

`/settings/integrations` (owner/admin), three sections: **API keys** (table, New key dialog → show-once reveal,
Revoke with confirm), **Webhooks** (cards with events, last delivery, status; Add dialog → show-once secret; Send test;
delivery log sheet with Replay; auto-disabled banner with Re-enable; Delete with confirm), **Other connections**
(Lead sources, API docs).

## Rules & edge cases

- Secrets live only in the reveal component's props: never cached, refetched or shown again; the user must tick
  "I've copied it" before closing.
- Never optimistic: lists update from the server's reply (revoked key shows its `revokedAt`).
- Client validation mirrors the API (name, ≥ 1 scope; https URL, ≥ 1 event).
- 404 "Route not found" → "not available yet"; other errors inline.

## Acceptance (once the API exists)

Handbook D5-I4-03: an admin connects a webhook without help. D5-I2-01: revoked key → 401 immediately. D5-I2-03:
failing endpoint retried on schedule; replay works; signature verifies with the documented recipe.

## Out of scope

The `/v1` API and its docs page (D5-I2-02), editing a key's scopes (revoke and create a new one), rotating a webhook
secret (delete and re-add).
