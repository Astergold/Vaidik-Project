# Specs

One file per module: `docs/specs/<module>.md`. The task owner writes it **before** prompting the AI tool
(20 minutes max) and commits it in the same PR as the code. It is the main context you attach to every prompt.

## Template

```md
# <module>

## Goal

Two lines.

## Users & stories

As a <role> I can <action> so that <outcome>.

## Endpoints / jobs / pages

Method + path, request JSON example, response JSON example, error codes. Jobs: trigger, payload, idempotency.

## Tables touched

Which tables and columns (see data-model.md). Migration needed? Which file?

## Rules & edge cases

Duplicates, out-of-order events, missing data, timezone, permissions, tenant scope.

## Acceptance tests

Copied from the handbook "Done when" column, plus your own.

## Out of scope

So the AI doesn't build extras.
```

## Index

- [data-model.md](data-model.md) — schema reference (implemented vs planned)
- [day1-handoff.md](day1-handoff.md) — what each track can rely on from I2 after Day 1
- [day2-handoff.md](day2-handoff.md) — auth, tenant scope, jobs, secrets, seed; per-track notes
- [day3-handoff.md](day3-handoff.md) — policy engine, intake, dial job, lead APIs, dashboard; per-track notes
- [policy-engine.md](policy-engine.md) — the 10 rules, decisions needing sign-off
- [intake.md](intake.md) — provider-facing endpoint guide + field mapping
- [dial-job.md](dial-job.md) — reserve-then-dial state machine and the contract with I3
- [applications-ui.md](applications-ui.md) — D5-I4-01 applications list, import, unmatched (proposed contract)
- [whatsapp-ui.md](whatsapp-ui.md) — D5-I4-02 Lead 360 conversation, template sender, Settings → WhatsApp (proposed contract)
- [integrations-ui.md](integrations-ui.md) — D5-I4-03 API keys, webhooks, delivery log (proposed contract)
- [platform-console.md](platform-console.md) — D6-I4-01 tenants, wizard, impersonation, plans, health, audit (proposed contract)
- [settings-ui.md](settings-ui.md) — D6-I4-02 general, policy (live), stages, branding, domains, team, email, LLM, privacy, profile
- [billing-ui.md](billing-ui.md) — D6-I4-03 wallet, ledger, usage, plan, statements (proposed contract)
- [search-notifications.md](search-notifications.md) — D6-I4-04a ⌘K palette, bell, notifications (proposed contract)
- [leads-views-bulk.md](leads-views-bulk.md) — D6-I4-04b saved views + bulk action bar on /leads (proposed contract)
- [duplicates-ui.md](duplicates-ui.md) — D6-I4-04c duplicate review, merge, dismiss (proposed contract)
- [reports-matrix.md](reports-matrix.md) — D6-I4-04d counsellor performance, exports, seat/deadline matrix
- [planner-compliance-calls.md](planner-compliance-calls.md) — D6-I4-04e planner approvals, compliance report, calls log
- [e2e-and-screenshots.md](e2e-and-screenshots.md) — D7-I4-01/02 Playwright journeys + 1440/390 screenshot sweep
- [api-conventions.md](api-conventions.md) — how to write a route, guards, errors, jobs, public-route pattern (attach to every backend prompt)
