# Ayush — Tasks + Manual Testing Guide

Branch: `Ayush_working` (from `main` @ `9821b53`).
Source: `docs/vernacular_ai_crm_7_day_build_handbook.md` (v1.0, 1211 lines, read end-to-end).
Handoffs already done: `docs/specs/day1-handoff.md`, `day2-handoff.md`, `day3-handoff.md`.

## Where you are

Done in code (tested on real Postgres, do NOT rebuild):

- Day 1 I2: monorepo, CI, `AGENTS.md`, schema v1 + RLS (`packages/db/migrations/20261006*.sql`)
- Day 2 I2: Fastify skeleton (`apps/api/src/server.ts`), Better Auth, tenant plugin (`plugins/tenant.ts`), guards, `GET /api/me`, `GET /api/leads`, pg-boss jobs, secrets, seed
- Day 3 I2: policy engine (`packages/policy`), intake `POST /api/intake/:sourceKey`, `call.dial` (`modules/calls/dial.ts`, `dialer.ts`, `context.ts`), `moveStage`, Lead 360 APIs, dashboard, policy/holiday settings

`apps/web` is still a placeholder (`package.json` only). `apps/worker/src/index.ts` uses `FakeDialer` only when `DIAL_MODE=fake`, else `UnconfiguredDialer`. Wallet check is a stub (`loadWalletState` unmetered). No recurring-job registry, no reserved-attempt sweeper.

Seed logins (password = `SEED_PASSWORD` in `.env`): `owner@mit-adt.local`, `head@mit-adt.local`, `c1@mit-adt.local`, `c2@mit-adt.local`, `admin@laveric.local`.

## Framework — two categories (applies to every Day)

Every task in the 7-day sprint is one of:

- **[MANUAL] Manual / Ops & Discovery** — human does it: rotate keys, provision R2/SES/YesBoss, SSH + `docker stats`, Postman/`curl` spikes, save fixtures (mask phones), review PRs, run backfills/load/chaos/DR, execute cutover, verify checkpoints. No code generation.
- **[AI-PROMPT] AI-Prompted Codebase** — write `docs/specs/<module>.md` first (≤20 min), then prompt `opencode` / Amazon Q with the 5-part recipe to generate code/SQL/tests.

### Spec-first rule (before ANY [AI-PROMPT] task)

Spend ≤20 min writing `docs/specs/<module>.md`:
Goal (2 lines) · Users & stories · Endpoints/jobs/pages (method, path, req/res JSON, errors) · Tables touched · Rules & edge cases (dupes, out-of-order, TZ, perms) · Acceptance tests (from handbook) · Out of scope.

### Prompt recipe (paste into every code prompt)

1. **Goal** — one sentence + task ID, e.g. `D3-I2-02: build POST /api/intake/:source ...`
2. **Read first** — exact files: `AGENTS.md`, `docs/specs/<module>.md`, pattern module (`apps/api/src/modules/leads/*`), latest migration, `packages/contracts/<x>.ts`
3. **Constraints** — relevant NEVER items + task ones (`ON CONFLICT` dedupe, <300ms, no external calls, `req.tx` only, `enqueueInTx` only)
4. **Acceptance tests** — paste `Done when` column; ask for tests first
5. **Plan first** — `Show plan + files to create/change. Do not write code until I say go.`

Working loop: spec → prompt → review plan → tests first → run tests yourself → self-review vs NEVER → manual curl/browser check below → PR (task ID in title, screenshots for UI, migration y/n, tenant-scope y/n).

## How to use this file

Each task below is tagged **[MANUAL]** or **[AI-PROMPT]** and ends with a **Manual test** you run yourself. Never trust "tests pass" in chat.

Rule: [AI-PROMPT] → `pnpm typecheck + test for that package` → Manual test → tick. [MANUAL] → do it in terminal/VPS/Vercel/R2 → paste evidence (curl output, screenshot, log) → tick.

## Phase 0 — Setup + prove Day 1–3 works (do first, ~2 hrs)

> Retrospective: Day 1 [MANUAL] (D1-V-01…03 secret rotation, Git host, R2/SES/LLM/YesBoss/DNS; D1-I1-01 VPS audit → `docs/ops/vps.md`; D1-V-04+D1-I3-01 Dograh spikes → `packages/integrations/dograh/fixtures/`; D1-I1-06 R2 buckets; D1-I3-03 old `adapters.ts` review; D1-I3-04 YesBoss/portal docs) and Day 1–3 [AI-PROMPT] (monorepo, AGENTS.md, data-model spec, CI, schema v1+RLS, Dograh contract spec, Compose, Caddy, backups, monitoring, web move, theme, shell, deploy pipeline, storage, logging, Fastify plugins, auth, guards, pg-boss, secrets, seed, adapter, sync/derive/webhook/backfill, API client, auth pages, leads list, policy, intake, dial, lead APIs, finalize, archive, inbound-context, CSV, campaigns, recording endpoint, Playwright, latency script, NDNC, Lead 360, dashboard, sources/CSV/campaign UI) are DONE per handoffs. Below only re-verifies them; do not rebuild.

### 0.1 Local stack up [MANUAL]

**Code:** none.
**Manual:**

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm jobs:install
pnpm db:seed
pnpm dev
# api :3001, web :3000 (placeholder ok)
curl http://localhost:3001/health
curl http://localhost:3001/health/ready
```

**Done when:** both return `{"ok":true...}`, seed prints MIT-ADT + 14 leads.

### 0.2 Login + leads list (Day 2) [MANUAL]

**Manual:**

```bash
# login, save cookie
curl -c jar.txt -H "Content-Type: application/json" -d "{\"email\":\"owner@mit-adt.local\",\"password\":\"<SEED_PASSWORD>\"}" http://localhost:3001/api/auth/sign-in/email
curl -b jar.txt http://localhost:3001/api/me
curl -b jar.txt "http://localhost:3001/api/leads?page=1&pageSize=5"
# counsellor sees masked phones:
curl -c c1jar.txt -H "Content-Type: application/json" -d "{\"email\":\"c1@mit-adt.local\",\"password\":\"<SEED_PASSWORD>\"}" http://localhost:3001/api/auth/sign-in/email
curl -b c1jar.txt "http://localhost:3001/api/leads?page=1&pageSize=2"
# logged-out = 401, counsellor on dashboard = 403:
curl http://localhost:3001/api/me -i
curl -b c1jar.txt http://localhost:3001/api/dashboard -i
```

**Done when:** 401 logged-out, 403 counsellor-dashboard, phones like `••••••1234` for c1.

### 0.3 Intake → policy → dial (Day 3, `DIAL_MODE=fake`) [MANUAL]

**Code:** none (uses `day3-handoff.md` contract).
**Manual:**

```bash
# create source as owner, copy token (shown once)
# POST /api/settings/sources, then:
curl -H "Authorization: Bearer <SOURCE_TOKEN>" -H "Content-Type: application/json" -d "{\"fullName\":\"Test Student\",\"phone\":\"+919876543210\",\"program\":\"BTech CSE\"}" http://localhost:3001/api/intake/<SOURCE_KEY> -i
# expect 202 in <300ms; post same body 5x fast -> still 1 person/lead
# DIAL_MODE=fake worker must be running; check DB:
# select status from crm.call_attempt order by created_at desc limit 5;
# call-now blocked path:
curl -b jar.txt -X POST http://localhost:3001/api/leads/<LEAD_ID>/call-now
# -> {"queued":true} or {"queued":false,"rejection":{"code":"OUTSIDE_WINDOW",...}}
```

Also run: `pnpm --filter @vernacular/policy test`, `pnpm --filter @vernacular/api test` (needs DB).
**Done when:** intake p95 <300ms, dup posts = 1 lead, `call_attempt` goes `reserved → dialing`.

### 0.4 Lead 360 + dashboard + policy settings [MANUAL]

**Manual:** in browser/curl as owner:

- `GET /api/leads/:id`, `GET /api/leads/:id/timeline?limit=20`
- `PATCH /api/leads/:id` without reason → 422 `REASON_REQUIRED`; with reason → stage moves + history row
- `GET /api/dashboard?from=2026-09-16&to=2026-10-16` funnel has all 11 stages
- `PUT /api/settings/policy` change window to 10:00–18:00 → next `call-now` outside window returns `OUTSIDE_WINDOW`
  **Done when:** matches `day3-handoff.md` I4 section.

---

## Phase 1 — Finish Day 3 gaps (next, unblocks everything)

### 1.1 `VoiceDialer` wiring check (D3-I3 contract) [AI-PROMPT + MANUAL]

**Code:** `apps/worker/src/index.ts`, `apps/api/src/modules/calls/dialer.ts`, `packages/integrations/dograh/*`. Prompt: "D3: implement Dograh `VoiceDialer`, swap into worker, use `DialerError`, keep `DIAL_MODE=fake` for dev."
**Manual:** with `DIAL_MODE=fake` intake still dials; without it dial fails `PROVIDER_NOT_CONFIGURED` (expected until adapter lands). Check `agent_tool_call` empty, no crash on worker kill/restart.
**Done when:** fake path green, real path fails cleanly with typed code.

### 1.2 Call finalize + recording archive (D3-I3-01/02) [AI-PROMPT]

**Code:** `call.finalize` job, `recording.archive` job, `GET /api/calls/:id`, `GET /api/calls/:id/recording` (302 → signed R2 URL, logs `recording_access_log`).
**Manual:**

- simulate completed call → `call_attempt` has status/duration/transcript + `transcript_text`, stage = Connected
- `GET /api/calls/:id/recording` as unauthorized counsellor → 403; as owner → 302 + row in `recording_access_log`
- audio seeks in browser
  **Done when:** Checkpoint 3 item 4.

### 1.3 CSV import + campaigns (D3-I3-03/04, D3-I4-03/04) [AI-PROMPT]

**Code:** `POST /imports`, `GET /imports/:id`, campaign CRUD + start/pause/stop + progress, reuse `ingestLead` per row.
**Manual:** upload 5,000-row file with 50 bad rows → 4,950 imported, error CSV downloads with reasons; campaign of 50 leads dials only inside window with caps; progress counts match `call_attempt`.
**Done when:** Checkpoint 3 item 6.

### 1.4 Inbound pre-call context (D3-I3-05) [AI-PROMPT]

**Code:** `POST /api/webhooks/dograh/:key/inbound-context` using `buildInitialContext` + `ingestLead(kind=inbound_call)`, <300ms, never blocks call.
**Manual:** call from known number → agent greeting uses name+program at Turn 0; unknown → generic greeting + new person/lead; bad secret → 401; kill lookup → still connects with minimal context.
**Done when:** Checkpoint 3 item 7.

### 1.5 Recording proxy, Playwright CI, latency script, NDNC import (D3-I1-01…04) [AI-PROMPT]

**Code:** `infra/`, `tests/e2e/`, k6/node latency script, `NdncProvider` + scrub upload → `suppression`.
**Manual:** run latency script (20 submits → p95 submit→dialing <30s); upload listed number → policy `NDNC_LISTED`; stop `crm-api` → alert in <2min (when monitoring lands).
**Done when:** Checkpoint 3 items 1–2.

### 1.6 Chaos kill test [MANUAL]

Submit one form 5x in 2s; kill `crm-worker` between `reserved` and `dialing`, restart → exactly 1 `call_attempt` + 1 live call (partial unique index + Idempotency-Key).

**Checkpoint 3 gate:** handbook p.26 — latency, policy blocks, exactly-once (5x post + worker kill), recordings, Lead 360, CSV, inbound greeting.

---

## Phase 2 — Day 4: agent intelligence + counsellor loop

Pre-work [MANUAL]: deploy Dograh fork patch (D4-V-01: `initial_context` + Idempotency-Key + max duration + inbound hook), label 40-call golden set (D4-V-02), wire 12 `http_api` tools + prompt (D4-I3-02: facts only from tools + disclosure text).

### 2.1 LLM adapter + analyst (D4-I1-01…03) [AI-PROMPT]

**Code:** `packages/integrations/llm/*` (Vercel AI SDK, per-tenant key, fallback default), `packages/contracts/analysis.ts` + `buildAnalysisSchema(tenantId)` merging core + `tenant_extraction_rules`, `analyst.run` job (skip <15s talk, `generateObject`, quote substring check, retry once, write `analysis` + observation, queue `review_call`).
**Manual:** run on 10 real transcripts → every stored quote is exact substring; hand-insert fake quote → DB rejects; switch provider in settings → next run uses new model; `usage_event(kind=analyst_run)` row appears.
**Done when:** Checkpoint 4 items 5, 7.

### 2.2 Programs/KB, agents, queues, visits/tasks (D4-I2-01…05) [AI-PROMPT]

**Code:** `program/fee/seat/deadline/eligibility` CRUD, `kb_document` + tsvector search, `ai_agent` CRUD + counsellor allocation, `counsellor_queue_item` list/claim/resolve + verify/override, `campus_visit`/`meeting`/`task`/`lead_note` CRUD + reminder jobs, assignment rules.
**Manual:** enter MIT-ADT programs via API/UI; KB search returns snippet; counsellor sees only allocated agents' leads; override Warm→Hot updates `current_temperature` + timeline entry; book visit → stage Visit booked + 2 reminders; 10 leads split evenly across 2 counsellors.
**Done when:** Checkpoint 4 items 3, 4, 6.

### 2.3 Agent tools + workflow wiring (D4-I3-01…03) [AI-PROMPT]

**Code:** `POST /agent-tools/v1/*` (12 tools, HMAC `X-Signature`+`X-Timestamp`, 5-min skew, `agent_tool_call` log, LRU cache for reads with tenant-scoped keys + LISTEN/NOTIFY invalidation).
**Manual:** bad signature → 401; fee question → tool logged + answer matches DB, seats as bucket; "talk to person" → queue item <1min; edit fee → next tool call fresh; 200-call latency run p99 <500ms, hit rate >90% on reads; grep rendered HTML has no `dograh`.
**Done when:** Checkpoint 4 items 1, 2, 7.

### 2.4 Counsellor workspace + visits + programs/agents UI (D4-I4-01…04) [AI-PROMPT]

**Code:** `apps/web` tabs (Needs counsellor / Review / My leads / Today), side panel with player + transcript + quote highlights + verify/override, calendar, program/KB editors.
**Manual:** clear 10 reviews without leaving page at 390px; book/reschedule/attend visit end-to-end; screenshots 1440 + 390 in PR.
**Done when:** full Checkpoint 4 (p.29).

---

## Phase 3 — Day 5: applications, WhatsApp, public API

Manual gate prep [MANUAL]: upload sample portal export, point a sub at webhook.site to check signature + retries.

### 3.1 Application/fee sync + auto-advance + tracked links (D5-I1-01…03) [AI-PROMPT]

**Code:** CSV upload + `POST /v1/applications` + `POST /webhooks/portal/:key` → one matching service (app no. → phone → email), unmatched review list, stage auto-advance (never backwards), `/l/:token` links.
**Manual:** upload sample export → statuses + stages update; click link → timeline event in seconds.
**Done when:** Checkpoint 5 item 1.

### 3.2 API keys + `/v1` + webhooks-out (D5-I2-01…03) [AI-PROMPT]

**Code:** key create (once) / revoke, scopes, `GET/POST/PATCH /v1/leads`, `/v1/calls`, `/v1/visits`, `/v1/applications`, `/v1/events`, OpenAPI + `/v1/docs`, subscriptions + HMAC `X-Vernacular-Signature` + backoff (1m/5m/30m/2h/12h) + replay + auto-disable.
**Manual (curl):** tenant A key creates lead + lists calls; tenant B key → 404 on A's lead; revoked → 401; webhook.site gets `lead.created` with valid signature; 500-receiver retried on schedule; `/v1/docs` matches behaviour.
**Done when:** Checkpoint 5 items 2, 3, 5.

### 3.3 WhatsApp YesBoss (D5-I3-01…04) + UI (D5-I4-01…03) [AI-PROMPT]

**Code:** `WhatsAppProvider` + YesBoss impl + `FakeProvider`, `whatsapp.send` via policy, inbound webhook (STOP → suppression + consent revoke), template sync.
**Manual:** template reaches test phone (or FakeProvider path proven + gap logged); statuses sent→delivered→read on timeline; inbound reply on Lead 360; STOP blocks future sends AND calls.
**Done when:** Checkpoint 5 item 4.

---

## Phase 4 — Day 6: SaaS layer (multi-tenant, billing, planner)

Manual gate [MANUAL]: stopwatch tenant create (<10 min), grep zero `dograh`, wallet-drain test, audit check.

### 4.1 Branding + domains + notifications (D6-I1-01…04) [AI-PROMPT]

**Code:** `GET /api/branding` from Host, logo/favicon to R2, domain add → CNAME+TXT → verify job → Caddy `on_demand_tls` ask `/api/internal/domain-allowed`, `sla.check`, digest email, `compliance.audit`.
**Manual:** tenant host login shows its brand; test domain gets cert, unknown gets none; overdue next-step → queue item; digest at 08:00 tenant time; seeded violation in report.
**Done when:** Checkpoint 6 items 2, 5.

### 4.2 Billing + planner + search/bulk (D6-I2-01…05) [AI-PROMPT]

**Code:** plans, subscription (prepaid/monthly+overage), price at `usage_event` write, `wallet_transaction`, top-up, statements (CSV+PDF to R2), `planner.run` → proposals → policy → effect → attest → reflect, approval queue, search/views/bulk + audit.
**Manual:** wallet 0 → dial `WALLET_EMPTY`, top-up resumes; statement = SUM(usage_event); proposal outside window shows `OUTSIDE_WINDOW`; bulk-assign 200 logged.
**Done when:** Checkpoint 6 items 4, 6.

### 4.3 Tenant create/suspend/impersonate/team/email/duplicates (D6-I3-01…05) + platform console UI (D6-I4-01…04) [AI-PROMPT]

**Code:** create tenant → Dograh org+key (or manual paste) → default policy/stages/agent → invite owner; suspend blocks login+dial; impersonate (reason, banner, `impersonator_id`, 30-min expiry); invites/roles/allocation; SES/Resend; duplicate scan + merge.
**Manual (stopwatch):** create `Demo College` → owner login on own domain with brand <10min; its calls never in MIT-ADT; impersonated action in audit log with both IDs; merge keeps calls + logs both IDs.
**Done when:** full Checkpoint 6 (p.34).

---

## Phase 5 — Day 7: harden + go live ([AI-PROMPT] builds + [MANUAL] load/DR/cutover)

- **Load (D7-I1-01):** k6 5x peak (default 2,500/hr intake + 100 UI users + 20 rps tools) with live Dograh → no errors, p95 API <300ms, tools p99 <500ms, listen to 3 calls.
- **DR + alerts + runbooks (D7-I1-02…04):** restore prod backup+WAL to scratch <30min, each alert fired once, intern follows deploy runbook.
- **DPDP + security (D7-I2-01/02):** export/erasure on test person (billing intact), `docs/security-review.md` ticked, gitleaks + audit clean.
- **Cross-tenant suite (D7-I2-03):** tenant B vs A IDs on every `/api` + `/v1` → 404/403, green in CI.
- **Cutover + chaos (D7-I3-01/02):** handbook §11.3 steps 1–12; duplicates/out-of-order/kill/API-down-5min/R2-down → exactly 1 `call_attempt`, no lost events.
- **E2E + screenshots + guide (D7-I4-01…03):** Playwright journeys per role green; every page 1440 + 390 reviewed; `docs/user-guide.md` shared.
- **GO-LIVE GATE:** Checkpoint 7 (p.35–36).

## Cut-line (if behind — handbook §13.1, never cut the core)

Never cut: security, RLS/isolation, policy, exactly-once dial, backups, sync parity, intake, Lead 360, queues, analyst+quote check. Cut in order: (1) performance view/matrix/saved views (2) supervisor approvals → proposals-only (3) planner effect (4) custom domains → `slug.laveric.com` (5) PDF → CSV only (6) tracked links/template sync/dup job (7) golden-set CI → manual script. Buffer Days 8–10.

## NEVER checklist (check every PR)

No migration-less DB change · every query tenant-scoped · no secrets/phones in code · no `Dograh` in UI/API/logs · policy gate on every dial/message · no LLM in handler · web imports only `@vernacular/contracts` · no edited migrations/generated/lockfiles · no skipped failing tests · `moveStage` only · `req.tx` only · `enqueueInTx` only · public route allow-listed · contract-mapped responses · no >300ms inline work.
