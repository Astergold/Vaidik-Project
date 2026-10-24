# WhatsApp UI (D5-I4-02)

## Goal

Counsellors and managers talk to a lead on WhatsApp from Lead 360: see the conversation with delivery ticks, send an
approved template with its variables previewed live, and send free text only while WhatsApp's 24-hour window is open.
Owners/admins set the sender and map template variables to lead fields. Every send still passes the policy engine.

## Status

**Screens built against a proposed contract; the WhatsApp API (D5-I3-01..04) does not exist yet**, so nothing can be
demonstrated end to end (handbook acceptance is against `FakeProvider` on staging). Every screen shows "WhatsApp
service not available yet" when the API answers `404 Route not found`. No data is faked. Contract:
`packages/contracts/src/messaging.ts` — the backend implements to it or changes it there in the same PR as the UI.

## Users & stories

- As a counsellor I open a lead's **Conversation** tab and see inbound/outbound bubbles, time, and ✓ sent / ✓✓
  delivered / blue ✓✓ read / failed (with the reason).
- As a counsellor I send the "Visit reminder" template: pick it, see each variable pre-filled from the lead (name,
  program, tracked link), edit any, watch the preview update, send.
- As a counsellor I reply in free text while the student wrote in the last 24 h; afterwards the box is disabled and
  tells me to send a template.
- As anyone I see a **STOP** badge when the student opted out, and sending is disabled.
- As an admin I set the sender name (and key, write-only), see synced templates with their approval status, and map
  each template variable to a lead field.

## Endpoints (proposed)

| Call                          | Body / response                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/leads/:id/messages` | → `leadMessagesResponse` (`items` oldest first, `nextCursor` older, `freeTextAllowed`, `freeTextWindowEndsAt`, `suppression`) |
| `POST /api/messages`          | `sendMessageBody` (template + variables, or text) → `sendMessageResponse` (`message` or `rejection`)                          |
| `GET /api/whatsapp/templates` | `?leadId&language` → `templatesResponse` (approved only; `defaultValue` per variable for that lead)                           |
| `GET /api/settings/whatsapp`  | → `whatsappSettings` (owner/admin)                                                                                            |
| `PUT /api/settings/whatsapp`  | `putWhatsappSettingsBody` (sender name, write-only key, variable mappings) → `whatsappSettings`                               |

Message and template status unions are local to `messaging.ts`. A policy block (`SUPPRESSED`, `NO_CONSENT`,
`WALLET_EMPTY`, …) comes back as `rejection` with HTTP 200 — the same pattern as `POST /api/leads/:id/call-now`.

## Tables touched

None by the UI. Backend: `whatsapp_template`, `whatsapp_message`, `suppression`, `consent_record`, `usage_event`.

## Pages

- Lead 360: tabs **Timeline | Conversation** (keyboard tabs). Conversation polls every 15 s while visible so ticks and
  replies appear without reload; "Load older" pages back.
- Send template dialog: template select (approved, filtered by language), variables form, live preview, Send.
- Composer: enabled only when `freeTextAllowed` is true (server clock); shows "Window closes …" from
  `freeTextWindowEndsAt`; disabled with a notice otherwise, or when `suppression` is set.
- `/settings/whatsapp` (owner/admin): connection status, sender name, API key (write-only, "stored" badge), templates
  table with status, variable → lead field selects; Save sends one PUT.

## Rules & edge cases

- Never optimistic: a sent message appears when the server returns it (status `queued`), then ticks update by polling.
- The UI never decides whether sending is allowed: the server's `freeTextAllowed`/`suppression` gate the controls,
  and the policy engine decides on send; rejections show the typed code with its explanation.
- Template preview is rendered client-side from the template body and the typed values (text only, no HTML).
- No provider names, ids or raw errors are shown (`failureReason` is a human sentence from the server).

## Acceptance (once the API exists)

Handbook D5-I4-02: flows work against `FakeProvider` on staging. D5-I3-03: inbound reply appears on Lead 360; `STOP`
blocks future sends and calls. D5-I3-04: templates selectable in UI with variable preview.

## Out of scope

Media messages, broadcast/bulk WhatsApp, template creation (templates are approved with the provider and synced).
