# Campaigns: created in the CRM, mirrored to the calling platform

Campaigns are created **only** in the CRM (`/campaigns/new`). Each CRM campaign is mirrored to the calling
platform's own campaign feature, which places the calls. The CRM owns membership, stages and assignment; the
platform owns dialling, retries, schedule enforcement, concurrency and the circuit breaker.

## Flow

| Step | Where | What happens |
| --- | --- | --- |
| Create | `POST /api/campaigns` | Draft row. Workflow + telephony configuration are checked against the platform; the workflow name is stored. |
| Start | `POST /api/campaigns/:id/start` | Status `running` + `campaign.start` job in the same transaction. |
| Snapshot | `campaign.start` → `prepareWave` | Matching leads (same filter function as `GET /api/leads`), not closed, not in another active campaign → `campaign_lead` rows with `wave_no` = position / `batch_size`. Once only. |
| Policy | `prepareWave` | Every lead of the next wave goes through `policy.evaluate("dial")`. Suppressed / NDNC / no consent / call in progress → `skipped` + `skip_reason` (shown on the lead as `last_reject_code`). Wallet empty / tenant suspended → campaign paused with a message. Time-based codes (window, gap, daily cap) are not skips: the platform schedule decides when. |
| Reserve | `prepareWave` | One `call_attempt` per callable lead, `status='dialing'`, `dial_trigger='campaign'`. The one-active-call-per-lead index makes any ad-hoc dial of that lead skip. Stage → `attempting`. |
| Push | `pushWave` | CSV (`phone_number, lead_id, call_attempt_id, crm_campaign_id, person_name, program, language`) → presigned upload → `POST /api/v1/campaign/create` → start. The platform exposes the columns to the workflow as `{{initial_context.*}}`. |
| Sync | `campaign.sync` every 20 s | Platform campaign state + runs → `call_attempt` (run id, status, duration, disposition), `campaign_lead`, stage `connected` when talk > 15 s. A finished wave dispatches the next; all members terminal → `completed`. |
| Pause / resume / stop | `campaign.control` | Applied to the live platform campaign(s). Stop = pause on the platform (it has no stop), collect results, release everyone not called. |

Platform endpoints used (verified against `<base>/api/v1/openapi.json` on 2026-10-24):
`GET workflow/fetch`, `GET organizations/telephony-configs`, `GET organizations/campaign-defaults`,
`POST s3/presigned-upload-url` + PUT, `POST campaign/create`, `GET campaign/`, `GET campaign/{id}`,
`POST campaign/{id}/start|pause|resume`, `GET campaign/{id}/runs`. Auth header `X-API-Key`.

## Crash safety

- Snapshot and reservation are one transaction with the campaign row locked: re-running never adds a lead twice.
- The platform campaign id is saved **before** start; a retry starts the same campaign.
- If the worker dies between create and save, recovery looks the campaign up by its stable name
  `"<name> · wave <n> [<last 8 of campaign id>]"` before creating anything.
- A platform 4xx fails the wave (calls released with `reject_code = PLATFORM_REJECTED`) and pauses the campaign
  with the message; 5xx / timeouts retry with backoff and show the message on the campaign page meanwhile.

## Settings → platform fields

| CRM | Platform |
| --- | --- |
| `workflowId`, `telephonyConfigId` | `workflow_id`, `telephony_configuration_id` (null = default outbound) |
| `maxConcurrent` (null = default 3) | `max_concurrency` (org limit always applies) |
| `retry.*` | `retry_config.*` |
| `circuitBreaker.failureThresholdPct` | `circuit_breaker.failure_threshold` (fraction) |
| schedule | `schedule_config`, ALWAYS sent: tenant calling hours ∩ campaign schedule (when on), tenant timezone, weekday 0 = Monday |

## Roles

Read: every role. Create / edit / start / pause / resume / stop and `GET /api/campaigns/platform-options`:
owner, admin, admission head (super-admin always). Counsellors get 403.

## Known limitations

- Call analysis (transcript, classification, counsellor queue) still comes from the existing webhook/analysis
  path; campaign sync only records call outcome, duration and the `connected` stage.
- No UI yet to store a tenant's own platform key (`tenant_secret` kind `dograh_api_key`); dev/staging use the
  global `DOGRAH_PLATFORM_KEY`. Production refuses the global key.
- Retries happen on the platform (its retry config), so a retry attempt is not re-checked by the CRM policy
  engine; the schedule sent always stays inside the tenant calling window.
