# Day 3 handoff from I2 (Backend core)

Builds on `day1-handoff.md` and `day2-handoff.md`. Tested on a real Postgres: **policy 58 tests (100% coverage), contracts 37,
db 38, api 258**. 14 deliberate bugs were injected into the new code and every one was caught by a test.

## What is new

| Capability                                                     | Where                                            | Spec             |
| -------------------------------------------------------------- | ------------------------------------------------ | ---------------- |
| Policy engine (10 rules)                                       | `packages/policy`                                | policy-engine.md |
| Policy facts loader, `previewDial`                             | `apps/api/src/modules/policy/facts.ts`           | policy-engine.md |
| Intake endpoint (public)                                       | `POST /api/intake/:sourceKey`                    | intake.md        |
| Lead sources settings (CRUD, token once, rotate, test-mapping) | `/api/settings/sources…`                         | intake.md        |
| Reserve-then-dial job `call.dial`                              | `modules/calls/dial.ts`                          | dial-job.md      |
| `VoiceDialer` port + `FakeDialer`                              | `modules/calls/dialer.ts`                        | dial-job.md      |
| `buildInitialContext`                                          | `modules/calls/context.ts`                       | dial-job.md      |
| `moveStage` (shared stage mover)                               | `modules/leads/stage.ts`                         | AGENTS.md        |
| Lead 360 header, timeline, PATCH, notes, call-now              | `/api/leads/:id…`                                | below            |
| Dashboard aggregates                                           | `GET /api/dashboard`                             | below            |
| Policy + holiday settings                                      | `/api/settings/policy`, `/api/settings/holidays` | below            |
| Shared phone/email normalisation                               | `@vernacular/contracts`                          | intake.md        |
| Migration                                                      | `20261007000100_call_attempt_dial_job.sql`       | data-model.md    |

Measured: intake p95 **17 ms**; submit → call placed **~0.5 s** (first call after a cold worker ~2.6 s) against the 30 s budget.

## I4 — Frontend (Day 3 tasks are unblocked)

Contracts (all in `@vernacular/contracts`): `leadDetail`, `timelineResponse`/`timelineEvent`, `patchLeadBody`, `addNoteBody`,
`callNowResponse`, `dashboardQuery`/`dashboardResponse`, `leadSource`/`createSourceBody`/`createSourceResponse`/`testMappingBody`,
`policySettings`/`policySettingsBody`/`holiday`. Parse every response with them.

- **Lead 360** `GET /api/leads/:id` (header, identifiers masked for counsellors, `lastRejectCode`) and `GET /api/leads/:id/timeline?limit&cursor`
  (events `call | stage_change | note | temperature`, newest first; pass `nextCursor` back verbatim). A call event has `callId`,
  `hasRecording`, `hasTranscript`; the audio/transcript endpoints are I3/I1's (`/api/calls/:id…`).
- **Actions**: `PATCH /api/leads/:id` (stage needs `reason`; an open lead needs a next step: 422 `REASON_REQUIRED` / `NEXT_STEP_REQUIRED`;
  owner change is manager-only: 403 `ONLY_MANAGERS_CAN_REASSIGN`), `POST /api/leads/:id/notes`.
- **Call now** `POST /api/leads/:id/call-now` → **always 200** `{ queued: true }` or `{ queued: false, rejection: { code, retryAt? } }`.
  A blocked call is _not_ an HTTP error: show `rejection.code` (e.g. `OUTSIDE_WINDOW` with `retryAt`). 409 `LEAD_CLOSED` if the lead is enrolled/lost/invalid.
  A double click is one call. "Schedule callback" is Day 4 (tasks).
- **Dashboard** `GET /api/dashboard?from&to&agentId&sourceId` (owner/admin/head; counsellors get 403). Dates are **local dates in the
  tenant timezone**, default last 30 days. Funnel always lists all 11 stages in order; `connectRate`/`avgDurationS` are `null` when there are no calls.
- **Lead sources UI** (`/api/settings/sources`): create returns `token` **once** (+ `endpointUrl`); list never returns it (`hasToken`).
  `POST …/test-mapping` powers the "test payload" box (nothing is written). View: owner/admin/head. Edit: owner/admin.
- **Policy** `GET/PUT /api/settings/policy` (PUT replaces everything; times `HH:MM`, days 1=Mon…7=Sun, window end exclusive) and
  `/api/settings/holidays`. View: owner/admin/head. Edit: owner/admin. Takes effect on the very next dial.
- Dropdown data for the leads filters (sources, agents, counsellors) is still not served by one endpoint: sources are in
  `GET /api/settings/sources` (head+); agents/counsellors come with Day 4. Tell me if you want `GET /api/leads/filters` sooner.

## I3 — Integrations (these affect your Day 3 tasks)

Read `dial-job.md` → "The contract with I3". The essentials:

1. **Implement `VoiceDialer`** and swap it into `apps/worker/src/index.ts`. Use `DialerError(code, msg, retryable)`.
2. **Use `normalizePhone`/`normalizeEmail` from `@vernacular/contracts`** in derive/finalize/inbound-context/CSV import. If your Day 2
   derive job has its own normaliser, replace it now, or the same student can become two persons. Reconcile before backfill runs on real data.
3. **Link runs to attempts**: our attempt id is in `initial_context.call_attempt_id`; adopt the reserved/dialing attempt, don't insert a second.
4. **`moveStage(..., mode: "auto")`** for New → Attempting → Connected in finalize (we already do New → Attempting at reserve time).
5. Fill **both** `transcript` and `transcript_text` (the quote triggers read the text).
6. For inbound-context (D3-I3-05): use `buildInitialContext(tx, leadId, { isNewCaller })`; for unknown callers create the person/lead
   through `ingestLead` (`modules/intake/service.ts`, source kind `inbound_call`) so dedupe/consent/dial rules stay identical.
7. **Idempotency-Key** support in the provider (D1-V-05) is what makes resume-after-crash safe. Please confirm it is deployed.
8. CSV import (D3-I3-03) can call `ingestLead` per row with a `csv` source; row errors map to its 422 `details`.

## I1 — Platform / DevOps

- New worker dependency: **`DIAL_MODE=fake`** (dev/staging only) uses an in-memory dialer so the full path runs without a provider.
  Production must not set it (it would pretend calls were placed). Without it the worker uses `UnconfiguredDialer` and fails dials
  with `PROVIDER_NOT_CONFIGURED` until I3's adapter is wired.
- `jobs:install` now creates the `call.dial` queue (60 s expiry, 5 retries, 15 s backoff). Run it on every deploy, as before.
- Latency script (D3-I1-03): submit → `call_attempt.status = 'dialing'`. Use `POST /api/intake/:sourceKey` with a source created via
  the settings API; `dial_trigger = 'intake'`. My in-repo measurement is `apps/api/test/intake.test.ts` ("speed").
- `/api/intake/*` is public and token-authenticated: keep it routed through Caddy like the rest of `/api/*`.

## Vaidik — decisions and risks (please read these two)

1. **NDNC will block every new lead by default.** `ndnc_check` is ON and an unscrubbed number is `NDNC_UNKNOWN` → no call. Before
   MIT-ADT go-live either (a) upload a scrub file for leads (D3-I1-04), or (b) set `ndnc_check = false` for the tenant pending legal.
   I did not change the handbook default. See policy-engine.md.
2. **Exactly-once needs the provider's idempotency.** The CRM guarantees one reservation and one idempotency key per call; the
   provider must dedupe on that key (D1-V-05). Until it is deployed, a crash in the narrow window "provider placed the call, we
   didn't record it" can produce a second call on resume.
3. Smaller calls I made (all documented): WhatsApp window/NDNC rules (policy-engine.md §decisions); form-submit consent covers
   **voice only** unless the source says otherwise; intake tokens use SHA-256, not argon2 (high-entropy tokens); a duplicate form
   submission never re-dials.

## Known gaps (not done on Day 3)

- Wallet/plan checks are a seam (`loadWalletState` returns unmetered) → D6.
- No sweeper for attempts left `reserved` after a dead-lettered job, and no recurring-job registry → needed before D7 chaos test.
- Redelivery after a real worker kill (60 s expiry) is configured but only simulated in tests; verify on staging.
- `GET /api/calls/:id`, recordings, campaigns, CSV import, inbound-context are I3/I1's; not touched.
