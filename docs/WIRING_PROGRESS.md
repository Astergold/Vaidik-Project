# WIRING_PROGRESS.md

## Phase status
- Phase 0 (baseline): partial — DB migrations applied (7 core), flags recorded
- Phase 1 (pipeline/next_step): pending — depends on contracts + DB trigger
- Phase 2 (real dialer): pending — adapter exists, needs key/config
- Phase 3 (campaign CRUD): DONE 2026-10-24 — routes/service with roles, state machine, audit, platform-options
- Phase 4 (wave dispatch): DONE 2026-10-24 — campaign.start / campaign.sync / campaign.control registered; waves are
  mirrored to the calling platform's campaigns (see docs/specs/campaigns.md)

## Conflicts / deviations
- SUPERSING INSTRUCTION vs USER: prompt said "remove form_sent/fee_pending/etc. migration"; user explicitly said keep them (core admission pipeline: cold→warm→hot→fee/form/enrolled). RESOLUTION: kept; no deletion.
- Dograh = Godrah confirmed (user). Provider name hidden from UI/logs per NEVER list.
- Campaign source = CRM (not provider). Provider reflects CRM campaigns automatically.
- DB: Docker Desktop unstable; migrations applied via container network; pg-hba trust/scam fixes applied.

## Key design decisions (HANDBOOK §2 / this session)
- Source of truth: CRM DB owns campaigns, leads, stages, assignments.
- Campaign batch_size {100,200}, default 100.
- Pipeline stages fixed (§7.1): new, attempting, connected, interested, visit_booked, visited, applied, fee_paid, enrolled, lost, invalid. next_step lives in lead.next_step + lead.next_step_due_at, NOT in stage.
- You confirmed: campaigns built from CRM upload → selected AI agent from Dograh platform → dial via policy → classify → counsellor assignment → stage progression → real-time sync.
- Multiple entry points: website form → CRM lead, intros, etc.
- No deletion of pipeline stage/form/fee migrations — they are core.

## 2026-10-24 — CRM-only campaign creation, mirrored to the platform
- Decision (owner): campaigns are created ONLY in the CRM, with the platform's create-campaign options (workflow,
  telephony configuration, max concurrent, retries, call schedule, circuit breaker). This supersedes "the provider's
  own campaign feature is NOT used": verified the platform API has campaign endpoints, so each wave is one platform
  campaign built from a CSV of CRM leads. Spec: docs/specs/campaigns.md.
- Migration 20261024000100_campaign_provider_mirror (up/down, roundtrip-tested): campaign platform columns,
  ai_agent_id + max_concurrent nullable, crm.campaign_wave (RLS).
- Repo repairs: packages/policy and packages/db tsconfig.json were corrupted (doubled quotes) → restored;
  .prettierrc.json (printWidth 100) and .prettierignore were missing → restored; apps/api/src/index.ts `any` lint fix.
- FIXED same day: single calls used invented endpoints (`/v1/calls`, `/v1/runs`). Now: `POST
  /api/v1/public/agent/workflow/{uuid}` (phone + initial_context; `telephony/initiate-call` takes no context and is a
  test-call method) and `GET /api/v1/workflow/{id}/runs[/{run_id}]`. The platform has no idempotency key: the dialer puts
  call_attempt_id in initial_context and checks the workflow's newest 50 runs for it before placing a call.
  call_attempt.dograh_run_id = "<workflowId>:<runId>". call.sync_runs is armed by call.dial and re-arms while calls are in
  flight; calls with no result after 2 h close as NO_RESULT. Worker uses the real dialer; DIAL_MODE=fake refused in production.
- DONE same day: per-tenant calling-platform key. Settings → Integrations → Calling platform
  (apps/web/src/features/integrations/CallingPlatformSection.tsx) ↔ `GET/PUT/DELETE /api/settings/calling-platform`
  (apps/api/src/modules/calling-platform/routes.ts). Owner/admin only; key validated with a read-only workflow list
  before saving, stored in tenant_secret (AES-GCM), only last 4 chars returned, audit rows carry no key.
