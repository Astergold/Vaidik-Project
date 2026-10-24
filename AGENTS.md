# AGENTS.md — rules every AI coding tool reads first

Project: **Vernacular AI** — white-label, multi-tenant admission CRM (Laveric Technologies LLP).
Tenant #1: MIT-ADT University. Source of truth for scope/decisions: the 7-Day Build Handbook.
Changes to these rules go through a PR approved by Vaidik.

## Stack (do not substitute)

TypeScript strict · Node 22 · pnpm workspaces + Turborepo · Fastify 5 (+ zod type provider) ·
Kysely + pg (types generated, never hand-written) · dbmate SQL migrations · pg-boss (jobs, inside Postgres) ·
Better Auth (organization + admin plugins) · TanStack Start/Query/Table + Tailwind + shadcn/ui (web) ·
Vitest (unit/integration, **real Postgres**) · Playwright (e2e) · k6 (load) · Vercel AI SDK (LLM).

## Folder map

```
apps/api        Fastify. src/modules/<feature>/{routes,service,repo}.ts
apps/worker     pg-boss entrypoint; imports services from api modules. Never duplicates logic.
apps/web        TanStack Start UI. Calls ONLY same-origin /api/*. No DB, no provider SDKs.
packages/db     migrations/*.sql, src/generated/db.d.ts (generated), createDb + withTenant
packages/contracts   zod schemas + enums shared by api and web (the ONLY package web may share with api)
packages/policy      pure policy engine, no I/O
packages/integrations/{dograh,whatsapp,llm,storage,email}   one adapter each, with fixtures/
docs/specs      one spec per module (context for you)   docs/runbooks  docs/decisions (ADRs)
infra           docker-compose, Caddyfile, backups, k6   tests/e2e   Playwright
```

Module pattern: copy the structure of an existing module. `routes.ts` = HTTP + zod only;
`service.ts` = business logic, no HTTP types; `repo.ts` = Kysely queries only. Jobs call services.

## Commands

```
pnpm install                 pnpm dev                   pnpm build
pnpm lint                    pnpm format                pnpm typecheck
pnpm test                    # all packages; DB tests need Postgres + .env (see below)
pnpm db:up                   # local Postgres 17 in Docker (packages/db/dev)
pnpm db:migrate              # apply migrations (as owner role)
pnpm db:rollback             # roll back ONE migration
pnpm db:new <name>           # create a new migration file
pnpm db:codegen              # regenerate packages/db/src/generated/db.d.ts after ANY schema change
pnpm jobs:install            # install pg-boss schema + queues + grants (owner role). Run after db:migrate, on every deploy
pnpm --filter @vernacular/policy test   # policy engine incl. 100% coverage gate
pnpm db:seed                 # dev/staging only: MIT-ADT tenant, team, 14 fake leads (refuses in production)
pnpm db:roundtrip            # down all + up all: proves every down migration works
pnpm check:public-schema     # fails if anything references the `public` schema
```

Local setup: `cp .env.example .env && pnpm install && pnpm db:up && pnpm db:migrate && pnpm jobs:install && pnpm db:seed && pnpm test`.
Seeded logins (password = `SEED_PASSWORD` from `.env`): `owner@mit-adt.local`, `head@mit-adt.local`, `c1@mit-adt.local`, `c2@mit-adt.local`, `admin@laveric.local` (super-admin).

## Database rules (the ones AI tools break most)

- Everything lives in schema **`crm`**. Never `public`. (CI greps for it.)
- Two roles. **`crm_owner`** runs migrations only. **`crm_app`** runs api/worker/tests: not superuser,
  not BYPASSRLS, owns nothing. Request code must never use the owner URL.
- **All tenant data access goes through `withTenant(db, tenantId, async (trx) => …)`** from `@vernacular/db`.
  It opens a transaction and does `set_config('app.tenant_id', …, true)`. Outside it, RLS returns zero rows.
- Pre-tenant lookups (login host → branding, webhook key, intake source key, Caddy domain check) use the
  `crm.resolve_*` / `crm.domain_allowed` SECURITY DEFINER functions. Never add a bypass role to get around RLS.
- New tenant table checklist, in the migration: `tenant_id uuid not null references crm.tenant(id)`,
  `id uuid primary key default crm.uuid_v7()`, `select crm.enable_tenant_rls('crm.<table>');`
  (pass `true` as 2nd arg for append-only), an index starting with `tenant_id`, `updated_at` trigger if it has the column.
  CI fails (`schema-structure.test.ts`) if a table lacks RLS or a `tenant_id`.
- Enums are `text` + `CHECK`. Allowed values are mirrored in `packages/contracts/src/enums.ts`; a test keeps them equal.
  Adding a value = new migration changing the CHECK **and** the contracts enum in the same PR.
- IDs are UUIDv7 (`crm.uuid_v7()` default; the DB generates them). Times are `timestamptz` (UTC).
- Phones are normalised to E.164 (`+91…`) and emails lower-cased/trimmed **before** insert; dedupe relies on
  `UNIQUE (tenant_id, kind, value_norm)` — use `ON CONFLICT`, never read-then-insert.
- Append-only tables (`audit_log`, `lead_stage_history`, `consent_record`, `lead_temperature_observation`,
  `usage_event`, `agent_tool_call`, `recording_access_log`) have no UPDATE/DELETE for the app role. Don't "fix" that.
- `lead.current_temperature` is a cache written only by the DB trigger. Insert an observation instead.
- AI labels need `verbatim_quote` that is an exact substring of `call_attempt.transcript_text`
  (whitespace collapsed). The DB rejects fabricated quotes. Always populate `transcript_text` on finalize.
- Exactly-once dial: insert `call_attempt` with status `reserved`; a unique violation (`23505`) on
  `call_attempt_one_active_per_lead` means "someone else has it" → exit the job cleanly, do not retry.

## API rules (apps/api) — full detail in docs/specs/api-conventions.md

- **Tenant routes** are plugins listed in `src/modules/index.ts` (`tenantModules`). They run inside the tenant scope:
  no session → 401, otherwise `request.tx` is ONE RLS-scoped transaction that is committed on success (<400)
  and rolled back on any error. Get it with `const { tx, auth } = tenantCtx(req)`. **Never** open your own
  transaction or touch `app.db` for tenant data in a handler.
- **Public routes** are rare and deliberate: `config: { public: true }` AND added to the expected list in
  `test/tenant-scope.test.ts`. Webhooks/intake use the pre-tenant `crm.resolve_*` functions, then `withTenant`.
- **Every route declares zod schemas** from `@vernacular/contracts` for `querystring`/`body`/`params` and `response`.
  The response schema is enforced: fields not in it are stripped, so internal ids never leak.
- Authorisation: `preHandler: requireRole(...)` for role gates; `assertLeadAccess(tx, auth, leadId)` for any
  route that touches a lead; `leadScope(auth)` + `maskPhone()` for lists. Counsellors only see their own leads.
- Errors: throw `AppError` helpers from `src/errors.ts`. Wire format is always `{ error: { code, message, details? } }`.
  Validation failures are 422 `VALIDATION_ERROR`. Unknown errors are a generic 500 (no internals, no provider names).
- JSON is camelCase on the wire (contracts); the database is snake_case. Map in `repo`/`service`.
- Any route with a `:param` needs a fixture in `test/cross-tenant.test.ts`; any write route must be added to that
  file's reviewed list after its own cross-tenant test exists. The suite fails until you do.
- Need exact request bytes (HMAC)? `request.rawBody` is kept for every JSON body.

## Jobs (pg-boss) rules

- Define with `defineJob({ name: "domain.action", schema, handler })`; schema MUST extend `tenantPayload` (`tenantId`).
  Register in `src/jobs/index.ts` (`allJobs`) and run `pnpm jobs:install` so the queue exists.
- Enqueue ONLY with `jobs.enqueueInTx(tx, job, data)` inside the same transaction as the data change
  (a rollback un-sends the job). Never call `boss.send` directly. The payload tenant must equal the transaction's tenant.
- Handlers get `ctx.withTx(fn)` (tenant context set). Keep transactions short; never hold one across a provider/LLM/R2 call.
- Handlers must be idempotent (retries are automatic: 5 tries, exponential backoff, then `dead_letter`).
- Dedupe with `{ singletonKey, singletonSeconds }` together; a bare `singletonKey` does nothing.

## Secrets

`createSecretsService({ db, keyring }).getSecret(tenantId, kind)` / `setSecret(...)`. AES-256-GCM, bound to tenant+kind.
Never log, return or store a decrypted secret anywhere else. `MASTER_KEY` lives only in env / password manager.

## Calling, intake and stages (Day 3) — specs: policy-engine.md, intake.md, dial-job.md

- **Never decide "may we call/message?" yourself.** Load facts with `loadPolicyFacts` and call `evaluate` from `@vernacular/policy`
  (or `previewDial` for a quick yes/no). Reject codes are shown to users; don't invent new ones without adding them to
  `packages/contracts/src/policy.ts` and the engine.
- **Never write `lead.stage` directly.** Use `moveStage(tx, { leadId, to, actor, mode })` (`modules/leads/stage.ts`):
  `mode: "auto"` for integrations/system (forward only, never out of lost/invalid), `"manual"` for a person (needs a reason).
- **Never call the voice provider outside `call.dial`.** It reserves first (unique index), then dials with
  `Idempotency-Key = call_attempt.id`. New dial triggers (campaign, callback, planner) enqueue `dialJob`; they don't dial.
- **Phone/email normalisation is `normalizePhone` / `normalizeEmail` from `@vernacular/contracts`.** Do not write another one:
  dedupe depends on every code path producing the identical `value_norm`.
- **Pre-tenant public endpoints** (intake, webhooks): resolve the tenant with the `crm.resolve_*` functions, authenticate
  yourself (constant-time compare), then `withTenant`. Foreign keys do not check tenant ownership: when a request carries an id
  of a program/agent/user/sub-stage, **verify it exists inside the tenant** (RLS makes the select tenant-scoped).
- Anything that records a change a user would ask "who did this?" about writes `audit(tx, auth, {...})` in the same transaction.

## NEVER

- Never change the database without a new migration file in `packages/db/migrations`.
- Never write a query that isn't tenant-scoped; never use a DB role that bypasses RLS in request code.
- Never put secrets, API keys or real phone numbers in code, tests, fixtures or commits (mask phones in fixtures).
- Never show the word "Dograh" (or its URLs, IDs, error messages) in UI, API responses, emails or logs visible to tenants.
- Never dial, message or schedule outreach without going through the policy engine.
- Never call an LLM inside an HTTP request handler; enqueue a job.
- Never let `apps/web` touch Postgres, R2 or a provider directly (`grep -ri "kysely\|from 'pg'\|dograh" apps/web` must be empty).
- Never edit an applied migration, generated types (`packages/db/src/generated`), or lockfiles by hand.
- Never disable a failing test to make CI green — fix it or ask.
- Never write `lead.stage` directly, never dial or message without `evaluate`, never add a second phone normaliser.
- Never use `app.db` / your own transaction for tenant data in a route handler (use `req.tx` via `tenantCtx`).
- Never enqueue outside a transaction (`boss.send` directly) or put a job payload without `tenantId`.
- Never add a public route without `config.public` + updating the expected-public list in the tenant-scope test.
- Never return a database row straight from a handler; map to the contract (response schemas strip extras, don't rely on that).
- Never do slow work (>300 ms: external calls, LLM, big queries) inline in a request; enqueue a job in the same transaction.

## Definition of done (every task)

1. Acceptance criteria from the handbook pass, demonstrated on staging.
2. Typecheck, lint, tests green in CI. New logic has tests (policy/services: unit; endpoints: integration on real Postgres).
3. Tenant-isolation test added for any new tenant table or endpoint.
4. UI: screenshots at 1440 px and 390 px attached; empty, loading and error states exist.
5. Spec in `docs/specs/` updated if behaviour differs from plan.
6. Vaidik approved and merged.

## How to work with me (the AI tool)

1. Read this file, the task's `docs/specs/<module>.md`, and the pattern module named in the prompt.
2. **Show a short plan and the list of files you'll create/change. Wait for "go" before writing code.**
3. Write tests first, then implementation. Run them. Don't claim "tests pass" without running them.
4. Keep diffs small (< 400 lines excluding generated files). Split large work.
5. At the end, list any NEVER-list rule your diff breaks.
6. Branch `feat/D<day>-I<n>-<nn>-<slug>`, Conventional Commits, PR title starts with the task ID.
