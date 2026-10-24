# Vernacular AI
## Admission CRM – 7-Day Build Handbook
**Architecture · data model · day-by-day tasks for 4 interns · verification checkpoints · AI-tool working method**

| | |
| :--- | :--- |
| **Prepared for** | Vaidik Kumawat (CTO) and the intern team (I1–I4) |
| **Company** | Laveric Technologies LLP |
| **Product** | Vernacular AI – white-label, multi-tenant admission CRM on laveric.com |
| **First tenant** | MIT-ADT University |
| **Build window** | 7 working days (Day 1 – Day 7), $8\text{ hrs/day}$, 4 interns + CTO |
| **Supersedes** | `st.pdf` (Engineering Specification) and the earlier build plan (`abundant-scone`) |
| **Status** | v1.0 handbook to execute from. Changes go through Vaidik only. |

### How to use this document
**Interns:** read Sections 1–9 once on Day 1 morning ($\approx 90\text{ min}$). After that you live in Section 10 (your day's tasks) and Section 9 (how to prompt your AI tool). Every task has an ID like `D3-I2-04` = Day 3, Intern 2, task 4. Use that ID in your branch name and PR title.

**Vaidik:** each day ends with a Checkpoint table. Do not let the team start the next day's P0 tasks until the checkpoint passes (or you consciously accept a carry-over). Section 13 is the cut-line if the team falls behind.

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 2–3)*

## Contents
| Section | Page |
| :--- | :--- |
| **Contents** | 2 |
| **1. The project in one page** | 4 |
| **2. Decisions locked in (read before touching code)** | 5 |
| **3. What changed from st.pdf (and why)** | 6 |
| **4. Target architecture** | 7 |
| 4.1 The services | 7 |
| 4.2 The four flows everyone must understand | 8 |
| **5. Tech stack and repository** | 8 |
| 5.1 Monorepo layout | 9 |
| **6. Data model** | 9 |
| 6.1 Rules that are enforced by the database (not just code) | 11 |
| **7. Business rules** | 12 |
| 7.1 Pipeline: fixed core stages | 12 |
| 7.2 Temperature and next step | 12 |
| 7.3 Policy engine (the gatekeeper) | 12 |
| 7.4 The 12 agent tools (`/api/agent-tools/v1/*`) | 13 |
| 7.5 Roles and permissions | 13 |
| **8. Team, ownership and daily rhythm** | 14 |
| 8.1 Daily rhythm (8-hour day) | 14 |
| 8.2 Git rules (host decided by Vaidik on Day 1) | 14 |
| 8.3 Environments | 15 |
| **9. How we build with AI coding agents** | 15 |
| 9.1 The three context files | 15 |
| 9.2 The prompt recipe (use for every task) | 16 |
| 9.3 Working loop with the agent | 16 |
| 9.4 Example prompts (adapt, don't copy blindly) | 16 |
| 9.5 Spec file template (`docs/specs/<module>.md`) | 17 |
| **10. The 7-day plan** | 17 |
| Day 1 – Secure the old app, set up everything, answer the unknowns | 18 |
| Day 2 – Foundation, real data in, UI on the API | 21 |
| Day 3 – Speed-to-lead: intake, policy, dial, recordings, Lead 360 | 24 |
| Day 4 – Agent intelligence and the counsellor loop | 27 |
| Day 5 – Applications, WhatsApp and plug-into-anything | 30 |
| Day 6 – The SaaS layer: tenants, white-label, billing, planner, CRM extras | 32 |
| Day 7 – Harden, test everything, go live | 35 |
| **11. Testing, verification and go-live** | 36 |
| 11.1 What gets tested, and how | 36 |
| 11.2 Measurable targets | 37 |
| 11.3 MIT-ADT production cutover runbook (Day 7, owner I3, approver Vaidik) | 37 |
| **12. Operating the platform** | 37 |
| 12.1 Daily operations (after go-live) | 37 |
| 12.2 Onboarding a new tenant (target $< 10\text{ minutes}$ + provider setup) | 38 |
| **13. Risks and the cut-line** | 38 |
| 13.1 Cut-line: what moves to the Day 8–10 buffer if a checkpoint fails | 38 |
| **14. Open items (chase in parallel – owner Vaidik unless noted)** | 39 |
| **15. After go-live (not part of the 7 days)** | 39 |
| **Glossary** | 39 |
| **Appendix A – API surface** | 40 |
| **Appendix B – Sitemap (every page I4 builds)** | 41 |
| **Appendix C – Background jobs (pg-boss)** | 41 |
| **Appendix D – Environment variables** | 41 |

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 4)*

## 1. The project in one page

We are building **Vernacular AI**: an admission CRM that universities log into to manage every prospective student from first enquiry to fee paid. AI voice agents make the calls. Human counsellors verify the AI's work and take over when a student asks for a person. We sell it to many institutions under our brand (or theirs – white-label). MIT-ADT is tenant #1.

Underneath, the voice calls run on our self-hosted Dograh instance. Tenants never see the word Dograh, never log into it, and never know it exists. Our CRM is the cover: it owns the students, the rules, the schedule and the data. Dograh only does what the CRM tells it: place this call, with this context, using this agent.

### The three problems the old prototype had (and this build fixes)
1. **A 'lead' was really one phone call.** Two calls to the same student were two unrelated rows. **Fix:** split into `person` (the human), `lead` (one admission opportunity per cycle) and `call_attempt` (one dial).
2. **The UI talked to Dograh and the database directly from serverless functions**, causing connection exhaustion, a 100-run sampling dashboard and six unauthenticated endpoints. **Fix:** a long-lived Fastify API owns all data; the UI only calls `/api`.
3. **Nothing decided whether a call was allowed.** **Fix:** a deterministic policy engine (calling hours, consent, DND, caps, wallet balance) sits in front of every dial. AI can propose; only the policy engine permits.

### What 'done' means at the end of Day 7
* MIT-ADT runs on the new system in production: leads arrive from every source, get called by the AI within 30 seconds (inside calling hours), are analysed, and show up in a person-centric CRM with timeline, temperature and next step.
* Counsellors work their queues (review AI calls, 'needs counsellor' students, campus visits, notes, outcomes). Admission head sees the dashboard and daily digest.
* Applications and fee status are tracked from the university portal. WhatsApp works through the YesBoss adapter.
* A second tenant can be created from the super-admin console in under 10 minutes, with its own Dograh organisation, branding, domain, team, wallet and API keys – fully isolated from MIT-ADT.
* Public REST API, API keys and signed webhooks let any ERP or tool plug in.
* Backups are restorable, monitoring alerts work, and every checkpoint in this document is ticked.

> **Honest timeline note from the planning session**
> The earlier plan estimated 5–6 weeks for the full system. This handbook compresses it into 7 days by (1) running four parallel tracks from hour one, (2) cutting scope inside each feature to the smallest version that works, not cutting features, and (3) marking every task P0/P1/P2. $\text{P0} =$ the go-live depends on it. $\text{P1} =$ in the 7-day scope, done after P0s of the day. $\text{P2} =$ in scope, but moves to the Day 8–10 buffer if the day runs out. If a checkpoint fails, Section 13 tells you exactly what to drop. Nothing is silently left out: every P2 that slips goes onto the carry-over board.

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 5–6)*

## 2. Decisions locked in (read before touching code)

These came out of the Q&A rounds. They are not up for debate during the sprint; if an intern thinks one is wrong, raise it with Vaidik, don't silently change it.

| Topic | Decision | Why |
| :--- | :--- | :--- |
| **Product** | White-label SaaS 'Vernacular AI' on laveric.com, multi-tenant from day one. | Sell to many institutions; MIT-ADT first. |
| **Dograh mapping** | 1 tenant = 1 hidden Dograh organisation + its own API key, stored encrypted per tenant. | Zero data mixing; easy to trace usage per tenant. |
| **Hosting** | Same VPS as Dograh, Docker Compose. Start medium (8 vCPU / 16–32 GB); measure on Day 1. | Agent tools need $< 500\text{ ms}$; same box = no network hop. Cheapest. |
| **Database** | Self-hosted PostgreSQL 17 on the VPS. Separate database from Dograh's. Not Neon. | Predictable cost; no per-connection/compute billing. |
| **Background jobs** | pg-boss (job queue stored inside our Postgres). | No Redis, no Inngest bill; jobs commit in the same transaction as data. |
| **Frontend hosting** | Off Vercel, onto the VPS behind Caddy. `/api/*` $\rightarrow$ Fastify, `/*` $\rightarrow$ web. | Same-origin cookies; custom domains with auto-TLS; kills preview-URL auth bugs. |
| **Auth** | Better Auth inside Fastify, organization plugin = tenant membership. Platform super-admin for Laveric. | One auth system for $\text{UI} + \text{API}$. |
| **Roles** | Super-admin (Laveric) · Tenant owner/admin · Admission head/manager · Counsellor. | From the Q&A. |
| **Storage** | Cloudflare R2, per-tenant prefix, signed URLs. Recordings archived from Dograh. | Cheap, zero egress fees. |
| **LLM** | Provider-pluggable (Vercel AI SDK). Paste a key, pick a model. Default analyst: Claude Sonnet 5. | Not locked to one vendor. |
| **WhatsApp** | YesBoss AI behind a `WhatsAppProvider` interface. | Swap provider later without touching business logic. |
| **Telephony & compliance** | Plivo/Vobiz/Exotel behind Dograh. Compliance = per-tenant policy with safe defaults (09:00–21:00, DND/NDNC, consent, 140-series flag). | Legal classification is an open item, not a build blocker. |
| **Languages** | UI English only. Voice/WhatsApp language per lead / per agent. | Vernacular voice is the product; UI stays simple. |
| **Pipeline** | Fixed core stages + tenant-defined sub-stages. | Reporting stays comparable across tenants. |
| **Temperature** | Hot / Warm / Cold / Invalid (no numeric score) + a mandatory 'Next step' on every lead. | From the Q&A. |
| **Counsellors** | AI makes all calls. Each AI agent is allocated to counsellors who verify AI labels and work the 'Needs counsellor' queue. | Human check on every AI decision that matters. |
| **Applications & fees** | Student uses the university portal. We only track status (form filled, fee paid) via import / API / webhook. | CRM-collected payments = later. |
| **Campus visits** | Book + reminders + attended/no-show + outcome notes. | |
| **Billing** | Prepaid wallet AND monthly plan + overage, both from one usage ledger. | Either model per tenant. |
| **Integrations** | Public REST API `/v1` + per-tenant API keys + signed outbound webhooks + generic intake with field mapping + CSV mapping. | Plug into ERP or 'any other provider'. |
| **Migration** | Start fresh; backfill all past Dograh runs (small volume). | |
| **Repo & Git** | One monorepo for the CRM; Dograh stays separate. Git host chosen by Vaidik on Day 1. Branch + PR only, no direct pushes to `main`. | No org account exists yet; host is a Day-1 decision. |
| **Team** | 4 interns (I1–I4) + Vaidik. Interns build with AI coding agents (opencode, Amazon Q, etc.). | This handbook is written for prompting, not hand-coding. |

---

## 3. What changed from st.pdf (and why)

`st.pdf` is the right direction and its core ideas are kept: Fastify control plane, Dograh as a voice actuator, the `person` / `lead` / `call_attempt` split, `person_identifier` dedupe, append-only temperature observations, a deterministic compliance gatekeeper, verbatim-quote validation and the Propose $\rightarrow$ Permit $\rightarrow$ Effect $\rightarrow$ Attest $\rightarrow$ Reflect loop. These are the corrections and additions.

| `st.pdf` says | This handbook does | Reason |
| :--- | :--- | :--- |
| Database: PostgreSQL (Neon) | Self-hosted PostgreSQL 17 on the VPS, nightly + WAL backups to R2 | Your decision: avoid usage-based bills |
| Frontend stays on Vercel | Frontend moves to the VPS behind Caddy | Per-tenant custom domains need on-demand TLS; same-origin auth cookies |
| Inngest (implied for background work) | pg-boss inside Postgres | No replacement was named once Vercel goes; pg-boss costs nothing |
| 'HMCA-authenticated tools' | HMAC (typo) | |
| Phase 2: wait 7 consecutive days of matching counts before flipping reads | Verify per-day counts for every backfilled day on Day 2 + keep the old console read-only for 7 days after go-live | Fits the 7-day window without losing the safety net |
| No spike phase | Day-1 spike: Dograh org/API-key creation via API, `initial_context` contents, `{{initial_context.*}}` in `http_api` tools, webhook payload | Everything downstream depends on these answers |
| Single tenant implied | White-label multi-tenant, 1 Dograh org per tenant, super-admin console | Product decision |
| Not covered | Policy layer as configurable per-tenant rules; planner; WhatsApp; application/fee tracking; counsellor workspace; campus visits; billing; white-label; public API; backups; observability | Required for a sellable product |
| Ladder tables (earlier plan) | Dropped – the re-engagement planner replaces fixed ladders | Less schema, more flexible |

> **Still open in the old code (fixed on Day 1, task D1-I4-01)**
> In `src/api/dograh/server-fns.ts` these six functions have no `requireAdminSession()`: `listWorkflowOptions`, `listCampaigns`, `getCampaign`, `getCampaignProgress`, `listRuns`, `getUsageAnalytics`. Anyone with the URL can read campaign and call data today. Live secrets (Dograh key, Neon password, Google client secret) are in cleartext in `.env.local` and must be rotated.

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 7)*

## 4. Target architecture

```
                           +---------------------------------------+
                           |            Users (browser)            |
                           |   tenant.laveric.com · custom domains |
                           +-------------------+-------------------+
                                               |
                                               v
                           +---------------------------------------+
                           |         Caddy (reverse proxy)         |
                           |  TLS · on-demand certs · routing      |
                           +---------+-------------------+---------+
                                 /*  |                   | /api/* /v1/*
                                     v                   v
+------------------------------------+   +---------------------------------------+      dial      +-----------------------------------+
|              crm-web               |   |           crm-api (Fastify)           | -------------> |          Dograh (hidden)          |
|       TanStack Start · UI only     |   |  auth · tenant ctx · REST /api + /v1  |                |          1 org per tenant         |
|            no DB access            |   |  intake · webhooks · agent tools      | <------------- |     live voice · SIP · workflows  |
+------------------------------------+   |       policy engine (gatekeeper)      |  tools/hooks   |        Plivo / Vobiz / Exotel     |
                                         +-------+-----------------------+-------+                +-----------------+-----------------+
                                                 |                       |                                          ^
                                                 |                       | enqueue (same tx)                        |
                                                 |                       v                                          |
                                                 |       +---------------------------------------+                  |
                                                 |       |         crm-worker (pg-boss)          | -----------------+
                                                 |       |    sync · dial · analyst · reminders  |     sync / dial
                                                 |       |   webhooks-out · WhatsApp · billing   |
                                                 |       +---------------+---------------+-------+
                                                 |                       |               |
                                                 v                       v               v
                                         +-------------------------------+       +---------------------------------------+
                                         |    PostgreSQL 17 (crm DB)     |       |             Cloudflare R2             |
                                         | RLS per tenant · pg-boss here |       |     recordings · documents · logos    |
                                         | separate from Dograh's own DB |       |         nightly + WAL backups         |
                                         +-------------------------------+       +---------------------------------------+

        ................................ external systems (all reached through adapters in packages/integrations) ................................
        |                                                |                                       |                                               |
+-------------------------------+        +-------------------------------+       +-------------------------------+       +-------------------------------+
|          Lead sources         |        |        YesBoss WhatsApp       |       |       University portal       |       |          LLM provider         |
| forms · aggregators · Meta/   |        |        WhatsAppProvider       |       |        form / fee status      |       |      pluggable (AI SDK)       |
| Google · CSV · ERP -> /intake |        |            adapter            |       |              sync             |       |    default: Claude Sonnet 5   |
+-------------------------------+        +-------------------------------+       +-------------------------------+       +-------------------------------+
```

### 4.1 The services

| Service | What it does | What it must never do |
| :--- | :--- | :--- |
| **Caddy** | TLS for `laveric.com` subdomains and tenant custom domains (on-demand certs, gated by an 'ask' endpoint on `crm-api`). Routes `/api/*` and `/v1/*` to `crm-api`, everything else to `crm-web`. | Serve anything for a domain the API hasn't approved. |
| **crm-web** | TanStack Start UI. Calls only same-origin `/api/*`. Reads branding for the current host. | Talk to Postgres, Dograh, R2 or any provider directly. |
| **crm-api** | Fastify. Auth, tenant context, all REST endpoints, intake, inbound webhooks, agent tools, policy engine, public API `/v1`. | Do slow work inline (anything $> 300\text{ ms}$ goes to a job). Call an LLM inside a request. |
| **crm-worker** | Same codebase, different entrypoint. Runs pg-boss jobs: Dograh sync, dial, call finalise, recording archive, analyst, reminders, WhatsApp sends, webhooks-out, billing, digests. | Bypass the policy engine when dialling. |
| **PostgreSQL 17** | The `crm` database with Row-Level Security on every tenant table. Also stores pg-boss queues. | Share a database with Dograh. |
| **Dograh** | Live voice, SIP, workflows. One hidden organisation per tenant. | Be visible to tenants. Decide who to call. |
| **R2** | Recordings, uploaded files, logos, backups. Keys look like `tenants/<tenant_id>/...` | Be publicly readable. |

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 8–9)*

### 4.2 The four flows everyone must understand

#### Flow A – Speed-to-lead (no AI in this path)
1. **Lead submits form** (aggregator / website / Meta / CSV / ERP)
2. $\rightarrow$ **`POST /api/intake/:src`** (map fields · normalise phone · dedupe)
3. $\rightarrow$ **Same transaction** (`person` + `lead` + job `call.dial`)
4. $\rightarrow$ **Policy engine** (window · DND · consent · caps · wallet)
5. $\rightarrow$ **Reserve $\rightarrow$ dial** (`call_attempt` 'reserved' $\rightarrow$ Dograh initiate-call)

Target: $p95$ under $30\text{ s}$ from form submit to phone ringing, inside the calling window. Outside the window the job is scheduled for the next allowed minute. If the policy engine rejects, the lead records a typed reason (e.g. `OUTSIDE_WINDOW`, `NO_CONSENT`, `WALLET_EMPTY`) visible on the Lead 360 page.

#### Flow B – During the call
1. **Dograh starts call** (`initial_context` = `lead_id`, `name`, `program`, `language`)
2. $\rightarrow$ **Agent needs a fact** (calls `/api/agent-tools/v1/*` with HMAC signature)
3. $\rightarrow$ **`crm-api` answers** ($< 500\text{ ms}$, categorical buckets, no raw seats)
4. $\rightarrow$ **Agent speaks** (fees/seats/eligibility only from tool results)
5. $\rightarrow$ **Side effects** (visit booked · callback · counsellor requested)

#### Flow C – After the call
1. **Dograh webhook** (call ended $\rightarrow$ enqueue `call.finalize`)
2. $\rightarrow$ **Finalize** (status · duration · transcript · usage event)
3. $\rightarrow$ **Archive** (recording $\rightarrow$ R2 `(tenant prefix)`)
4. $\rightarrow$ **A2 analyst** (temperature · next step · objections + verbatim quotes)
5. $\rightarrow$ **Review queue** (counsellor verifies or overrides each label)

#### Flow D – Student wants a human
1. **Student asks** (or AI can't resolve)
2. $\rightarrow$ **`request_counsellor`** (tool or analyst flag)
3. $\rightarrow$ **Queue item** (assigned to a counsellor allocated to that agent)
4. $\rightarrow$ **Counsellor acts** (calls / books meeting or campus visit)
5. $\rightarrow$ **Outcome logged** (comment + result on the lead timeline)

---

## 5. Tech stack and repository

| Layer | Choice | Notes for interns |
| :--- | :--- | :--- |
| **Language** | TypeScript (strict) everywhere, Node.js 22 LTS | No plain JS files. |
| **Package manager / monorepo** | pnpm workspaces + Turborepo | One install, one CI. |
| **API** | Fastify 5 + `@fastify/swagger`, `@fastify/rate-limit`, `@fastify/cors` (off for same-origin), `@fastify/multipart` | Schemas via zod (`fastify-type-provider-zod`). |
| **DB access** | Kysely + `pg`; types generated by `kysely-codegen` | Never write raw string-concatenated SQL. |
| **Migrations** | dbmate (plain `.sql` files, up/down) | Every schema change = a new migration file. Never edit an applied one. |
| **Validation / contracts** | zod schemas in `packages/contracts`, shared by `api` + `web` | One source of truth for request/response shapes. |
| **Jobs** | pg-boss | Enqueue inside the same DB transaction as the data change. |
| **Auth** | Better Auth (organization + admin plugins) mounted in Fastify | Cookie session, same origin. |
| **Frontend** | TanStack Start + TanStack Query + TanStack Table, Tailwind, shadcn/ui | Theme via CSS variables (needed for white-label). |
| **LLM** | Vercel AI SDK (`generateObject` with zod) | Provider + key per tenant from `llm_provider_config`. |
| **Storage** | Cloudflare R2 via S3 SDK | Signed URLs only. |
| **Email** | Amazon SES or Resend behind an `EmailProvider` adapter (Vaidik picks on Day 1) | Per-tenant verified sender domain. |
| **Tests** | Vitest (unit/integration against a real Postgres in Docker), Playwright (e2e + screenshots), k6 (load) | Integration tests hit a real DB, not mocks. |
| **Ops** | Docker Compose, Caddy, wal-g backups to R2, Uptime Kuma, GlitchTip (self-hosted Sentry-compatible) | All free/self-hosted. |

### 5.1 Monorepo layout

```text
vernacular-crm/
├── AGENTS.md                        # rules every AI tool reads first (Section 10)
├── .amazonq/rules/project.md        # one line: "Follow AGENTS.md"
├── apps/
│   ├── web/                         # TanStack Start UI (old console moved here)
│   ├── api/                         # Fastify server: src/plugins, src/modules/*/{routes,service,repo}.ts
│   └── worker/                      # pg-boss entrypoint; imports services from api
├── packages/
│   ├── db/                          # migrations/*.sql (dbmate), generated types, seed scripts
│   ├── contracts/                   # zod schemas + inferred TS types (API <-> web)
│   ├── policy/                      # pure policy engine (no I/O) + its tests
│   └── integrations/
│       └── dograh/ whatsapp/ llm/ storage/ email/  # one adapter each, with fixtures/
├── infra/                           # docker-compose.yml, Caddyfile, backup scripts, k6/
├── docs/
│   ├── specs/                       # one spec per module – context for the AI tool
│   ├── runbooks/                    # deploy, restore, onboard-tenant, incident
│   └── decisions/                   # short ADRs when something changes
└── tests/e2e/                       # Playwright
```

**Module pattern inside `apps/api`:** each feature (`leads`, `intake`, `calls`, `counsellor`, `visits`, `applications`, `billing`, `platform`, `public-api`, `agent-tools`, `webhooks`) is a folder with `routes.ts` ($\text{HTTP} + \text{zod}$), `service.ts` (business logic, no HTTP) and `repo.ts` (Kysely queries). Jobs in `apps/worker` call the same services. This keeps AI-generated code predictable: tell the tool 'follow the pattern in `modules/leads`'.

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 9–11)*

## 6. Data model

All tables live in the `crm` schema (never `public` – CI greps for it). Every tenant-owned table has `tenant_id uuid not null`, RLS enabled, and a policy `tenant_id = current_setting('app.tenant_id')::uuid`. The API sets `SET LOCAL app.tenant_id` at the start of every request transaction; the app role cannot bypass RLS. IDs are UUIDv7. Times are `timestamptz` in UTC; display in the tenant's timezone.

### Platform & tenancy
| Table | Key columns / rules |
| :--- | :--- |
| `tenant` | `name`, `slug`, `status` (`active`/`suspended`), `timezone`, `plan_id`, `dograh_org_id` |
| `tenant_secret` | `kind` (`dograh_api_key`, `llm_key`, `whatsapp_key`, `tool_hmac`...), `ciphertext`, `iv`, `key_version` – AES-256-GCM, master key in env |
| `tenant_branding` | `product_name`, `logo_key`, `favicon_key`, `colours` (json), `email_from`, `whatsapp_sender` |
| `tenant_domain` | `hostname` (unique), `verification_token`, `verified_at`, `tls_status` |
| `tenant_policy` | `call_window_start`/`end`, `allowed_days`, `holiday_calendar_id`, `max_attempts_per_day`, `max_attempts_total`, `min_gap_minutes`, `require_consent`, `ndnc_check`, `promo_requires_140`, `ai_disclosure_text` |
| `user` / `session` / `account` / `member` / `invitation` | Better Auth tables; `member.role` = `owner`, `admin`, `admission_head`, `counsellor`; `user.is_platform_admin` |
| `audit_log` | `actor_user_id`, `impersonator_id`, `action`, `entity`, `entity_id`, `diff` json, `ip` – append-only |

### Students & pipeline
| Table | Key columns / rules |
| :--- | :--- |
| `person` | `full_name`, `preferred_language`, `city`, `state`, `notes` – NO phone/email columns |
| `person_identifier` | `person_id`, `kind` (`phone`/`email`/`application_no`/`external_id`), `value_raw`, `value_norm`; `UNIQUE (tenant_id, kind, value_norm)` |
| `admission_cycle` | `name` (e.g. `2026-27`), `starts_on`, `ends_on`, `is_current` |
| `lead` | `person_id`, `cycle_id`, `source_id`, `program_id`, `stage`, `sub_stage_id`, `current_temperature` (trigger cache), `next_step`, `next_step_due_at`, `owner_counsellor_id`, `ai_agent_id`; `UNIQUE (tenant_id, person_id, cycle_id)` |
| `lead_stage_history` | `lead_id`, `from_stage`, `to_stage`, `reason`, `actor` (`user`/`ai`/`system`/`integration`), `at` |
| `lead_sub_stage` | `core_stage`, `name`, `sort_order` – tenant-defined |
| `lead_temperature_observation` | `lead_id`, `value`, `source` (`ai_analyst`/`counsellor`/`system`), `verbatim_quote`, `call_attempt_id`, `observed_at` – append-only; trigger updates `lead.current_temperature` |
| `lead_note` | `lead_id`, `author_id`, `body`, `kind` (`note`/`outcome`/`comment`) |
| `task` | `lead_id`, `assignee_id`, `title`, `due_at`, `status`, `kind` (`callback`/`follow_up`/`document`) |
| `consent_record` | `person_id`, `channel`, `purpose`, `granted`, `source`, `evidence` (e.g. form URL, call quote), `at` |
| `suppression` | `identifier` `value_norm`, `reason` (`dnd`/`ndnc`/`opt_out`/`invalid`), `source`, `expires_at` |
| `duplicate_candidate` | `person_a`, `person_b`, `reason`, `status` (`open`/`merged`/`dismissed`) |

### Calls & AI
| Table | Key columns / rules |
| :--- | :--- |
| `ai_agent` | `display_name` (tenant-facing), `dograh_workflow_id`, `language`, `voice`, `is_active` |
| `ai_agent_counsellor` | `ai_agent_id`, `user_id` – which counsellors own this agent's leads |
| `campaign` | `name`, `ai_agent_id`, `lead_filter` json, `schedule`, `status` – CRM-owned; dials go through policy engine |
| `call_attempt` | `lead_id`, `campaign_id`, `ai_agent_id`, `dograh_run_id`, `status` (`reserved`/`dialing`/`in_progress`/`completed`/`failed`/`no_answer`/`busy`/`rejected`), `reject_code`, `started_at`, `duration_s`, `disposition`, `recording_key`, `transcript` json; partial `UNIQUE (lead_id) WHERE status IN ('reserved','dialing','in_progress')` |
| `dograh_run_raw` | `dograh_run_id` (unique per tenant), `payload` json, `fetched_at` – raw mirror, never edited |
| `sync_cursor` | `source`, `window_start`, `window_end`, `last_run_at`, `counts` |
| `agent_tool_call` | `call_attempt_id`, `tool`, `request` json, `response` json, `latency_ms`, `ok` |
| `analysis` | `call_attempt_id`, `model`, `summary`, `next_step`, `objections` json, `needs_counsellor`, `raw` json |
| `counsellor_queue_item` | `lead_id`, `kind` (`needs_counsellor`/`review_call`/`sla_breach`), `reason`, `assignee_id`, `status`, `due_at`, `resolved_at`, `outcome` |
| `program` / `program_fee` / `program_seat` / `program_deadline` | catalog; seat status stored as bucket (`open`/`limited`/`closed`) |
| `kb_document` | `title`, `body`/markdown, `program_id` null, `tags` – knowledge base for `get_program_info` |
| `llm_provider_config` | `provider`, `model`, `secret_ref`, `purpose` (`analyst`/`planner`) |
| `planner_proposal` | `lead_id`, `action`, `channel`, `scheduled_for`, `rationale`, `status` (`proposed`/`permitted`/`rejected`/`effected`), `reject_code` |
| `tenant_extraction_rules` | `field_key` (unique per tenant, may not collide with core analysis fields), `label`, `data_type` (`text`/`number`/`boolean`/`enum`/`date`), `enum_values[]`, `description` (instruction to the model), `requires_quote`, `is_active`, `sort_order` – custom transcript fields merged into the analyst schema at runtime; values land in `analysis.extracted` json |

### Visits, applications, messaging
| Table | Key columns / rules |
| :--- | :--- |
| `campus_visit` | `lead_id`, `scheduled_at`, `campus`, `booked_by` (`ai`/`user`), `status` (`booked`/`rescheduled`/`attended`/`no_show`/`cancelled`), `outcome_note` |
| `meeting` | `lead_id`, `counsellor_id`, `scheduled_at`, `mode` (`call`/`video`/`in_person`), `status`, `outcome_note` |
| `application` | `lead_id`, `external_application_no`, `status` (`not_started`/`form_started`/`form_submitted`/`fee_paid`/`admitted`/`enrolled`/`withdrawn`), `fee_amount`, `paid_at`, `source` |
| `tracked_link` | `lead_id`, `token`, `target_url`, `purpose`, `clicks`, `last_clicked_at` |
| `whatsapp_template` / `whatsapp_message` | template name, language, body vars; message direction, status, `provider_id`, body |

### Integrations & billing
| Table | Key columns / rules |
| :--- | :--- |
| `intake_source` | `name`, `kind` (`form`/`aggregator`/`meta`/`google`/`csv`/`erp`), `secret_token_hash`, `field_mapping` json, `default_program_id`, `default_agent_id`, `auto_dial` |
| `api_key` | `name`, `prefix`, `hash` (argon2), `scopes[]`, `last_used_at`, `revoked_at` |
| `webhook_subscription` / `webhook_delivery` | `url`, `secret_ref`, `events[]`; delivery: `event`, `payload`, `attempt`, `status_code`, `next_retry_at` |
| `plan` | `name`, `monthly_fee`, `included_minutes`, `included_whatsapp`, overage rates, `billing_mode` (`prepaid`/`postpaid`) |
| `usage_event` | `kind` (`call_minute`/`whatsapp`/`analyst_run`/`sms`), `quantity`, `unit_price`, `call_attempt_id`, `at` – the single ledger |
| `wallet_transaction` | `amount` (+top-up / -usage), `balance_after`, `reference`, `created_by` |
| `invoice_statement` | `period`, `totals` json, `file_key` |
| `notification` | `user_id`, `kind`, `title`, `link`, `read_at` |
| `saved_view` | `user_id`, `entity`, `filters` json, `is_shared` |

### 6.1 Rules that are enforced by the database (not just code)
* **Dedupe:** `UNIQUE (tenant_id, kind, value_norm)` on `person_identifier`. Phones normalised to E.164 (`+91...`) before insert; emails lower-cased and trimmed.
* **One active call per lead:** partial unique index on `call_attempt(lead_id)` for active statuses. A second reserve fails $\rightarrow$ job exits cleanly. This is what makes the chaos test pass.
* **One lead per person per cycle:** `UNIQUE (tenant_id, person_id, cycle_id)`.
* **Verbatim quotes:** a trigger on `lead_temperature_observation` (`source = ai_analyst`) and on `analysis` objections rejects the row unless the quote is an exact substring of the call transcript text (after collapsing whitespace). Fabricated quotes fail the write.
* **Append-only:** observations, stage history, `audit_log`, `usage_event` and `wallet_transaction` have no `UPDATE`/`DELETE` grants for the app role.
* **Merge rule:** merging two persons moves identifiers, leads, consent and notes to the surviving person, logs both IDs in `audit_log`, and never deletes call history.

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 12–14)*

## 7. Business rules

### 7.1 Pipeline: fixed core stages

| # | Core stage | Enters when | Typical next step |
| :--- | :--- | :--- | :--- |
| 1 | **New** | Lead created from any source | AI call (auto) |
| 2 | **Attempting** | First dial reserved; not yet connected | Retry per policy |
| 3 | **Connected** | A call connected ($> 15\text{ s}$ talk) | Analyst sets temperature |
| 4 | **Interested** | Analyst/counsellor marks Hot or Warm | Book visit / fill form |
| 5 | **Visit booked** | `campus_visit` status = `booked` | Reminder; attend visit |
| 6 | **Visited** | `campus_visit` status = `attended` | Fill form |
| 7 | **Applied** | `application` status = `form_submitted` | Pay fee |
| 8 | **Fee paid** | `application` status = `fee_paid` | Enrol |
| 9 | **Enrolled** | `application` status = `enrolled`/`admitted` | — |
| – | **Lost** | Counsellor closes with reason, or Cold after $N$ attempts (policy) | Re-engage next cycle |
| – | **Invalid** | Wrong number / not a student / duplicate | — |

Tenants add their own sub-stages under any core stage (e.g. Interested $\rightarrow$ 'Waiting for JEE result'). Stage moves are allowed forward automatically by integrations (visit attended, form submitted, fee paid) and in any direction by users with a logged reason. Every move writes `lead_stage_history`.

### 7.2 Temperature and next step

| Value | Meaning | Evidence required |
| :--- | :--- | :--- |
| **Hot** | Clear intent to apply/visit this cycle | Verbatim quote from the transcript |
| **Warm** | Interested, has open questions or timing issues | Verbatim quote |
| **Cold** | Not interested now / other college / no response pattern | Verbatim quote or attempt history |
| **Invalid** | Wrong number, not the student or parent, spam | Quote or disposition |

**Next step** is required on every lead that isn't Enrolled/Lost/Invalid. Allowed values: `book_visit`, `fill_form`, `pay_fee`, `callback`, `counsellor_call`, `send_info`, `none`, with a due date. The SLA timer job raises a counsellor queue item when a next step is overdue.

### 7.3 Policy engine (the gatekeeper)
A pure function in `packages/policy`: `evaluate(action, lead, person, tenantPolicy, context, now)` $\rightarrow$ `{ allow: true } | { allow: false, code, retryAt? }`. No database or network calls inside it – the caller loads the inputs. That makes it 100% unit-testable. Every dial, WhatsApp send and planner action goes through it.

| Order | Rule | Default | Reject code |
| :--- | :--- | :--- | :--- |
| 1 | Tenant active | – | `TENANT_SUSPENDED` |
| 2 | Wallet / plan has balance for the action | Hard stop at 0 (prepaid) | `WALLET_EMPTY` |
| 3 | Identifier not in suppression (opt-out, DND, invalid) | – | `SUPPRESSED` |
| 4 | NDNC status checked and clear (if `tenant_policy.ndnc_check`) | On | `NDNC_LISTED` / `NDNC_UNKNOWN` |
| 5 | Consent present for channel + purpose (if `require_consent`) | On; form submission counts as consent with evidence | `NO_CONSENT` |
| 6 | Inside calling window in tenant timezone, allowed day, not a holiday | 09:00–21:00, Mon–Sat | `OUTSIDE_WINDOW` (+ `retryAt`) |
| 7 | Attempts today $<$ `max_attempts_per_day`; total $<$ `max_attempts_total` | $3 / 8$ | `CAP_REACHED` |
| 8 | Min gap since last attempt | $60\text{ min}$ | `TOO_SOON` (+ `retryAt`) |
| 9 | Promotional call needs 140-series caller ID flag | Flag only (warn) until legal decides | `PROMO_NUMBER_REQUIRED` |
| 10 | No active call already (also enforced by DB index) | – | `CALL_IN_PROGRESS` |

### 7.4 The 12 agent tools (`/api/agent-tools/v1/*`)
Called by Dograh workflows during live calls. Auth: HMAC-SHA256 over `timestamp + '.' + raw_body` with the tenant's tool secret, header `X-Signature` + `X-Timestamp`, reject if clock skew $> 5\text{ min}$. $p99$ latency $< 500\text{ ms}$. Every call is logged in `agent_tool_call`. Answers are short, speakable, and categorical – never raw seat counts.

| Tool | Purpose | Returns |
| :--- | :--- | :--- |
| `get_lead_context` | Who am I talking to (backup if `initial_context` is missing) | name, program interest, language, last call summary, stage |
| `get_program_info` | Fees, duration, eligibility, highlights – mandatory before stating any fact | facts + kb snippet ids (cited) |
| `check_seat_and_deadline` | Seat availability and deadline | bucket `open`/`limited`/`closed` + deadline date |
| `check_eligibility` | Does marks/stream meet criteria | `eligible` / `not_eligible` / `needs_review` + reason |
| `list_visit_slots` | Available campus visit slots | next 5 slots |
| `book_campus_visit` | Book or reschedule a visit | confirmation id + time (triggers WhatsApp confirm) |
| `schedule_callback` | Student asks to be called later | scheduled time (policy-checked) |
| `request_counsellor` | Student wants a human / AI can't resolve | queue item id + what to tell the student |
| `send_info_whatsapp` | Send brochure / fee sheet / portal link | `sent` / `queued` |
| `update_preferences` | Program interest, language, city, parent contact | `ok` |
| `record_consent_or_optout` | Student agrees to contact or says stop | `ok` (opt-out adds suppression immediately) |
| `log_call_outcome` | Agent's own end-of-call disposition | `ok` (analyst still runs) |

### 7.5 Roles and permissions

| Capability | Super-admin | Owner/Admin | Admission head | Counsellor |
| :--- | :---: | :---: | :---: | :---: |
| Create/suspend tenants, map Dograh org, impersonate | ✓ | | | |
| Branding, domain, team, API keys, webhooks, billing | ✓ | ✓ | | |
| Policy settings, AI agents, programs, KB, intake sources | ✓ | ✓ | view | |
| Campaigns (create/start/stop) | ✓ | ✓ | ✓ | |
| See all leads, dashboard, exports | ✓ | ✓ | ✓ | own |
| Assign leads, assignment rules, bulk actions | ✓ | ✓ | ✓ | |
| Review queue: verify/override AI labels | ✓ | ✓ | ✓ | own |
| Needs-counsellor queue, notes, visits, meetings, outcomes | ✓ | ✓ | ✓ | own |
| Listen to recordings (logged) | ✓ | ✓ | ✓ | own |
| DPDP: export / erase person data | ✓ | ✓ | | |

*'own' = only leads of AI agents the counsellor is allocated to, or leads assigned to them. Enforced in the service layer on top of RLS.*

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 14–15)*

## 8. Team, ownership and daily rhythm

| Who | Track | Owns (you are the person who answers for it) |
| :--- | :--- | :--- |
| **I1** | Platform, DevOps & AI analyst | VPS, Docker Compose, Caddy, Postgres ops, backups/restore, CI/CD, monitoring, R2, white-label domains/TLS, LLM adapter, A2 analyst, golden-set eval, load + DR tests |
| **I2** | Backend core | Schema & migrations, RLS, Fastify plugins, auth & roles, intake, policy engine, dial fast-path, counsellor/visit/task backend, programs & KB, public API v1, outbound webhooks, billing, planner, DPDP tools |
| **I3** | Integrations | Dograh adapter, sync + backfill, Dograh webhooks, call finalize, recording archive, agent tools, CSV import, campaigns, WhatsApp (YesBoss), portal status sync, tracked links, super-admin backend, email, MIT-ADT production cutover |
| **I4** | Frontend | Old-app security fixes, move console into `apps/web`, design system with theme tokens, every page in the sitemap (Appendix B), e2e tests with Playwright, screenshot review at desktop + 390 px |
| **Vaidik** | Architecture & gatekeeper | Day-1 secret rotation, Git host & repo, Dograh fork patch, spikes with I3, PR reviews, daily checkpoint sign-off, golden-set labelling, legal/compliance follow-ups, vendor accounts (R2, SES/Resend, YesBoss, LLM keys) |

### 8.1 Daily rhythm (8-hour day)

| Time | What | Rule |
| :--- | :--- | :--- |
| **09:30 (15 min)** | Standup | Each intern: yesterday's done IDs, today's IDs, blockers. Blockers $> 30\text{ min}$ go to Vaidik immediately, not at standup. |
| **09:45–13:00** | Build block 1 | P0 tasks first. Open a draft PR within the first hour of each task. |
| **13:00** | PR review window #1 | Vaidik reviews; interns fix comments right after lunch. |
| **14:00–17:30** | Build block 2 | Merge P0s by 16:00 so the integration has time to settle on staging. |
| **17:30** | PR review window #2 + staging deploy | `main` $\rightarrow$ staging automatically; production only after a checkpoint passes. |
| **18:00 (30 min)** | Checkpoint demo | Run the day's checkpoint table live on staging. Tick or record carry-over. |

### 8.2 Git rules (host decided by Vaidik on Day 1)
* **Branch from `main`:** `feat/D3-I2-04-intake-endpoint`, `fix/...`, `chore/...`.
* **Commits use Conventional Commits:** `feat(intake): map aggregator fields`.
* **PR title starts with the task ID.** PR template asks: what/why, task ID, screenshots (UI), how tested, migration added ($y/n$), tenant-scope checked ($y/n$).
* **`main` is protected:** PR + green CI + Vaidik approval. No force-push, no direct pushes.
* **Small PRs** ($< 400$ changed lines excluding generated files). An AI tool will happily produce 3,000 lines – split it.
* **Migrations:** one intern (I2) merges migrations; others request schema changes through I2 to avoid numbering clashes. File names are timestamps, so conflicts are rare, but order matters.

### 8.3 Environments

| Env | Where | Data | Deploys |
| :--- | :--- | :--- | :--- |
| **local** | Each laptop: `docker compose up` (Postgres + api + worker + web) | Seed data only | — |
| **staging** | VPS, separate compose project + separate database, `staging.laveric.com` | Seed + a copy of MIT-ADT Dograh history | Every merge to `main` |
| **production** | VPS, `app.laveric.com` + tenant domains | Real | Manual, after checkpoint passes (tag `v0.D<n>`) |

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 15–17)*

## 9. How we build with AI coding agents

Nobody writes code by hand from scratch on this project; you direct an AI agent (opencode, Amazon Q Developer, or another). That only works if the agent has the right context and you check its work. The quality of the output is decided by the quality of the context you give it. This section is the method; follow it every task.

### 9.1 The three context files

| File | Who writes it | What goes in it |
| :--- | :--- | :--- |
| `AGENTS.md` (repo root) | Vaidik + I2 on Day 1; anyone may propose edits by PR | Stack and versions; folder map; module pattern; commands (install, dev, test, migrate, codegen); the NEVER list; definition of done. opencode reads it automatically; `.amazonq/rules/project.md` just says 'Follow AGENTS.md'. |
| `docs/specs/<module>.md` | The task owner, before prompting – 20 minutes max | Goal, user stories, endpoints with request/response examples, tables touched, edge cases, acceptance tests. This is the main context you attach to every prompt. |
| `packages/integrations/<x>/fixtures/` | I3 during spikes | Real JSON payloads from Dograh, YesBoss, the portal. AI tools guess badly at APIs; real payloads stop that. |

#### The NEVER list (copy into `AGENTS.md`)
* Never change the database without a new migration file in `packages/db/migrations`.
* Never write a query that isn't tenant-scoped; never use a DB role that bypasses RLS in request code.
* Never put secrets, API keys or real phone numbers in code, tests, fixtures or commits (mask phones in fixtures).
* Never show the word 'Dograh' (or its URLs, IDs, error messages) in UI, API responses, emails or logs visible to tenants.
* Never dial, message or schedule outreach without going through the policy engine.
* Never call an LLM inside an HTTP request handler; enqueue a job.
* Never let `crm-web` touch Postgres, R2 or a provider directly.
* Never edit an applied migration, generated types, or lockfiles by hand.
* Never disable a failing test to make CI green – fix it or ask.

#### Definition of done (every task)
* Acceptance criteria in this handbook pass, demonstrated on staging.
* Typecheck, lint and tests green in CI; new logic has tests (policy engine and services: unit; endpoints: integration against real Postgres).
* Tenant isolation test added for any new tenant table or endpoint.
* UI change: screenshot at desktop and 390 px attached to the PR; empty, loading and error states exist.
* Spec file updated if behaviour differs from what was planned.
* Vaidik approved and merged.

### 9.2 The prompt recipe (use for every task)

| Part | What to write |
| :--- | :--- |
| **1. Goal** | One sentence, with the task ID. `'D3-I2-04: build POST /api/intake/:source that creates person + lead and enqueues call.dial in one transaction.'` |
| **2. Read first** | List the exact files: `AGENTS.md`, `docs/specs/intake.md`, `apps/api/src/modules/leads/*` (as the pattern), `packages/db/migrations/<latest>.sql`, `packages/contracts/intake.ts`. |
| **3. Constraints** | Copy the relevant NEVER items + task-specific ones ('dedupe via `person_identifier` unique constraint, use `ON CONFLICT`', 'respond in $< 300\text{ ms}$, no external calls'). |
| **4. Acceptance tests** | Paste the 'Done when' column. Ask the tool to write these tests first. |
| **5. Plan first** | `'Show me your plan and the list of files you will create or change. Do not write code until I say go.'` |

> **Why 'plan first' matters**
> Reading a 15-line plan takes 1 minute and catches 80% of wrong turns (wrong folder, invented API, missing migration, no tenant scope). Reading 600 lines of generated code to find the same mistake takes 30 minutes. Reject the plan freely; re-prompt with what was wrong.

### 9.3 Working loop with the agent
1. Write or update the spec (`docs/specs/...`). Commit it in the same PR.
2. Prompt with the recipe. Review the plan. Correct it.
3. Let it write tests first, then the implementation. Run tests locally yourself – don't trust 'all tests pass' in the chat.
4. Ask the agent to review its own diff against the NEVER list and the acceptance criteria ('list any rule this diff breaks').
5. Run the feature by hand on local (curl / browser). For UI, take the two screenshots.
6. Open the PR with the template filled. Fix review comments by prompting with the comment text + file path.
7. If the agent loops on the same error 3 times: stop, paste the full error + the file into a fresh session with only the relevant context. Still stuck after 30 minutes $\rightarrow$ ask Vaidik.

### 9.4 Example prompts (adapt, don't copy blindly)

**I2 – schema**
> `D1-I2-04`: Create the first dbmate migration for the `crm` schema with the tables in `docs/specs/data-model.md`, sections 'Platform & tenancy' and 'Students & pipeline'. Read `AGENTS.md` and `docs/specs/data-model.md` first. Every tenant table gets `tenant_id`, RLS enabled and the policy using `current_setting('app.tenant_id')`. Include the unique constraints listed. Write a down migration. Then write a Vitest integration test that sets `app.tenant_id` to tenant A, inserts a person, switches to tenant B and asserts zero rows. Show me the plan first.

**I3 – Dograh sync**
> `D2-I3-03`: Implement the `dograh.sync` pg-boss job. Read `AGENTS.md`, `docs/specs/dograh-sync.md` and the fixtures in `packages/integrations/dograh/fixtures/runs-page.json`. It pages through runs for one tenant in a date window, upserts each into `crm.dograh_run_raw` by `dograh_run_id`, and stores the cursor in `crm.sync_cursor`. Idempotent: running twice must not create duplicates. Use the tenant's decrypted API key from `tenant_secret` via the existing secrets service. Write tests using the fixture. Plan first.

**I4 – Lead 360**
> `D3-I4-01`: Build the Lead 360 page at `/leads/$leadId`. Read `AGENTS.md`, `docs/specs/lead-360.md`, `packages/contracts/leads.ts` and the existing Leads list page as the pattern. Data only from `GET /api/leads/:id` and `GET /api/leads/:id/timeline` via TanStack Query. Show header (name, identifiers masked except last 4 digits for counsellors, stage, sub-stage, temperature badge, next step, owner), a timeline, and action buttons. Must have loading, empty and error states and work at 390 px width. Plan first, listing components you will create.

**I1 – analyst**
> `D4-I1-03`: Implement the `analyst.run` job using the LLM adapter in `packages/integrations/llm`. Read `AGENTS.md`, `docs/specs/analyst.md` and three transcripts in `packages/integrations/dograh/fixtures/transcripts/`. Use `generateObject` with the zod schema from `packages/contracts/analysis.ts`. Before writing, verify every `verbatim_quote` is an exact substring of the transcript text after whitespace collapse; drop and log any that aren't, and retry once. The DB trigger is the final guard. Plan first.

### 9.5 Spec file template (`docs/specs/<module>.md`)
* **Goal** – 2 lines.
* **Users & stories** – 'As a counsellor I can ... so that ...'.
* **Endpoints / jobs / pages** – method, path, request + response JSON example, errors.
* **Tables touched** – and which columns.
* **Rules & edge cases** – duplicates, out-of-order events, missing data, timezone, permissions.
* **Acceptance tests** – copied from this handbook, plus your own.
* **Out of scope** – so the AI doesn't build extras.

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 17)*

## 10. The 7-day plan

Four tracks run in parallel every day. Read your row of the overview, then your day's table. Tasks are ordered: do them top to bottom unless blocked. Priority: **P0** go-live depends on it · **P1** in scope, after the day's P0s · **P2** in scope, may slip to the Day 8–10 buffer (Section 13).

| Day | I1 Platform & AI | I2 Backend core | I3 Integrations | I4 Frontend | Checkpoint |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | VPS audit, Compose, Postgres, Caddy, R2, backups, monitoring | Monorepo, CI, `AGENTS.md`, schema $\text{v1} + \text{RLS}$ | Spikes with Vaidik, Dograh contract + fixtures | Old-app security fix, move UI into `apps/web`, design system, sitemap shell | Secure & set up |
| **2** | Staging/prod deploy pipeline, logging, storage adapter | Fastify plugins, auth + roles, tenant ctx, pg-boss, secrets, seed | Dograh adapter, sync, derive, webhook receiver, backfill | Auth pages, API client, Leads list, dashboard shell | Real MIT-ADT data visible, isolated |
| **3** | Recording proxy, Playwright CI, intake load script, NDNC import | Intake, policy engine, reserve-then-dial | Call finalize, recording archive, CSV import, campaigns | Lead 360, dashboard aggregates, intake + CSV UI, campaigns UI | Speed-to-lead works |
| **4** | LLM adapter, A2 analyst, golden set eval | Programs/KB, AI agents, assignment, queues, visits, tasks, notes | Dograh patch support, 12 agent tools, tool config in workflows | Counsellor workspace, review queue, visits, programs/KB, agents | AI + humans loop works |
| **5** | Application/fee sync, stage auto-advance, tracked links | Public API v1, API keys, outbound webhooks | YesBoss adapter, templates, inbound, statuses | Applications, WhatsApp UI, integrations settings | Plugs into anything |
| **6** | White-label: branding, custom domains + TLS, SLA/digest/notifications, compliance auditor | Billing (plans, wallet, ledger, statements), planner + supervisor queue | Super-admin backend, tenant creation, impersonation, team, email | Platform console, branding, team, billing, search, views, bulk, notifications, duplicates, performance | Second tenant in $< 10\text{ min}$ |
| **7** | Load test, DR drill, alerts, runbooks | DPDP tools, security fixes, audit/recording logs | MIT-ADT production cutover | Full e2e, screenshot review, polish | GO-LIVE gate |

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 18–20)*

### Day 1 – Secure the old app, set up everything, answer the unknowns
**Goal of the day:** the old console stops leaking data; the VPS, repo, CI, database and backups exist; we know exactly how Dograh behaves before building on it.

#### Vaidik
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D1-V-01` | P0 | **Rotate secrets**<br>Rotate Dograh API key, Neon password, Google OAuth client secret. Update the old app's env on Vercel. Store new secrets in a password manager, not chat. | Old values return auth errors; old app still works with new values. |
| `D1-V-02` | P0 | **Git host + repo**<br>Pick the host (GitHub/GitLab/self-hosted Gitea). Create the `vernacular-crm` repo, protect `main`, add the 4 interns. | Each intern has pushed a branch and opened a test PR. |
| `D1-V-03` | P0 | **Vendor accounts**<br>R2 bucket + access keys (I1), email provider (SES or Resend), LLM API key, YesBoss account + API docs request, domain DNS access for `laveric.com`. | Credentials handed to I1 via password manager. |
| `D1-V-04` | P0 | **Spikes with I3**<br>Answer: (a) can Dograh orgs + API keys be created via API? (b) what does `initial_context` contain at turn 0? (c) do `{{initial_context.*}}` templates resolve inside `http_api` tool configs? (d) exact webhook payload on call end; (e) initiate-call request/response. | `docs/specs/dograh-contract.md` has a written answer + saved payload for each. |
| `D1-V-05` | P1 | **Start the Dograh fork patch**<br>`initial_context` passthrough on initiate-call, honour an `Idempotency-Key` header, max call duration. $\sim 30$ lines. Deploy to Dograh by end of Day 3. | Branch exists; plan reviewed with I3. |

#### I1 – Platform, DevOps & AI
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D1-I1-01` | P0 | **VPS audit**<br>Record CPU, RAM, disk, Docker version, open ports, current Dograh containers and their usage during a live call (`docker stats`). Write `docs/ops/vps.md` with a recommendation: same box OK, or resize, or second box for Postgres. | `vps.md` merged; Vaidik agrees with the sizing call. |
| `D1-I1-02` | P0 | **Docker Compose stack**<br>`infra/docker-compose.yml`: `postgres:17` (own volume, not Dograh's), `caddy`, `crm-api`, `crm-worker`, `crm-web` (placeholders ok). Healthchecks. Postgres only on the internal Docker network. Separate compose project names for staging and production. | `docker compose up` on the VPS $\rightarrow$ all containers healthy; Postgres not reachable from the internet (port scan). |
| `D1-I1-03` | P0 | **Caddy base config**<br>`staging.laveric.com` and `app.laveric.com` with automatic TLS; `/api/*` and `/v1/*` $\rightarrow$ `crm-api:3001`, `/*` $\rightarrow$ `crm-web:3000`. Security headers (HSTS, `X-Frame-Options`, `Referrer-Policy`). | Both hosts serve the placeholders over HTTPS with A grade on securityheaders.com. |
| `D1-I1-04` | P0 | **Backups + restore drill**<br>wal-g (or pgBackRest) to R2: nightly base backup + continuous WAL. Script `infra/backup/restore.sh` restores into a scratch container. Run the drill once. | Restore drill log in `docs/runbooks/restore.md` with timestamps; restored DB has the test row. |
| `D1-I1-05` | P1 | **Monitoring**<br>Uptime Kuma (checks `/health` on api and web, Postgres TCP) with alerts to Vaidik's email/Telegram. GlitchTip container + DSN for api, worker, web. | Stopping `crm-api` triggers an alert within $2\text{ min}$; a thrown test error appears in GlitchTip. |
| `D1-I1-06` | P1 | **R2 layout**<br>Bucket(s): `vernacular-prod`, `vernacular-staging`, `vernacular-backups`. Key convention `tenants/<tenant_id>/recordings|files|branding/...`. Bucket is private. | Unsigned GET returns 403; documented in `AGENTS.md`. |

#### I2 – Backend core
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D1-I2-01` | P0 | **Monorepo skeleton**<br>pnpm + Turborepo with `apps/api`, `apps/worker`, `apps/web` (empty), `packages/db`, `contracts`, `policy`, `integrations/*`. Shared `tsconfig` (strict), ESLint, Prettier. `apps/api` serves `GET /health`. | `pnpm i && pnpm dev` runs api on 3001; `/health` returns `{ok:true,version}`. |
| `D1-I2-02` | P0 | **CI pipeline**<br>On every PR: install, lint, typecheck, unit + integration tests (Postgres service container), build, and a grep that fails if any migration or query mentions `'public.'`. | A PR with a type error fails; a clean PR passes in $< 8\text{ min}$. |
| `D1-I2-03` | P0 | **`AGENTS.md` + rules + PR template**<br>Write `AGENTS.md` (Section 9.1 content), `.amazonq/rules/project.md`, PR template, `docs/specs/README.md` with the spec template. | Vaidik approved; opencode and Amazon Q both pick it up (test: ask the tool 'what is the NEVER list?'). |
| `D1-I2-04` | P0 | **Schema v1 + RLS**<br>dbmate migration: `crm` schema, app role without `BYPASSRLS`, tables from Section 6 'Platform & tenancy' and 'Students & pipeline' + `call_attempt`, `dograh_run_raw`, `sync_cursor`. Constraints and triggers from 6.1 (observation $\rightarrow$ `current_temperature` cache). `kysely-codegen` output committed. | Migration up/down/up clean on empty DB; integration test: tenant B sees zero rows of tenant A for every table. |
| `D1-I2-05` | P1 | **`docs/specs/data-model.md`**<br>Convert Section 6 into the spec the AI tools will read, including enum values. | Merged; referenced from `AGENTS.md`. |

#### I3 – Integrations
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D1-I3-01` | P0 | **Spikes (with Vaidik)**<br>Run `D1-V-04` hands-on: call the Dograh API with Postman/curl, trigger a test call, capture the webhook with a temporary endpoint. Save every payload (phones masked) into `packages/integrations/dograh/fixtures/`. | Fixtures: runs list page, run detail with transcript, webhook call-ended, initiate-call request/response, workflow list. |
| `D1-I3-02` | P0 | **Dograh contract spec**<br>`docs/specs/dograh-contract.md`: endpoints used, auth, pagination, rate limits, fields we map (run $\rightarrow$ `call_attempt`, phone $\rightarrow$ `person_identifier`), how `total_count` works per date window, unknowns. | Vaidik signs off; every field in `call_attempt` has a source. |
| `D1-I3-03` | P1 | **Review old adapter logic**<br>Read `src/api/adapters.ts` in the old repo; document the mapping rules worth keeping in the spec (status mapping, disposition, phone formats). | Mapping table in the spec. |
| `D1-I3-04` | P1 | **YesBoss + portal discovery**<br>Collect YesBoss API docs (send, templates, webhooks, status). Ask MIT-ADT (via Vaidik) for a sample application/fee export from their portal. | `docs/specs/whatsapp.md` and `docs/specs/portal-sync.md` started with what is known + open questions. |

#### I4 – Frontend
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D1-I4-01` | P0 | **Old app security fix**<br>In `src/api/dograh/server-fns.ts` add `requireAdminSession()` to `listWorkflowOptions`, `listCampaigns`, `getCampaign`, `getCampaignProgress`, `listRuns`, `getUsageAnalytics`. Remove `BETTER_AUTH_URL` from `.env.local`. Hide the fake WhatsApp page from nav and routes. Deploy. | Unauthenticated POST to each of the $\text{six} \rightarrow 401$ (curl output in PR); logged-in admin still sees data. |
| `D1-I4-02` | P0 | **Move console into `apps/web`**<br>Copy the TanStack Start app into `apps/web`. Delete every direct DB / Dograh import from the UI; replace with stubs that call `/api` (will 404 for now). | `apps/web` builds; grep for `'pg'`, `'kysely'`, `'dograh'` in `apps/web` returns nothing. |
| `D1-I4-03` | P0 | **Design system + theme tokens**<br>Tailwind + shadcn/ui. All brand colours, logo, product name come from CSS variables / a branding context (fed by `/api/branding` later). Product name defaults to 'Vernacular AI'. | Changing one variable recolours the whole app; no hard-coded brand colour or 'Dograh' text. |
| `D1-I4-04` | P1 | **App shell + sitemap**<br>Layout with sidebar per role, top bar (search placeholder, notifications placeholder, user menu, tenant switcher for super-admin). Placeholder routes for every page in Appendix B. | Every route renders; screenshot of shell at desktop + 390 px. |

#### ✓ Checkpoint 1 – Secure & set up (Day 1, 18:00)
| # | Checkpoint item | How Vaidik verifies (pass = all true) | Status |
| :--- | :--- | :--- | :---: |
| 1 | Old app no longer leaks | curl POST to the six server functions without a cookie $\rightarrow$ 401 each; old secrets rejected. | ☐ |
| 2 | Infrastructure up | `docker compose ps` on VPS: all healthy; `https://staging.laveric.com` loads; Postgres port closed from outside. | ☐ |
| 3 | Backups restorable | `restore.md` shows a successful drill today. | ☐ |
| 4 | Repo & CI working | A test PR from each intern ran CI; `main` is protected. | ☐ |
| 5 | Schema v1 applies and isolates | `dbmate up` from empty DB succeeds; tenant isolation test green in CI. | ☐ |
| 6 | Dograh unknowns answered | `dograh-contract.md` answers spike questions (a)–(e) with fixtures. If (a) is 'no', onboarding uses a manual step noted in Section 12.2. | ☐ |
| 7 | AI tools configured | Each intern shows their tool quoting the NEVER list from `AGENTS.md`. | ☐ |

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 21–23)*

### Day 2 – Foundation, real data in, UI on the API
**Goal of the day:** a logged-in MIT-ADT user sees real, de-duplicated students from all past Dograh calls, served only by `crm-api`, with tenant isolation proven.

#### I1 – Platform, DevOps & AI
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D2-I1-01` | P0 | **Deploy pipeline**<br>CI builds Docker images for `api`, `worker`, `web` on merge to `main`, pushes to a registry (host's registry or GHCR), then SSH-deploys to staging (`compose pull + up + dbmate migrate`). Production deploy = manual workflow with a tag. | A merged PR appears on staging within $10\text{ min}$; rollback = redeploy previous tag (documented). |
| `D2-I1-02` | P0 | **Storage adapter**<br>`packages/integrations/storage`: put, get stream, signed URL ($5\text{ min}$), delete, all keyed by tenant. Refuses keys outside `tenants/<current_tenant>/`. | Unit tests incl. cross-tenant key refusal. |
| `D2-I1-03` | P1 | **Structured logging**<br>pino JSON logs with `request_id`, `tenant_id`, `user_id`; phone numbers masked by a log redactor. Docker log rotation. | A request's logs can be followed by `request_id`; no full phone numbers in logs (grep test). |
| `D2-I1-04` | P1 | **Staging data**<br>Script to copy MIT-ADT Dograh history into staging (via the backfill job once I3 lands it). | Staging has real-shaped data by evening. |

#### I2 – Backend core
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D2-I2-01` | P0 | **Fastify plugins**<br>config (zod-validated env, fail fast), db (Kysely pool), request transaction + `SET LOCAL app.tenant_id`, zod type provider, error format `{error: {code,message,details}}`, rate limit, swagger at `/api/docs` (internal only). | Integration test: every route runs inside a tenant transaction; a route without tenant context returns 401. |
| `D2-I2-02` | P0 | **Better Auth in Fastify**<br>Email + password and Google login, organization plugin = tenant, roles `owner`/`admin`/`admission_head`/`counsellor`, platform admin flag. Session cookie, same origin. Tenant resolved from session (and later from `Host` header). | Login/logout works on staging; a counsellor can't call an admin route (403 test). |
| `D2-I2-03` | P0 | **Permission guard**<br>`requireRole(...)` and `requireLeadAccess(leadId)` helpers; counsellor 'own' rule from Section 7.5. | Tests for each role on a sample route. |
| `D2-I2-04` | P0 | **pg-boss + worker**<br>pg-boss in its own schema in the `crm` DB. Helper `enqueueInTx(tx, job, data)`. Worker entrypoint registers jobs from modules. Dead-letter + retry defaults. | Job enqueued inside a rolled-back transaction never runs (test). |
| `D2-I2-05` | P0 | **Tenant secrets**<br>AES-256-GCM encrypt/decrypt with `MASTER_KEY` from env, `key_version` for rotation. Service `getSecret(tenantId, kind)`. | Ciphertext in DB, plaintext never logged; test round-trip. |
| `D2-I2-06` | P1 | **Seed**<br>Seed script: platform admin (Vaidik), MIT-ADT tenant with default policy, one admission head, two counsellors, current admission cycle. | `pnpm db:seed` on empty DB gives a usable login. |

#### I3 – Integrations
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D2-I3-01` | P0 | **Dograh adapter**<br>`packages/integrations/dograh`: typed client built from the fixtures (list runs by date window, get run, list workflows, initiate call, campaigns). Takes the tenant's API key. Maps Dograh errors to our codes (no 'Dograh' in messages). | Tests against fixtures; timeouts and retries set. |
| `D2-I3-02` | P0 | **Sync job**<br>`dograh.sync(tenant, window)`: page through runs, upsert `dograh_run_raw` by `dograh_run_id`, store counts in `sync_cursor`. Scheduled every $5\text{ min}$ for the last $2\text{ hours}$ + nightly for the last $3\text{ days}$. | Running twice creates no duplicates; counts recorded. |
| `D2-I3-03` | P0 | **Derive job**<br>`dograh.derive(run)`: normalise phone $\rightarrow$ find/create `person` via `person_identifier` $\rightarrow$ find/create `lead` for current cycle $\rightarrow$ upsert `call_attempt`. Port the useful rules from `adapters.ts`. | Two runs for the same phone $\rightarrow$ one `person`, one `lead`, two `call_attempts`. |
| `D2-I3-04` | P0 | **Webhook receiver**<br>`POST /api/webhooks/dograh/:tenantKey` – verify shared secret, store raw, enqueue derive/finalize, return 200 fast. Idempotent on `run_id` + `event`. | Replaying the same webhook 5x changes nothing after the first; out-of-order events end in the correct final status. |
| `D2-I3-05` | P0 | **Backfill + sync health**<br>Command to backfill all MIT-ADT history day by day. `GET /api/admin/sync-health`: per day, Dograh `total_count` vs our `dograh_run_raw` count vs `call_attempt` count. | Every backfilled day matches exactly (this replaces `st.pdf`'s 7-day wait – see Section 3). |

#### I4 – Frontend
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D2-I4-01` | P0 | **API client + contracts**<br>Typed fetch wrapper using `packages/contracts`; TanStack Query setup; global error toast; 401 $\rightarrow$ login redirect. | No component calls `fetch` directly. |
| `D2-I4-02` | P0 | **Auth pages**<br>Login (email/password + Google), forgot password, accept invitation. Branded from tokens. | Login works on staging with seeded users. |
| `D2-I4-03` | P0 | **Leads list**<br>Person-centric table from `GET /api/leads`: server-side pagination, sort, filters (stage, temperature, source, agent, counsellor, date), search by name/phone. Phone masked to last 4 for counsellors. | Shows real MIT-ADT data; same phone appears once. |
| `D2-I4-04` | P1 | **Dashboard shell**<br>Cards and chart placeholders wired to `GET /api/dashboard` (fill in Day 3). | Renders with loading/empty states. |

#### ✓ Checkpoint 2 – Real data, isolated (Day 2, 18:00)
| # | Checkpoint item | How Vaidik verifies (pass = all true) | Status |
| :--- | :--- | :--- | :---: |
| 1 | Backfill matches Dograh | `/api/admin/sync-health`: every day of history shows Dograh total = raw count = `call_attempt` count. | ☐ |
| 2 | Dedupe correct | Pick 5 phones that were called multiple times: each is 1 person, 1 lead, $N$ calls. | ☐ |
| 3 | Isolation proven | Create tenant `'test-b'` with a user; it sees zero MIT-ADT leads via UI and via direct API calls. | ☐ |
| 4 | UI uses only the API | Browser network tab shows only same-origin `/api` calls; grep of `apps/web` clean. | ☐ |
| 5 | Auth & roles | Counsellor gets 403 on an admin endpoint; logged-out request gets 401. | ☐ |
| 6 | Deploy works | Today's merges are on staging via the pipeline, not by hand. | ☐ |

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 24–26)*

### Day 3 – Speed-to-lead: intake, policy, dial, recordings, Lead 360
**Goal of the day:** a new enquiry from any source is called by the AI within 30 seconds (inside the window), exactly once, and the result shows on a full Lead 360 page with recording and transcript.

#### I1 – Platform, DevOps & AI
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D3-I1-01` | P0 | **Recording access**<br>`GET /api/calls/:id/recording` checks lead access, writes `recording_access_log`, returns 302 to a $5\text{-min}$ signed R2 URL (supports seeking). | Counsellor without access $\rightarrow$ 403; access is logged; audio seeks in the browser. |
| `D3-I1-02` | P0 | **Playwright in CI**<br>`tests/e2e` with login fixture per role, screenshot capture at 1440 px and 390 px, artefacts uploaded on CI. | CI job runs e2e against a compose stack and stores screenshots. |
| `D3-I1-03` | P1 | **Intake latency script**<br>k6 or a node script that posts $N$ form submissions and measures submit $\rightarrow$ `call_attempt` `'dialing'` time (from DB timestamps). | Prints $p50/p95$; used in Checkpoint 3. |
| `D3-I1-04` | P1 | **NDNC status import**<br>Until a live NDNC/DLT scrub API is contracted: admin uploads a scrub result file (phone, status) $\rightarrow$ `suppression` rows; `person` gets `ndnc_status` + `checked_at`. Adapter interface `NdncProvider` for a future API. | Uploaded listed number $\rightarrow$ policy returns `NDNC_LISTED`. |

#### I2 – Backend core
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D3-I2-01` | P0 | **Policy engine**<br>`packages/policy`: pure `evaluate()` with the 10 rules in Section 7.3, typed reject codes, `retryAt` for window/gap rejections, timezone-aware (tenant tz), holiday list input. | $\ge 40$ unit tests incl. 20:59 vs 21:00, Sunday, holiday, DST-free IST, cap edges; 100% branch coverage on this package. |
| `D3-I2-02` | P0 | **Intake endpoint**<br>`POST /api/intake/:sourceKey` with bearer token per `intake_source`. Apply `field_mapping` (JSON path $\rightarrow$ our field), normalise, dedupe via `ON CONFLICT` on `person_identifier`, create/attach `lead`, write `consent_record` from form evidence, enqueue `call.dial` in the same transaction if `auto_dial`. Respond 202 in $< 300\text{ ms}$. | Duplicate submissions $\rightarrow$ one person/lead; invalid phone $\rightarrow$ 422 with reason; wrong token $\rightarrow$ 401. |
| `D3-I2-03` | P0 | **Reserve-then-dial job**<br>`call.dial(lead)`: load inputs $\rightarrow$ policy evaluate $\rightarrow$ if reject: record reason on lead (+ reschedule at `retryAt`) $\rightarrow$ else insert `call_attempt` `'reserved'` (partial unique index guards) $\rightarrow$ Dograh initiate-call with `Idempotency-Key` = `call_attempt` id and `initial_context` $\rightarrow$ status `'dialing'`. Records usage reservation. | Chaos: kill worker between reserve and dial, restart $\rightarrow$ exactly one `call_attempt` and one real call. |
| `D3-I2-04` | P1 | **Policy settings API**<br>`GET`/`PUT` `/api/settings/policy`, holiday calendar CRUD. Defaults from Section 7.3. | Changing window to 10:00–18:00 changes dial behaviour immediately. |
| `D3-I2-05` | P1 | **Lead APIs**<br>`GET /api/leads/:id`, `/timeline` (calls, stage history, notes, observations, later visits/messages merged and sorted), `PATCH` stage/sub-stage/next step/owner with history. | Contract tests; timeline ordered and paginated. |

#### I3 – Integrations
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D3-I3-01` | P0 | **Call finalize**<br>`call.finalize(run)`: status, duration, disposition, transcript json + plain text, `usage_event` (call minutes, rounded per plan), enqueue `recording.archive` and `analyst.run` (Day 4). Stage auto-move New $\rightarrow$ Attempting $\rightarrow$ Connected. | A completed test call ends with all fields filled and stage = Connected. |
| `D3-I3-02` | P0 | **Recording archive**<br>`recording.archive`: stream from Dograh to R2 `tenants/<id>/recordings/<call_attempt_id>.<ext>`; store key; retry with backoff. | Recording plays from R2 for new and backfilled calls (backfill archive runs as a batch job). |
| `D3-I3-03` | P0 | **CSV import backend**<br>Upload to R2 $\rightarrow$ parse (papaparse, up to 50k rows) $\rightarrow$ mapping step (columns $\rightarrow$ fields, saved per source) $\rightarrow$ preview first 20 $\rightarrow$ commit job with row-level errors downloadable as CSV. Optional 'add to campaign'. | A 5,000-row file with 50 bad rows imports 4,950 and reports 50 with reasons. |
| `D3-I3-04` | P1 | **CRM campaigns**<br>$\text{Campaign} = \text{AI agent} + \text{lead filter} + \text{schedule} + \text{daily cap}$. Start $\rightarrow$ enqueue `call.dial` for matching leads in waves (respecting caps and window). Pause/stop. Progress from `call_attempt` counts. Dograh's own campaign feature is not used, so every dial passes the policy engine. | Campaign of 50 leads dials only inside window, max $N$ concurrent, progress accurate. |
| `D3-I3-05` | P0 | **Inbound pre-call fetch webhook**<br>`POST /api/webhooks/dograh/:tenantKey/inbound-context` – called by Dograh when an inbound call rings, before the AI answers. Verify the shared secret (same scheme as the call-ended receiver), normalise the caller number to E.164, look it up in `person_identifier` (`kind = phone`, scoped to the tenant), and return the same `initial_context` JSON shape used for outbound dials (`lead_id`, `name`, `program` interest, `language`, `stage`, last call summary). Unknown caller $\rightarrow$ return a minimal context flagged `is_new_caller = true`, and create the `person` + `lead` (`source = inbound_call`) through the intake service. Read-only indexed queries, no external calls, respond in $< 300\text{ ms}$; if lookup fails or times out, return the minimal context rather than an error so the call is never blocked. Log every hit in `agent_tool_call` (`tool = inbound_context`). Depends on the Day-1 spike (d) and the Dograh fork patch: if Dograh has no pre-answer hook, Vaidik adds one to the patch (`D1-V-05`); until then the agent calls `get_lead_context` with the caller number at turn 0. | Inbound test call from a known number $\rightarrow$ agent greets the student by name and program at Turn 0, same as outbound; unknown number $\rightarrow$ generic greeting + new person/lead created; bad secret $\rightarrow$ 401; $p95 < 300\text{ ms}$; lookup error still lets the call connect. |

#### I4 – Frontend
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D3-I4-01` | P0 | **Lead 360 page**<br>Header (identity, stage + sub-stage selector, temperature badge, next step + due date, owner, AI agent), timeline (calls with audio player + transcript drawer, stage changes, observations with quotes, notes), right panel (applications, visits placeholders today), actions (change stage, add note, schedule callback, call now – goes through policy, shows reject reason). | Matches spec; works at 390 px; reject reason visible when calling outside window. |
| `D3-I4-02` | P0 | **Dashboard**<br>From `GET /api/dashboard` (I2 adds SQL aggregates): leads by stage funnel, temperature split, calls today / connect rate / avg duration, by source, by agent, date range filter. | Numbers match SQL spot-checks; no sampling. |
| `D3-I4-03` | P1 | **Intake sources + CSV wizard**<br>Settings $\rightarrow$ Lead sources: create source, copy endpoint URL + token (shown once), field mapping editor with a test payload. CSV import wizard: upload $\rightarrow$ map $\rightarrow$ preview $\rightarrow$ import $\rightarrow$ error report download. | Admin can connect a new web form without developer help. |
| `D3-I4-04` | P1 | **Campaigns UI**<br>List, create (agent, filter builder, schedule, cap), detail with live progress, pause/stop. | Screens built against the API. |

#### ✓ Checkpoint 3 – Speed-to-lead works (Day 3, 18:00)
| # | Checkpoint item | How Vaidik verifies (pass = all true) | Status |
| :--- | :--- | :--- | :---: |
| 1 | Fast path latency | Latency script, 20 submissions inside the window: $p95$ submit $\rightarrow$ dialing $< 30\text{ s}$. | ☐ |
| 2 | Policy blocks correctly | Submission at a simulated 21:05 $\rightarrow$ `OUTSIDE_WINDOW`, scheduled for 09:00 next allowed day; suppressed number $\rightarrow$ `SUPPRESSED`; no call placed. | ☐ |
| 3 | Exactly-once | Same form posted 5x in $2\text{ s} \rightarrow 1$ person, 1 lead, 1 call. Worker killed after reserve $\rightarrow$ still exactly 1 `call_attempt`. | ☐ |
| 4 | Recordings | New call and a backfilled call both play from R2; access logged. | ☐ |
| 5 | Lead 360 + dashboard | Real lead shows calls, transcript, stage history; dashboard totals match SQL. | ☐ |
| 6 | CSV import | Bad-row report downloads with reasons. | ☐ |
| 7 | Inbound Turn-0 greeting | Call the MIT-ADT number from a phone already in the CRM $\rightarrow$ personalised greeting at Turn 0; from an unknown phone $\rightarrow$ generic greeting and a new lead appears. | ☐ |

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 27–29)*

### Day 4 – Agent intelligence and the counsellor loop
**Goal of the day:** the AI agent knows who it's talking to, answers facts only from our tools, books visits and hands off to humans; every call is analysed with evidence and verified by a counsellor.

#### Vaidik
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D4-V-01` | P0 | **Deploy Dograh patch**<br>`initial_context` passthrough, `Idempotency-Key`, max duration live on Dograh. | Test call greets the student by name from `initial_context`. |
| `D4-V-02` | P0 | **Label the golden set**<br>Label 40 real MIT-ADT calls: temperature + next step + main objection (I1 builds the labelling sheet). | 40 labels committed (no PII) for the eval. |

#### I1 – Platform, DevOps & AI
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D4-I1-01` | P0 | **LLM adapter**<br>`packages/integrations/llm` on Vercel AI SDK: providers Anthropic, OpenAI, Google, OpenRouter; tenant `llm_provider_config` (encrypted key) with platform default fallback; token usage $\rightarrow$ `usage_event` (`analyst_run`). | Switching provider in settings changes the model used on the next run; no key in logs. |
| `D4-I1-02` | P0 | **Analysis contract (dynamic)**<br>`packages/contracts/analysis.ts`: `temperature` + `verbatim_quote`, `next_step` + due suggestion, `objections[{type, verbatim_quote}]`, `summary` ($\le 3$ lines), `needs_counsellor` + reason, `language` detected. The `generateObject` zod schema must NOT be fully hardcoded: export a fixed core schema (`temperature`, `next_step`, `summary`, `needs_counsellor` – always present, cannot be removed or overridden by a tenant) and a `buildAnalysisSchema(tenantId)` function that merges it with custom fields read from the new `tenant_extraction_rules` table (request the migration from I2). Each rule maps to a zod type (`text`, `number`, `boolean`, `enum` with allowed values, `date`), carries a `description` used as the field's instruction to the model, and a `requires_quote` flag that applies the same verbatim-substring check as the core fields. Custom values are stored in `analysis.extracted` (json). Rules are managed through `GET`/`POST`/`PATCH`/`DELETE` `/api/settings/extraction-rules` (owner/admin) and take effect on the next analyst run – no code deployment. Cache the built schema per tenant and rebuild when a rule changes. | Spec merged; reviewed by Vaidik. Adding a rule (e.g. `'entrance_exam_score'`, `number`) for a test tenant changes the next analysis output with no deploy; core fields are present for every tenant; a tenant rule named like a core field is rejected; invalid custom values are dropped and logged without failing the core write. |
| `D4-I1-03` | P0 | **A2 analyst job**<br>`analyst.run(call_attempt)`: skip if talk $< 15\text{ s}$; prompt with transcript + program context; `generateObject`; pre-validate quotes (exact substring after whitespace collapse), retry once, drop invalid; write `analysis` + `observation` (`source = ai_analyst`) $\rightarrow$ trigger updates `current_temperature`; set `next_step`; if `needs_counsellor` $\rightarrow$ queue item; create `review_call` queue item for the allocated counsellor. | On 10 real calls: every stored quote is in its transcript; a hand-inserted fake quote is rejected by the DB. |
| `D4-I1-04` | P1 | **Golden-set eval in CI**<br>Script runs the analyst on the 40 labelled calls (cached transcripts), computes Cohen's $\kappa$ for temperature and accuracy for next step. Runs nightly + on PRs touching the prompt. | Report printed; target $\kappa \ge 0.75$ (if lower, prompt work continues in buffer, not a go-live blocker). |

#### I2 – Backend core
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D4-I2-01` | P0 | **Programs + knowledge base**<br>CRUD for `program`, fees, seat bucket, deadlines, eligibility rules; `kb_document` CRUD with simple full-text search (Postgres `tsvector`). | MIT-ADT programs entered via API/UI; search returns relevant snippet. |
| `D4-I2-02` | P0 | **AI agents + allocation**<br>`ai_agent` CRUD (display name, Dograh workflow picked from that tenant's workflows, language, voice), allocate counsellors. `Lead.ai_agent_id` set at dial time. | Counsellor sees only leads of agents allocated to them. |
| `D4-I2-03` | P0 | **Counsellor queues**<br>`counsellor_queue_item` APIs: list mine (by kind), claim, resolve with outcome + note. Review action: verify (observation `source = counsellor`, same value) or override (new value + reason). Needs-counsellor item: book meeting/visit/callback inline. | Override changes `lead.current_temperature` and appears on the timeline with the counsellor's name. |
| `D4-I2-04` | P0 | **Visits, meetings, tasks, notes**<br>`campus_visit` + `meeting` CRUD with status transitions, reminder jobs ($24\text{ h}$ and $2\text{ h}$ before, WhatsApp/email when available), stage auto-move on booked/attended; `task` CRUD with due reminders; `lead_note`. | Booking a visit moves stage to Visit booked and schedules two reminders; marking attended moves to Visited. |
| `D4-I2-05` | P1 | **Assignment rules**<br>Round-robin among allocated counsellors, or by program, or by language; applied on lead create and on needs-counsellor items. | 10 new leads split evenly across 2 counsellors. |

#### I3 – Integrations
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D4-I3-01` | P0 | **Agent tools service**<br>`/api/agent-tools/v1/*` for the 12 tools in Section 7.4. HMAC verification plugin, per-tenant tool secret, $5\text{-min}$ skew, `agent_tool_call` log. Data served from indexed queries only (no external calls) to stay $< 500\text{ ms}$.<br>**Payload caching:** read-only tools (`get_program_info`, `check_seat_and_deadline`, plus other pure-read tools such as `check_eligibility`) are served from an aggressive in-memory cache in `crm-api` (e.g. an LRU keyed by `tenant_id` + `tool` + normalised arguments, bounded size, TTL $5\text{ min}$), or from Redis if one is ever provisioned (none is planned – Section 2). Writes to programs, fees, seat buckets, deadlines or KB (I2's `D4-I2-01` endpoints) invalidate that tenant's entries immediately via Postgres `LISTEN`/`NOTIFY` so every api process drops stale data. Warm the cache for a campaign's programs when a campaign wave starts. Cache keys must always include `tenant_id`; write tools (`book_campus_visit`, `request_counsellor`, etc.) are never cached. Log cache hit/miss in `agent_tool_call`. | $p99 < 500\text{ ms}$ measured from the Dograh container over 200 calls, AND under a concurrent campaign-wave load (k6 at the wave's peak tool rps); cache hit rate $> 90\%$ on read-only tools during the wave; editing a fee is reflected in the next tool call (no stale answer); cross-tenant cache test returns no foreign data; bad signature $\rightarrow$ 401. |
| `D4-I3-02` | P0 | **Wire tools into workflows**<br>Configure the `http_api` tools in the MIT-ADT Dograh workflow(s) via API, using `{{initial_context.lead_id}}` (or the fallback from the Day-1 spike). Update the agent prompt: facts only from `get_program_info` / `check_seat_and_deadline`; disclose AI per policy text. | Test calls: asks fee $\rightarrow$ tool called and answer matches DB; asks for a human $\rightarrow$ queue item within $1\text{ min}$; books visit $\rightarrow$ `campus_visit` row. |
| `D4-I3-03` | P1 | **Patch support**<br>Pair with Vaidik on `D4-V-01`; add `Idempotency-Key` + `initial_context` to the adapter's `initiateCall`. | Adapter tests updated. |

#### I4 – Frontend
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D4-I4-01` | P0 | **Counsellor workspace**<br>Home for counsellors: tabs 'Needs counsellor', 'Review calls', 'My leads', 'Today' (visits, meetings, tasks, callbacks). Each queue item opens a side panel with the call player, transcript, AI labels with quotes highlighted in the transcript, verify / override, outcome form with comment. | A counsellor can clear 10 review items without leaving the page; works at 390 px. |
| `D4-I4-02` | P0 | **Campus visits + calendar**<br>Visits list + calendar view, book/reschedule dialog (slots), mark attended/no-show, outcome note. | Flows work end to end. |
| `D4-I4-03` | P1 | **Programs & knowledge base admin**<br>Program editor (fees, seat bucket, deadlines, eligibility), KB editor with markdown. | MIT-ADT data can be entered by an admin. |
| `D4-I4-04` | P1 | **AI agents page**<br>List agents with tenant-facing names (never Dograh names/ids), language, allocated counsellors, active toggle. | Grep: no `'dograh'` in rendered HTML. |

#### ✓ Checkpoint 4 – AI + humans loop (Day 4, 18:00)
| # | Checkpoint item | How Vaidik verifies (pass = all true) | Status |
| :--- | :--- | :--- | :---: |
| 1 | Context at turn 0 | Live test call: agent uses the student's name and program from `initial_context`. | ☐ |
| 2 | Facts from tools only | Ask fee and seats: tool calls logged; answer matches DB; seats spoken as a bucket. | ☐ |
| 3 | Human handoff | Say 'I want to talk to a person' $\rightarrow$ item in the allocated counsellor's queue within $1\text{ min}$. | ☐ |
| 4 | Visit booking by AI | Agent books a slot $\rightarrow$ visit row, stage Visit booked, reminders scheduled. | ☐ |
| 5 | Analyst evidence | 10 analysed calls: all quotes verified; fake quote insert fails at DB. | ☐ |
| 6 | Counsellor override | Override Warm $\rightarrow$ Hot: `current_temperature` updates; timeline shows who and why. | ☐ |
| 7 | Tool latency | $p99 < 500\text{ ms}$ report attached. | ☐ |

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 30–31)*

### Day 5 – Applications, WhatsApp and plug-into-anything
**Goal of the day:** the CRM knows who filled the form and paid the fee, talks on WhatsApp, and any ERP or tool can read and write through a documented API with signed webhooks.

#### I1 – Platform, DevOps & AI
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D5-I1-01` | P0 | **Application & fee sync**<br>Three inputs, one service: (1) CSV/Excel upload with saved mapping, (2) `POST /v1/applications` (API key), (3) portal webhook `/api/webhooks/portal/:key`. Match lead by application no. $\rightarrow$ phone $\rightarrow$ email; unmatched rows go to a review list. Status changes write history. | Uploading MIT-ADT's sample export updates statuses; unmatched rows listed. |
| `D5-I1-02` | P0 | **Stage auto-advance**<br>`form_submitted` $\rightarrow$ Applied; `fee_paid` $\rightarrow$ Fee paid; `admitted`/`enrolled` $\rightarrow$ Enrolled; never moves a lead backwards automatically. | Tests for each transition and for no backward move. |
| `D5-I1-03` | P1 | **Tracked links**<br>Short links `/l/<token>` per lead + purpose (portal, brochure, fee page) with UTM; click $\rightarrow$ timeline event + next step hint; sent by AI tool `send_info_whatsapp` and by counsellors. | Click shows on the timeline within seconds. |

#### I2 – Backend core
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D5-I2-01` | P0 | **API keys**<br>Create (shown once, prefix visible), scopes (`leads:read`, `leads:write`, `applications:write`, `calls:read`, `webhooks:manage`), revoke, last used. Hashed with argon2. Rate limit per key. | Revoked key $\rightarrow$ 401 immediately; key from tenant B can't read tenant A. |
| `D5-I2-02` | P0 | **Public REST API `/v1`**<br>`GET`/`POST`/`PATCH` `/v1/leads`, `GET /v1/persons/:id`, `GET /v1/calls`, `GET`/`POST` `/v1/visits`, `POST /v1/applications`, `GET /v1/events`. Cursor pagination, `Idempotency-Key` on POST, OpenAPI 3 at `/v1/openapi.json` + docs page `/v1/docs`. | An ERP-style script creates a lead, reads its calls, and updates application status using only the docs. |
| `D5-I2-03` | P0 | **Outbound webhooks**<br>Subscriptions with event types (`lead.created`, `lead.stage_changed`, `call.completed`, `analysis.ready`, `visit.booked`, `visit.attended`, `application.updated`, `counsellor.requested`). Payload signed: `X-Vernacular-Signature = HMAC-SHA256(secret, timestamp.body)`. Delivery job with exponential backoff ($1\text{m}$, $5\text{m}$, $30\text{m}$, $2\text{h}$, $12\text{h}$), delivery log, manual replay, auto-disable after $24\text{ h}$ failing. | Endpoint returning 500 is retried on schedule; replay works; signature verifies with the documented recipe. |
| `D5-I2-04` | P1 | **ERP handoff contract**<br>`docs/integrations/erp.md`: which events/endpoints an ERP uses for 'admitted student handoff', field list, sample payloads. | Reviewed by Vaidik; linked from `/v1/docs`. |

#### I3 – Integrations
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D5-I3-01` | P0 | **`WhatsAppProvider` + YesBoss**<br>Interface: `sendTemplate`, `sendText` (inside $24\text{ h}$ window), `getStatus`, `parseInbound`, `listTemplates`. YesBoss implementation from their docs; a `FakeProvider` for tests/staging. Per-tenant credentials and sender. | Template message reaches a test phone; status updates sent $\rightarrow$ delivered $\rightarrow$ read on the timeline. (If docs are still missing: `FakeProvider` + interface merged, P0 becomes the YesBoss implementation in buffer.) |
| `D5-I3-02` | P0 | **Sends through policy**<br>`whatsapp.send` job: policy evaluate (consent, suppression, wallet) $\rightarrow$ send $\rightarrow$ `whatsapp_message` + `usage_event`. Used by visit reminders, AI tool `send_info_whatsapp`, counsellors. | Opted-out number is blocked with `SUPPRESSED`. |
| `D5-I3-03` | P0 | **Inbound + opt-out**<br>Webhook for inbound messages and statuses $\rightarrow$ timeline; `STOP`/`UNSUBSCRIBE` keywords add suppression + consent revoke; inbound from unknown number creates a `person` + `lead` (`source = whatsapp`). | Inbound reply appears on Lead 360; `STOP` blocks future sends and calls. |
| `D5-I3-04` | P1 | **Template sync**<br>Sync approved templates from provider; map variables to lead fields. | Templates selectable in UI with variable preview. |

#### I4 – Frontend
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D5-I4-01` | P0 | **Applications UI**<br>Panel in Lead 360 (status chips, fee paid date), Applications list with filters, import wizard (reuse CSV wizard), unmatched review list. | Admission head can see who has paid in two clicks. |
| `D5-I4-02` | P0 | **WhatsApp in Lead 360**<br>Conversation tab (inbound/outbound bubbles, statuses), send template dialog with variable preview, free text inside the $24\text{ h}$ window. | Flows work against `FakeProvider` on staging. |
| `D5-I4-03` | P0 | **Settings $\rightarrow$ Integrations**<br>API keys (create/show once/revoke), Webhooks (add, choose events, send test, delivery log, replay), Lead sources (from Day 3), link to `/v1/docs`. | An admin connects a webhook without help. |

#### ✓ Checkpoint 5 – Plugs into anything (Day 5, 18:00)
| # | Checkpoint item | How Vaidik verifies (pass = all true) | Status |
| :--- | :--- | :--- | :---: |
| 1 | Application status flows | Upload MIT-ADT sample $\rightarrow$ statuses + stages update; unmatched listed. | ☐ |
| 2 | Public API | curl with tenant A key: create lead, list calls. Tenant B key: 404 on A's lead. Revoked key: 401. | ☐ |
| 3 | Signed webhooks | Receiver (webhook.site) gets `lead.created` with valid signature; failing receiver retried. | ☐ |
| 4 | WhatsApp | Template sent and delivered (or `FakeProvider` path proven + YesBoss gap logged); `STOP` suppresses calls too. | ☐ |
| 5 | Docs | `/v1/docs` renders and matches behaviour. | ☐ |

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 32–34)*

### Day 6 – The SaaS layer: tenants, white-label, billing, planner, CRM extras
**Goal of the day:** Laveric can onboard and bill a second institution, under its own brand and domain, without touching code; the planner re-engages leads safely; daily-use CRM features are complete.

#### I1 – Platform, DevOps & AI
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D6-I1-01` | P0 | **Branding**<br>`GET /api/branding` resolved from `Host` (custom domain or `slug.laveric.com`) before login; `tenant_branding` CRUD; logo/favicon upload to R2; product name used in UI, emails, page titles. | Login page on a tenant host shows that tenant's brand. |
| `D6-I1-02` | P0 | **Custom domains + TLS**<br>Tenant adds a domain $\rightarrow$ instructions (CNAME to `app.laveric.com` + TXT token) $\rightarrow$ verify job $\rightarrow$ Caddy `on_demand_tls` with `ask = /api/internal/domain-allowed?domain=...` (only verified domains). Remove domain flow. | A test domain gets a certificate automatically and serves the tenant; an unknown domain gets no certificate. |
| `D6-I1-03` | P1 | **SLA timers, digest, notifications**<br>`sla.check` job (next step overdue, new lead not contacted in $X\text{ min}$ $\rightarrow$ queue item + notification); daily digest email to admission head (yesterday's funnel, hot leads, overdue items); in-app notification API. | Overdue next step creates a queue item; digest arrives at 08:00 tenant time. |
| `D6-I1-04` | P1 | **A5 compliance auditor**<br>Nightly deterministic job: flags any call outside window, without consent, to suppressed numbers, or over caps; report page for owner/admin + alert to Vaidik. | Seeded violation appears in tomorrow's report. |

#### I2 – Backend core
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D6-I2-01` | P0 | **Billing ledger**<br>`plan` CRUD (super-admin), tenant subscription (prepaid wallet or monthly + overage), `usage_event` pricing at write time, `wallet_transaction` on every billable event (prepaid), manual top-up by super-admin (payment gateway later), low-balance notification. | Wallet at 0 $\rightarrow$ dial rejected `WALLET_EMPTY`; top-up resumes dialling. |
| `D6-I2-02` | P0 | **Statements**<br>Monthly statement per tenant: plan fee, included vs used, overage, top-ups; export CSV + PDF to R2. | Statement totals equal `SUM(usage_event)` for the period. |
| `D6-I2-03` | P1 | **A3 re-engagement planner**<br>`planner.run` nightly + on events: rules + LLM propose actions for Warm/Cold leads (callback, WhatsApp info, counsellor call) $\rightarrow$ `planner_proposal` $\rightarrow$ policy permit $\rightarrow$ effect (enqueue) $\rightarrow$ attest (link to resulting call/message) $\rightarrow$ reflect (outcome stored). Typed rejections stored. | Proposals visible with rationale; rejected ones show the policy code; no action ever bypasses policy. |
| `D6-I2-04` | P1 | **A6 supervisor queue**<br>Tenant setting: auto-run planner actions or require admission-head approval. Approval queue API. | With approval on, nothing is sent until approved. |
| `D6-I2-05` | P1 | **Search, views, bulk**<br>Global search API (name, phone last digits, email, application no.), saved views, bulk actions (assign, stage, add to campaign, export) with audit log. | Bulk-assign 200 leads in one action; logged. |

#### I3 – Integrations
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D6-I3-01` | P0 | **Tenant creation**<br>Platform API: create tenant (name, slug, timezone, plan) $\rightarrow$ create Dograh org + API key via API (or accept manually entered values if Day-1 spike said no) $\rightarrow$ store encrypted $\rightarrow$ copy default policy, stages, a starter AI agent $\rightarrow$ invite owner by email. | New tenant usable end-to-end; its Dograh calls never appear in MIT-ADT. |
| `D6-I3-02` | P0 | **Suspend + impersonation**<br>Suspend tenant (blocks logins + all dials via policy). Impersonate as a tenant user with a reason; banner in UI; every action audit-logged with `impersonator_id`; auto-expires in $30\text{ min}$. | Impersonated action shows in audit log with both IDs. |
| `D6-I3-03` | P0 | **Team management**<br>Invite, change role, deactivate, allocate counsellors to agents; seat limits from plan. | Owner invites a counsellor who logs in with the right permissions. |
| `D6-I3-04` | P1 | **Email adapter**<br>`EmailProvider` (SES/Resend) with per-tenant verified sender domain (DKIM records shown in UI), branded templates for invites, reminders, digest. | Invite email arrives from the tenant's sender with its logo. |
| `D6-I3-05` | P1 | **Duplicate detection**<br>Nightly job finds likely duplicates (same name + similar phone, shared email) $\rightarrow$ `duplicate_candidate`; merge service per Section 6.1. | Merge keeps all calls and logs both IDs. |

#### I4 – Frontend
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D6-I4-01` | P0 | **Platform console**<br>Super-admin only: tenants list (status, plan, usage, wallet), create tenant wizard, suspend, impersonate, plans editor, platform health (sync-health, queue depth, errors). | Create a tenant through the UI in $< 10\text{ min}$. |
| `D6-I4-02` | P0 | **Branding + domains + team**<br>Settings pages with live preview of colours/logo; domain add + verification status; team invite/roles/allocation. | Changes reflect instantly on the tenant host. |
| `D6-I4-03` | P0 | **Billing page**<br>Wallet balance, transactions, usage by kind and day, current plan, statements download. | Matches ledger. |
| `D6-I4-04` | P1 | **Daily-use extras**<br>Global search ($\text{Ctrl/Cmd} + \text{K}$), saved views on Leads, bulk action bar, notifications bell, duplicate review queue, counsellor performance view (calls reviewed, queue items resolved, visits booked, conversions), program seat/deadline matrix, planner proposals / approval queue, compliance report. | Each page has an e2e smoke test. |

#### ✓ Checkpoint 6 – Second tenant in $< 10\text{ minutes}$ (Day 6, 18:00)
| # | Checkpoint item | How Vaidik verifies (pass = all true) | Status |
| :--- | :--- | :--- | :---: |
| 1 | Onboarding | Stopwatch: create `'Demo College'` from console $\rightarrow$ owner invited $\rightarrow$ logs in on its own domain with its brand. $< 10\text{ min}$. | ☐ |
| 2 | No Dograh visible | On the demo tenant: grep rendered HTML, API responses and emails for `'dograh'` $\rightarrow$ zero hits. | ☐ |
| 3 | Isolation with two live tenants | A call in Demo College never shows in MIT-ADT (UI, API, webhooks, exports). | ☐ |
| 4 | Billing hard stop | Demo wallet to 0 $\rightarrow$ dial rejected `WALLET_EMPTY`; top-up $\rightarrow$ resumes. | ☐ |
| 5 | Audit | Impersonation and bulk actions appear in audit log. | ☐ |
| 6 | Planner safety | Planner proposal outside window shows `OUTSIDE_WINDOW` rejection. | ☐ |

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 35–36)*

### Day 7 – Harden, test everything, go live
**Goal of the day:** MIT-ADT runs in production on the new system; every checkpoint is green; the team can operate it (deploy, restore, onboard, respond to incidents).

#### I1 – Platform, DevOps & AI
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D7-I1-01` | P0 | **Load test**<br>k6 at 5x expected peak (ask Vaidik for MIT-ADT peak leads/hour; default assumption $500/\text{hour} \rightarrow \text{test } 2,500/\text{hour}$ intake + 100 concurrent UI users + agent tools at $20\text{ rps}$) while Dograh runs live calls. | No errors, $p95\text{ API} < 300\text{ ms}$, tools $p99 < 500\text{ ms}$, Dograh audio quality unaffected (listen to 3 calls during the test). |
| `D7-I1-02` | P0 | **DR drill on production**<br>Restore last night's production backup + WAL to a point in time on a scratch container; verify row counts. | Restore time recorded in runbook (target $< 30\text{ min}$). |
| `D7-I1-03` | P0 | **Alerts**<br>Alerts for: api/web down, job queue depth $>$ threshold, failed jobs spike, disk $> 80\%$, backup missing, sync-health mismatch, webhook auto-disabled. | Each alert fired once in a test. |
| `D7-I1-04` | P1 | **Runbooks**<br>`docs/runbooks`: deploy & rollback, restore, onboard tenant, rotate secrets, incident checklist, 'calls not going out' troubleshooting. | Another intern follows the deploy runbook successfully. |

#### I2 – Backend core
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D7-I2-01` | P0 | **DPDP tools**<br>Consent log view per person; data export (JSON + recordings list) per person; erasure (delete PII + identifiers, keep anonymised aggregates and billing); retention setting per tenant with nightly purge job. | Export and erasure work on a test person; erasure leaves billing totals intact. |
| `D7-I2-02` | P0 | **Security review**<br>Checklist: every route has auth + role + tenant tests; rate limits on login/intake/tools; secrets scan (gitleaks) in CI; dependency audit; CSP header; file upload type/size limits; SQL only through Kysely. | Checklist in `docs/security-review.md` all ticked or ticketed. |
| `D7-I2-03` | P0 | **Cross-tenant test suite**<br>Automated: for every endpoint (`/api` and `/v1`), tenant B credentials against tenant A IDs $\rightarrow 404/403$. | Runs in CI; zero leaks. |

#### I3 – Integrations
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D7-I3-01` | P0 | **MIT-ADT production cutover**<br>Follow Section 11.3: create tenant in prod, map the existing MIT-ADT Dograh org, backfill, point workflows' tools and webhooks to production, configure intake sources with each lead provider, import programs/KB, invite users. | First real enquiry in production called within $30\text{ s}$; old console set to read-only. |
| `D7-I3-02` | P0 | **Chaos test**<br>Duplicates, out-of-order webhooks, worker kill between reserve and dial, Dograh API down for $5\text{ min}$ (jobs retry, nothing lost), R2 down (archive retries). | Exactly one `call_attempt` per lead in all cases; no lost events. |

#### I4 – Frontend
| ID | Pri | Task & what to build | Done when (acceptance) |
| :--- | :--- | :--- | :--- |
| `D7-I4-01` | P0 | **Full e2e**<br>Playwright journeys per role: admin (settings, sources, agents, campaign), admission head (dashboard, bulk assign, approvals), counsellor (queues, review, visit, outcome), super-admin (tenant create, impersonate). | All green in CI. |
| `D7-I4-02` | P0 | **Screenshot review**<br>Every page at 1440 px and 390 px in headless Chromium/Edge; fix overflow, truncation, contrast, empty/error states. | Vaidik reviews the screenshot set and signs off. |
| `D7-I4-03` | P1 | **User guide**<br>Short in-app help + `docs/user-guide.md` for admins and counsellors (screens + steps). | Shared with MIT-ADT on go-live. |

#### ✓ Checkpoint 7 – GO-LIVE GATE (Day 7)
| # | Checkpoint item | How Vaidik verifies (pass = all true) | Status |
| :--- | :--- | :--- | :---: |
| 1 | All previous checkpoints green | Checkpoints 1–6 ticked or carry-over accepted in writing. | ☐ |
| 2 | Production smoke | Real enquiry $\rightarrow$ call $< 30\text{ s}$ $\rightarrow$ analysis $\rightarrow$ counsellor review $\rightarrow$ visit booked $\rightarrow$ WhatsApp reminder. | ☐ |
| 3 | Isolation | Cross-tenant suite green in CI against production build. | ☐ |
| 4 | Load & chaos | Load test and chaos test reports attached and passing. | ☐ |
| 5 | Recoverable | Production DR drill passed today; alerts tested. | ☐ |
| 6 | Compliance defaults on | MIT-ADT policy: window 09:00–21:00, consent required, suppression active, AI disclosure text set. | ☐ |
| 7 | Safety net | Old console read-only for 7 days; daily sync-health compared each morning (I3) until Day 14. | ☐ |
| 8 | Handover | Runbooks and user guide merged. | ☐ |

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 36–39)*

## 11. Testing, verification and go-live

### 11.1 What gets tested, and how

| Level | Tool | Who | Covers |
| :--- | :--- | :--- | :--- |
| **Unit** | Vitest | Everyone | Policy engine (100% branch), phone normalisation, field mapping, HMAC, encryption, pricing, stage transitions |
| **Integration** | Vitest + real Postgres (CI service) | I2, I3, I1 | Every endpoint: auth, role, tenant isolation, happy path, validation errors; every job: idempotency, retries |
| **Contract** | zod schemas in `packages/contracts` | $\text{I2} + \text{I4}$ | API responses parsed by the same schema the UI uses – breaking changes fail CI |
| **E2E** | Playwright | I4 (I1 sets up) | Role journeys; screenshots desktop + 390 px |
| **AI eval** | Golden set script | $\text{I1} + \text{Vaidik}$ | Analyst $\kappa$ for temperature, next-step accuracy, zero fabricated quotes |
| **Chaos** | Scripts | I3 | Duplicates, out-of-order, worker kill, provider outages |
| **Load** | k6 | I1 | Intake, UI API, agent tools at 5x peak with live Dograh |
| **Isolation** | Generated suite | I2 | Tenant B credentials vs tenant A ids on every endpoint |

### 11.2 Measurable targets

| Metric | Target | Measured by |
| :--- | :--- | :--- |
| **Submit $\rightarrow$ dial (inside window)** | $p95 < 30\text{ s}$ | Latency script / DB timestamps |
| **Agent tool latency** | $p99 < 500\text{ ms}$ | `agent_tool_call.latency_ms` |
| **API latency (UI endpoints)** | $p95 < 300\text{ ms}$ | k6 + logs |
| **Calls per lead per active slot** | Exactly 1 | Chaos test + partial unique index |
| **Cross-tenant reads** | 0 rows / 404 | Isolation suite |
| **Fabricated analyst quotes stored** | 0 | DB trigger + nightly check |
| **Analyst agreement with humans** | $\kappa \ge 0.75$ (temperature) | Golden set; counsellor override rate tracked weekly |
| **Sync parity with Dograh** | 100% per day | `/api/admin/sync-health` |
| **Restore time** | $< 30\text{ min}$ | DR drill |

### 11.3 MIT-ADT production cutover runbook (Day 7, owner I3, approver Vaidik)
1. **Freeze:** no merges except cutover fixes from 12:00. Tag the release.
2. Deploy the tag to production; run migrations; check `/health` and GlitchTip.
3. Create the MIT-ADT tenant in the platform console; enter the existing MIT-ADT Dograh org id + API key (encrypted).
4. Run backfill for all history; confirm sync-health parity for every day.
5. Import programs, fees, seat buckets, deadlines and KB documents; set policy (window, holidays, caps, consent, disclosure text).
6. Create AI agents mapped to the MIT-ADT workflows; allocate counsellors; set assignment rule.
7. In Dograh, update workflow tool URLs to `https://app.laveric.com/api/agent-tools/v1/*` with the production tool secret; set webhook URL to production.
8. Create an intake source for each lead provider (website, each aggregator, Meta, Google); send each provider its URL + token, or switch the form's webhook. Keep a list of which providers are switched.
9. Invite admission head and counsellors; 20-minute walkthrough with the user guide.
10. Smoke test with a team member's phone through each source. Watch the first 10 real leads end to end.
11. Set the old console to read-only (disable campaign and call actions). Leave it up for 7 days. Each morning until Day 14, I3 posts sync-health parity in the team chat.
12. **Rollback plan:** if dialling fails in production, pause intake auto-dial (policy toggle) – leads still collect; fix forward. The old console is not a write fallback.

---

## 12. Operating the platform

### 12.1 Daily operations (after go-live)
* **Morning:** check alerts, sync-health, failed jobs, webhook auto-disables, compliance auditor report.
* **Weekly:** human audit of $\sim 50$ calls per tenant (sampled into the review queue with the `'audit'` flag, reviewed by Vaidik or the admission head); track override rate and $\kappa$ drift; adjust prompts through a PR with golden-set results.
* **Monthly:** statements generated on the 1st; secret rotation reminder; restore drill.

### 12.2 Onboarding a new tenant (target $< 10\text{ minutes}$ + provider setup)
1. **Super-admin $\rightarrow$ Create tenant:** name, slug, timezone, plan, billing mode.
2. Dograh organisation + API key created automatically (or, if the Day-1 spike showed no API: create the org in Dograh by hand, paste the id + key – the form allows both).
3. Owner invited by email; owner sets branding, domain, team.
4. Owner (or Laveric on their behalf) adds programs, KB, policy, AI agents (Laveric builds the Dograh workflow from the template), intake sources.
5. WhatsApp sender and email sender domain verified (provider-side, can take days – tenant can start with calls first).
6. Wallet top-up or plan activation $\rightarrow$ dialling allowed by policy.

---

## 13. Risks and the cut-line

| Risk | Likelihood | Mitigation |
| :--- | :--- | :--- |
| 7 days is very tight for 4 beginner interns | High | Parallel tracks, P0/P1/P2, daily gates, Day 8–10 buffer for P2s. Vaidik reviews twice a day so mistakes don't compound. |
| Dograh can't create orgs/keys via API | Medium | Manual step in onboarding (form accepts pasted values). Not a blocker. |
| `{{initial_context.*}}` doesn't resolve in `http_api` tools | Medium | Fork patch covers it; fallback: pass `lead_id` in the tool body from the agent's memory + `get_lead_context` by call id. |
| YesBoss docs late | Medium | Interface + `FakeProvider` on Day 5; real adapter in buffer. Calls are unaffected. |
| Portal sends no feed | Medium | CSV upload path works on Day 5 regardless; API/webhook added when available. |
| Same-VPS resource contention with Dograh | Medium | Day-1 audit; Postgres memory limits; move Postgres to a second box if load test hurts audio. |
| AI-generated code ignores tenant scope | Medium | RLS as the backstop, isolation suite in CI, NEVER list, PR checklist item. |
| Legal classification of AI calls (promo vs service) | Open | Policy defaults are conservative; 140-series flag configurable; legal follow-up owned by Vaidik. |
| Analyst $\kappa$ below $0.75$ on Day 4 | Medium | Counsellor review catches errors; prompt iteration continues post-launch; not a go-live blocker. |

### 13.1 Cut-line: what moves to the Day 8–10 buffer if a checkpoint fails
**Never cut:** security fixes, RLS/isolation, policy engine, exactly-once dialling, backups, sync parity, intake, Lead 360, counsellor queues, analyst with quote validation. Cut in this order (top first), and write each cut on the carry-over board:
1. Day 6 extras: counsellor performance view, seat/deadline matrix, saved views (keep search and bulk assign).
2. A6 supervisor approval queue (planner runs in 'proposals only' mode, no auto-effect).
3. A3 planner effect step (keep proposals visible to humans).
4. Custom domains (tenants use `slug.laveric.com`; branding still works).
5. PDF statements (CSV only).
6. Tracked links, template sync, duplicate detection job (manual merge only).
7. Golden-set CI automation (run the script by hand).

> **Buffer days 8–10**
> Reserved for carry-over P2s, YesBoss real adapter if docs were late, prompt tuning to reach $\kappa \ge 0.75$, and the 7-day post-go-live parity watch. If everything is green on Day 7, use the buffer for the 'after go-live' list in Section 15.

---

*Vernacular AI – Admission CRM | 7-Day Build Handbook | Laveric Technologies LLP – Internal (Page 39–42)*

## 14. Open items (chase in parallel – owner Vaidik unless noted)

| # | Item | Blocks | Needed by |
| :--- | :--- | :--- | :--- |
| 1 | Legal: promotional vs service classification of AI admission calls, DLT/140-series registration, AI disclosure script, retention period – university sign-off | Policy defaults only (build not blocked) | Before scaling outbound campaigns |
| 2 | YesBoss AI API docs + per-tenant sender setup | `D5-I3-01` real adapter | Day 4 |
| 3 | University portal: format and transport of application + fee status (daily file, API, or webhook) + sample export | `D5-I1-01` mapping | Day 4 |
| 4 | Dograh: programmatic org + API key creation (spike answer) | `D6-I3-01` automation level | Day 1 |
| 5 | VPS final size after audit; second box for Postgres if needed | Load test | Day 2 |
| 6 | MIT-ADT expected peak leads/hour and calls/day | Load test numbers, caps | Day 3 |
| 7 | Default production hostnames (`app.laveric.com`? tenant pattern `slug.laveric.com`?) | Caddy, branding | Day 1 |
| 8 | Email provider choice (SES vs Resend) and `laveric.com` DKIM | Invites, digest | Day 2 |
| 9 | Pricing: plan names, included minutes, per-minute and per-WhatsApp rates | Billing seed data | Day 5 |
| 10 | NDNC/DLT scrub provider (API) – until then, file import | Automated NDNC | After go-live |

---

## 15. After go-live (not part of the 7 days)
* CRM-collected payments (Razorpay/Cashfree) for application/admission fees and wallet top-ups.
* Automated NDNC/DLT scrub via a provider API.
* Native mobile view for counsellors (PWA first).
* Reseller tier (agencies reselling Vernacular AI under their brand with their own sub-tenants).
* Document collection (marksheets etc.) inside the CRM, if universities want it outside their portal.
* Second region / separate Postgres server when tenant count or load requires it.

---

## Glossary

| Term | Meaning |
| :--- | :--- |
| **Tenant** | One customer institution (e.g. MIT-ADT). All its data is isolated by `tenant_id` + RLS. |
| **Person / Lead / Call attempt** | The human / one admission opportunity per cycle / one dial. |
| **RLS** | Row-Level Security: Postgres only returns rows whose `tenant_id` matches the request's `app.tenant_id`. |
| **pg-boss** | A job queue stored in Postgres; used for every background task. |
| **Policy engine** | Deterministic rules that decide whether a call/message/action is allowed now. |
| **Reserve-then-dial** | Insert a `'reserved'` `call_attempt` guarded by a unique index before calling Dograh, so a lead can't be dialled twice. |
| **`initial_context`** | Data passed to Dograh when a call starts so the agent knows the student at turn 0. |
| **Agent tools** | HTTP endpoints the voice agent calls mid-call for facts and actions. |
| **HMAC** | A signature proving a request came from someone holding the shared secret. |
| **A2 / A3 / A5 / A6** | Analyst (post-call labels) / Planner (re-engagement) / Compliance auditor / Supervisor approval queue. |
| **Verbatim quote** | Exact text from the transcript that justifies an AI label; validated by substring match. |
| **Observation** | Append-only record of a temperature judgement (by AI, counsellor or system). |
| **$\kappa$ (kappa)** | Agreement score between AI labels and human labels, corrected for chance. $0.75+ =$ strong. |
| **White-label** | Tenant sees its own name, logo, colours, domain, email and WhatsApp sender. |
| **DPDP** | India's Digital Personal Data Protection Act 2023 – consent, access, erasure, retention. |
| **TRAI TCCCPR / NDNC / DLT** | Telecom rules on commercial communication / national do-not-call registry / registration system for headers and templates. |

---

## Appendix A – API surface

| Area | Endpoints (all under `/api` unless `/v1`) | Owner |
| :--- | :--- | :--- |
| **Auth** | `/api/auth/*` (Better Auth), `GET /api/me`, `GET /api/branding` | $\text{I2} / \text{I1}$ |
| **Leads** | `GET`/`POST` `/leads`, `GET`/`PATCH` `/leads/:id`, `GET /leads/:id/timeline`, `POST /leads/:id/call-now`, `POST /leads/bulk`, `GET /search` | I2 |
| **Persons** | `GET /persons/:id`, `POST /persons/merge`, `GET /persons/:id/export`, `DELETE /persons/:id` (erasure) | I2 |
| **Calls** | `GET /calls`, `GET /calls/:id`, `GET /calls/:id/recording` | $\text{I3} / \text{I1}$ |
| **Dashboard** | `GET /dashboard?from&to&agent&source` | I2 |
| **Campaigns** | CRUD `/campaigns`, `POST /campaigns/:id/start|pause|stop`, `GET /campaigns/:id/progress` | I3 |
| **Intake** | `POST /intake/:sourceKey`, CRUD `/settings/sources`, `POST /imports`, `GET /imports/:id` | $\text{I2} / \text{I3}$ |
| **Counsellor** | `GET /queue?kind`, `POST /queue/:id/claim|resolve`, `POST /reviews/:callId/verify|override` | I2 |
| **Visits & meetings** | CRUD `/visits`, `/meetings`, `GET /visits/slots` | I2 |
| **Tasks & notes** | CRUD `/tasks`, `POST /leads/:id/notes` | I2 |
| **Programs & KB** | CRUD `/programs`, `/kb` | I2 |
| **AI agents** | CRUD `/agents`, `PUT /agents/:id/counsellors`, `GET /agents/workflows` | I2 |
| **Applications** | `GET /applications`, `POST /applications/import`, `GET /applications/unmatched` | I1 |
| **WhatsApp** | `GET /leads/:id/messages`, `POST /messages`, `GET /whatsapp/templates` | I3 |
| **Settings** | `/settings/policy`, `/settings/holidays`, `/settings/branding`, `/settings/domains`, `/settings/team`, `/settings/llm`, `/settings/api-keys`, `/settings/webhooks`, `/settings/extraction-rules` | $\text{I1} / \text{I2} / \text{I3}$ |
| **Billing** | `GET /billing/wallet`, `/billing/usage`, `/billing/statements` | I2 |
| **Platform (super-admin)** | `/platform/tenants` (CRUD, suspend), `/platform/impersonate`, `/platform/plans`, `/platform/health` | I3 |
| **Admin** | `GET /admin/sync-health`, `GET /admin/jobs`, `GET /admin/audit-log`, `GET /admin/compliance-report` | $\text{I3} / \text{I1}$ |
| **Inbound webhooks** | `POST /webhooks/dograh/:key`, `/webhooks/dograh/:key/inbound-context` (pre-call fetch, returns `initial_context`), `/webhooks/whatsapp/:key`, `/webhooks/portal/:key` | $\text{I3} / \text{I1}$ |
| **Agent tools** | `POST /agent-tools/v1/<tool>` (12 tools, HMAC) | I3 |
| **Internal** | `GET /internal/domain-allowed` (Caddy ask; not public) | I1 |
| **Public API** | `/v1/leads`, `/v1/persons/:id`, `/v1/calls`, `/v1/visits`, `/v1/applications`, `/v1/events`, `/v1/openapi.json`, `/v1/docs` | I2 |

---

## Appendix B – Sitemap (every page I4 builds)

| Area | Pages | Roles |
| :--- | :--- | :--- |
| **Auth** | Login, forgot password, reset, accept invite | All |
| **Home** | Dashboard (admin/head) · Counsellor workspace (counsellor) | All |
| **Leads** | Leads list (views, filters, bulk) · Lead 360 · Duplicates queue | All (scoped) |
| **Calls** | Calls list · Review queue | All (scoped) |
| **Campaigns** | List · Create/edit · Detail/progress | Admin, head |
| **Visits & calendar** | Calendar · Visits list · Meetings | All (scoped) |
| **Applications** | List · Import · Unmatched | Admin, head |
| **AI** | Agents · Planner proposals / approvals · Compliance report | Admin, head |
| **Programs** | Programs · Seat/deadline matrix · Knowledge base | Admin (head view) |
| **Reports** | Counsellor performance · Exports | Admin, head |
| **Settings** | General · Policy & holidays · Stages & sub-stages · Branding · Domains · Team · Lead sources · Integrations (API keys, webhooks) · WhatsApp · Email sender · LLM provider · Billing · Data & privacy | Owner/admin |
| **Platform** | Tenants · Create tenant · Plans · Health · Audit log | Super-admin |
| **System** | Notifications · Profile · 404 / error pages | All |

---

## Appendix C – Background jobs (pg-boss)

| Job | Trigger | Owner |
| :--- | :--- | :--- |
| `dograh.sync` / `dograh.derive` / `dograh.backfill` | Every $5\text{ min}$ (last $2\text{ h}$), nightly ($3\text{ days}$) / per run / manual | I3 |
| `call.dial` | Intake, campaign wave, callback, planner, call-now | I2 |
| `call.finalize` · `recording.archive` | Dograh webhook / sync detects end | I3 |
| `analyst.run` | After finalize (talk $\ge 15\text{ s}$) | I1 |
| `planner.run` | Nightly + on events | I2 |
| `whatsapp.send` | Reminders, tool, counsellor, planner | I3 |
| `webhook.deliver` | Any subscribed event | I2 |
| `reminder.send` | Visit/meeting/task due times | I2 |
| `portal.import` · `domain.verify` · `email.send` | Upload/webhook · every $5\text{ min}$ until verified · on demand | $\text{I1} / \text{I3}$ |
| `sla.check` · `digest.daily` · `compliance.audit` | Every $5\text{ min}$ · 08:00 tenant time · nightly | I1 |
| `billing.statement` · `retention.purge` · `duplicates.scan` | 1st of month · nightly · nightly | $\text{I2} / \text{I3}$ |

---

## Appendix D – Environment variables

| Variable | Used by | Notes |
| :--- | :--- | :--- |
| `DATABASE_URL` | `api`, `worker` | App role without `BYPASSRLS` |
| `DATABASE_MIGRATION_URL` | CI / deploy | Owner role, migrations only |
| `MASTER_KEY`, `MASTER_KEY_VERSION` | `api`, `worker` | 32-byte key for `tenant_secret` encryption |
| `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`/`SECRET` | `api` | Rotated Day 1 |
| `PUBLIC_BASE_URL` | `api`, `web` | `https://app.laveric.com` |
| `DOGRAH_BASE_URL`, `DOGRAH_PLATFORM_KEY` | `api`, `worker` | Platform key only for org creation; tenant keys live encrypted in DB |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | `api`, `worker` | Per environment |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY` / SES creds | `worker` | |
| `DEFAULT_LLM_PROVIDER`, `DEFAULT_LLM_MODEL`, `DEFAULT_LLM_KEY` | `worker` | Fallback when tenant has none |
| `GLITCHTIP_DSN` | `api`, `worker`, `web` | |
| `NODE_ENV`, `LOG_LEVEL` | all | |

---

*End of handbook. Changes to this document go through Vaidik; record significant changes as an ADR in `docs/decisions/`.*