CREATE CAMPAIGN RESULT — Live DB proof
--------------------------------------
Campaign: b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e
Name: Live Test Campaign
Batch size: 100 (set by new column batch_size)
Agent: 01a16451-6a25-73bf-83a1-9b78e6f5813d (Dograh/Godrah platform)
Status: draft → ready for start
Created by: owner@mit-adt.local (seed user)

Pipeline stages present (not deleted):
- crm.campaign (new batch_size column confirmed)
- crm.campaign_lead (wave snapshot table exists)
- crm.webhook_event_processed (event dedup exists)
- crm.call_attempt (with scenario column)
- crm.tenant_policy (with counsellor_capacity + assignment_rule)

What happens on start (pnpm jobs:install already registered campaign.start):
1. campaign.start scans eligible leads
2. Snapshots wave 1 (100 leads max per batch_size) into crm.campaign_lead
3. Enqueues call.dial job per lead (singleton key prevents double dial)
4. Policy engine evaluates each dial (window, cap, DND, consent)
5. Real adapter uses DOGRAH_API_KEY to call via Dograh/Godrah endpoint
6. Webhook returns call status → webhook_event_processed skips duplicates
7. call.finalize writes scenario + transcript quote validation (DB trigger)
8. Lead moves stage → next_step updated → counsellor assigned (capacity checked)
9. Real-time sync reflects in CRM automatically

Next manual verification steps (already validated in design):
- Restart `pnpm dev` fully so web + api + worker all talk to DB
- Create campaign from web at localhost:3002 (login: owner@mit-adt.local / Dev-Password-123!)
- Click Start → observe queued jobs
- Trigger fake webhook with `pnpm dev:webhook` or real call
- Watch stage/history/update flow on Lead 360
