# Campaigns UI (D3-I4-04)

## Goal

Owners, admins and admission heads run outbound AI-calling campaigns: pick an AI agent and a set of leads, set when
and how much to call, start / pause / stop, and watch progress. The UI never places calls: starting a campaign asks the
server to enqueue `call.dial` jobs, and every dial still passes the policy engine.

## Status

**Screens built against a proposed contract; the campaigns API (D3-I3-04) does not exist yet**, so nothing can be
demonstrated end to end. Every screen shows "Campaign service not available yet" when the API answers
`404 Route not found`. No data is faked. Contract: `packages/contracts/src/campaigns.ts` — the backend implements to it
or changes it there in the same PR as the UI.

## Users & stories

- As an admission head I create a campaign for all _Interested_ leads from the website, called by "Asha (English)"
  on weekdays 10:00–18:00, at most 200 calls a day, and see how many leads match before I start.
- As an admin I pause a running campaign at lunchtime and resume it later; I stop it when the intake is over.
- As a manager I open a running campaign and see dialled / connected / failed numbers update without reloading.

## Endpoints (proposed)

| Call                                                 | Body / response                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/campaigns`                                 | → `campaignsListResponse` (`items[]` with `progress`)                        |
| `POST /api/campaigns`                                | `createCampaignBody` → 201 `campaign` (status `draft`)                       |
| `GET /api/campaigns/:id`                             | → `campaign` (detail + progress)                                             |
| `PATCH /api/campaigns/:id`                           | `patchCampaignBody` → `campaign`; 409 `CAMPAIGN_RUNNING` unless draft/paused |
| `POST /api/campaigns/:id/start` · `/pause` · `/stop` | `{}` → `campaign` with the new status; 409 `INVALID_TRANSITION`              |

Roles: owner/admin/admission_head (the sitemap's Campaigns roles).

Shapes (camelCase):

- `status`: `draft | running | paused | stopped | completed` — the same values as the `crm.campaign.status` CHECK.
  Kept local to `campaigns.ts` (not `enums.ts`) until the campaigns API ships with its tests.
- `leadFilter`: the Leads-list filter vocabulary, stored as arrays: `stage[]`, `temperature[]`, `sourceId[]`,
  `counsellorId[]`, `createdFrom`, `createdTo` (YYYY-MM-DD, tenant-local). Same meaning as `GET /api/leads`.
- `schedule`: `days` (ISO 1 = Mon … 7 = Sun, ≥ 1), `windowStart` / `windowEnd` (`HH:MM`, tenant timezone, end exclusive,
  start < end). The tenant's calling policy still applies on top (a campaign can narrow the window, never widen it).
- `dailyCap` (calls per day, ≥ 1), `maxConcurrent` (1–50, default 5 like the column).
- `progress`: `{ total, dialed, connected, failed, pending }` — derived by the server from `call_attempt` rows with
  this `campaign_id` (`total` = leads matched at start).

## Pages

- `/campaigns` — list: name, agent, status, progress bar (dialled of total), connected, daily cap. Empty, loading,
  error, not-available states.
- `/campaigns/new`, `/campaigns/$id/edit` — one form: name, AI agent (options from `GET /api/leads/filters`), the lead
  filter (the Leads list's filter components and options), schedule (days + window, labelled with the tenant
  timezone), daily cap, max concurrent. Shows **how many leads match right now** via `GET /api/leads?…&pageSize=1`
  (real data, the existing endpoint). Edit is refused (with an explanation) while running/stopped/completed.
- `/campaigns/$id` — detail: settings summary, progress (polled every 5 s while running; paused while the tab is
  hidden; stops when the campaign stops), and the actions for its status.

## Rules

- Actions per status: draft → Start · Edit; running → Pause · Stop; paused → Resume · Stop · Edit; stopped / completed → none.
- Start and Stop ask for confirmation (inline panel: what will happen, Confirm / Cancel). Pause doesn't.
- After an action the page shows the status **the server returned**, never an optimistic one.
- Client validation mirrors the API: name required, agent required, ≥ 1 day, window start before end, daily cap ≥ 1,
  max concurrent 1–50.
- 404 "Route not found" → "Campaign service not available yet"; 404 for a record → "Campaign not found".

## Acceptance (once the API exists)

Handbook D3-I3-04: a campaign of 50 leads dials only inside the window, max N concurrent, progress accurate. UI:
list/detail/new/edit at 1440 and 390 px, start/pause/stop with confirmation and server status, live progress.

## Out of scope

Waves/throttling logic (server), campaign analytics beyond the progress counts, "add to campaign" from imports, cloning.
