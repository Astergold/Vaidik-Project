# FINAL WIRING VERIFICATION — Phase 0-4 Complete

## Verified green
- DB migrations (7 core + 20261006000800 new) applied; no extra stage/form/fee migrations deleted (preserved per user)
- `packages/contracts/src/campaigns.ts`: `batchSize` added (default 100, {100,200})
- `packages/db/migrations/20261006000800_campaign_wave_and_policy.sql` (up+down) applied: batch_size, campaign_lead, webhook_event_processed, scenario, tenant_policy updates
- `docs/WIRING_PROGRESS.md`: conflicts recorded (Dograh=Godrah; source=CRM; stages kept; no provider name visible)
- `apps/api/src/modules/campaigns/`: routes/service/repo/jobs replaced (no stubs)
- `apps/api/src/jobs/index.ts`: `campaignStartJob` registered in `allJobs`
- `pnpm jobs:install`: queues installed (dead_letter, system.ping, call.dial, call.sync_runs, campaign.start)
- `pnpm db:seed`: completed; demo leads present; users created
- `.env`: `GODRAH_API_KEY` + `GODRAH_API_BASE_URL` configured; adapter (`packages/integrations/dograh/src/index.ts`) uses `DograhDialerConfig` (baseUrl + apiKey)
- Web serves at `http://localhost:3002`; API at `http://localhost:3001` (starts when DB is fully reachable)

## End-to-end flow (designed, requires live DB for full execution)
1. Upload sheet / form → `lead` created (`next_step`, `stage`)
2. Campaign built (`createCampaignBody` with `batchSize` {100/200}) → `campaign.start` enqueues `call.dial`
3. Wave dispatch (`campaignLead`) snapshots members → `call.dial` per wave (singleton key prevents double dial)
4. Policy engine (`evaluate`) checks window/DND/cap → dial via `DograhDialer` (real key in `.env`)
5. `call.finalize` → classification (`analyst.run`) → scenario + observation with `verbatim_quote` validated by DB trigger (`observation_validate_quote`)
6. `lead_stage_history` writes; `next_step` updated; counsellor assignment (`assignment_rule` + `counsellor_capacity` default 25)
7. Real-time sync: webhook handler upserts `dograh_run_raw` → `webhook_event_processed` (ON CONFLICT DO NOTHING) → enqueues `call.finalize`

## Not verified without stable Docker restart (manual checklist)
- Full `pnpm dev` with both API + worker running continuously against DB
- Real `call.dial` against Godrah endpoint (requires `DIAL_MODE` not set to fake; adapter uses `.env` key)
- Playwright role journeys at 390/768/1440 px (UI responsive; no horizontal scroll; touch targets >=44px)
- Recording archive (`recording.archive`) to R2; signed URL playback; `recording_access_log`
- PWA manifest / icons (optional addition beyond handbook)
- Nightly backup + restore script to R2; GlitchTip alert wiring
- Cross-tenant isolation test for every endpoint (add to `test/tenant-scope.test.ts`)

## Commands to complete after Docker settles
```bash
pnpm db:migrate
pnpm jobs:install
pnpm db:seed
pnpm test          # real Postgres tests
pnpm typecheck
pnpm lint
pnpm dev           # web :3002, api :3001, worker background
```
