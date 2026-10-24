# Day 2 handoff from I2 (Backend core)

Builds on `day1-handoff.md`. Everything below is merged-ready and covered by tests (API: 115 tests on a real Postgres;
DB: 38). Nothing needs I2 online to use it.

## What exists now

| Capability           | Where                           | Notes                                                                                                    |
| -------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Fastify app skeleton | `apps/api/src/server.ts`        | config fail-fast, zod validation + response schemas, standard errors, rate limit, Swagger at `/api/docs` |
| Auth (Better Auth)   | `/api/auth/*`                   | email+password, password reset, sign-out; Google wired but untested; sign-up **disabled**                |
| Tenant scope         | `plugins/tenant.ts`             | session → tenant → role → one RLS transaction per request                                                |
| Guards               | `guards.ts`                     | `requireRole`, `assertLeadAccess`, `leadScope`, `maskPhone`                                              |
| Endpoints            | `GET /api/me`, `GET /api/leads` | contracts in `@vernacular/contracts` (`meResponse`, `leadsListQuery`, `leadsListResponse`)               |
| Jobs                 | `apps/api/src/jobs`, worker     | pg-boss 12; `enqueueInTx`; retries 5× + dead letter; `system.ping`                                       |
| Secrets              | `modules/secrets`               | AES-256-GCM, `getSecret(tenantId, kind)`, key rotation                                                   |
| Seed                 | `pnpm db:seed`                  | MIT-ADT tenant, 4 users + super-admin, 1 AI agent, 4 programs, 14 fake leads                             |
| Test harnesses       | `apps/api/test`                 | route registry (public list), cross-tenant, role matrix, mutation-checked                                |

Seed logins (password = `SEED_PASSWORD`): `owner@mit-adt.local`, `head@mit-adt.local`, `c1@mit-adt.local`, `c2@mit-adt.local`,
`admin@laveric.local` (super-admin: no tenant membership, so tenant routes return 403 `NO_TENANT_CONTEXT` until impersonation lands on Day 6).

## I4 — Frontend (you can start D2-I4-01…03 now)

- **Same-origin**: the browser must talk to `/api/*` on its own origin. In dev, proxy `/api` → `http://localhost:3001` from the
  web dev server and set `PUBLIC_BASE_URL` to the web origin (default `http://localhost:3000`). The API has no CORS on purpose.
- **Login**: `POST /api/auth/sign-in/email` `{ email, password }` → httpOnly cookie `better-auth.session_token` (SameSite=Lax, 7 days).
  **Logout**: `POST /api/auth/sign-out` `{}`. **Forgot**: `POST /api/auth/request-password-reset` `{ email, redirectTo: "/reset-password" }`
  (always 200); the email link lands on `/reset-password?token=…`; then `POST /api/auth/reset-password` `{ newPassword, token }` (min 10 chars).
  Accept-invitation page: endpoint arrives Day 6 — build the page shell only.
- **Session probe**: `GET /api/me` → `{ user, tenant, role, isPlatformAdmin, impersonatedBy }`; **401 ⇒ redirect to /login**.
  Use `role` to decide sidebar items; **never trust it for security** (the API enforces everything).
- **Errors** are always `{ error: { code, message, details? } }` (Auth endpoints use Better Auth's own shape). 422 `details` is
  `[{ path, message }]` — map to form fields.
- **Leads list**: `GET /api/leads?page&pageSize&sort&order&q&stage&temperature&sourceId&agentId&counsellorId&createdFrom&createdTo`.
  Repeat a param for multi-select (`stage=new&stage=attempting`). Sort: `created_at | updated_at | next_step_due_at | full_name`.
  Response `{ items[], page, pageSize, total }`. Counsellors receive phones already masked (`••••••1234`) — render as given.
  Import the zod schemas from `@vernacular/contracts` and parse responses with them (that's the contract test).
- **Not available yet** (mock them): dashboard, lead detail/timeline, call-now (Day 3); filter option lists for sources/agents/counsellors
  (I2 adds `GET /api/leads/filters` — tell me if you want it earlier than Day 3).
- Time/zone: all timestamps are ISO-8601 UTC strings; format in `tenant.timezone`.

## I3 — Integrations

- **Add a job**: `modules/<x>/jobs.ts` → `defineJob({ name: "dograh.sync", schema: z.object({ tenantId: z.uuid(), … }), handler })`,
  add to `allJobs` in `src/jobs/index.ts`, run `pnpm jobs:install`. Handler gets `ctx.withTx`, `ctx.secrets`, `ctx.tenantId`, `ctx.log`.
  Scheduling recurring syncs (every 5 min) is **not built yet**: pg-boss supports `boss.schedule`; tell me if you want a
  `schedules` registry in `defineJob` — until then enqueue from a small startup hook in the worker.
- **Secrets**: `await ctx.secrets.requireSecret(ctx.tenantId, "dograh_api_key")`. Kinds in use: `dograh_api_key`,
  `dograh_webhook_secret`, `tool_hmac`, `llm_key`, `whatsapp_key`. Write them with `setSecret` (platform console, Day 6; until
  then a one-off script).
- **Webhook receivers / agent tools**: see "Public routes" in `api-conventions.md`. `request.rawBody` is the exact body for HMAC.
  Tenant lookup for webhooks: `crm.resolve_tenant_by_webhook_key(key)`.
- **Never** call `boss.send` — use `app.jobs.enqueueInTx(tx, job, data)` inside the transaction that writes your data.
- Worker bundle imports `@vernacular/api/jobs|config|secrets` (source exports; esbuild inlines them).

## I1 — Platform / DevOps

- **Deploy order** (per environment): `dbmate up` → `node dist/jobs-install.js` (owner URL; creates pgboss schema, queues, app-role
  grants; idempotent) → start `crm-api` + `crm-worker`.
- **Docker recipe, verified**: `pnpm install --frozen-lockfile && pnpm --filter @vernacular/api build && pnpm --filter @vernacular/worker build`,
  then `pnpm --filter @vernacular/api deploy --prod /out/api` (same for worker) produces a self-contained folder (`dist/` + prod
  `node_modules`). Run `node dist/index.js`; installer: `node dist/jobs-install.js`. api ← port 3001, `/health` (liveness),
  `/health/ready` (DB check, 503 if down).
- **Env**: api = `DATABASE_URL`, `PUBLIC_BASE_URL`, `BETTER_AUTH_SECRET`, `MASTER_KEY`, `MASTER_KEY_VERSION`, (`MASTER_KEY_PREVIOUS`,
  `GOOGLE_CLIENT_ID/SECRET`, `ENABLE_API_DOCS`), `PORT`, `LOG_LEVEL`, `NODE_ENV=production`. worker = `DATABASE_URL`, `MASTER_KEY*`, `LOG_LEVEL`.
  installer = `DATABASE_MIGRATION_URL`. The API **refuses to start** in production with the dev values from `.env.example`.
- **`MASTER_KEY` is irreplaceable**: lose it and every tenant's stored provider keys are unrecoverable. Back it up in the password
  manager separately from DB backups. Rotation: set new `MASTER_KEY` + bump `MASTER_KEY_VERSION`, put the old one in
  `MASTER_KEY_PREVIOUS`, deploy, run `rotateTenant` for each tenant (script lands with the platform console), then drop the old key.
- **Caddy**: proxy `/api/*` and `/v1/*` to `crm-api:3001`. The API runs with `trustProxy`, so **Caddy must set/overwrite
  `X-Forwarded-For`** (it does by default) and the API must only be reachable through Caddy. Keep `Host`/`X-Forwarded-Proto` intact
  (cookies are `Secure` in production).
- **Logs**: JSON, with `reqId`, `tenantId`, `userId`; `x-request-id` is accepted and echoed. Cookies/auth headers are redacted.
  Phone-number masking in logs is your D2-I1-03 redactor.
- **CI** (`ci.yml`) now also runs `jobs:install` and `db:seed` (twice) and needs the CI-only env block already added.

## Vaidik — things to know / confirm

1. **Library versions moved since the handbook**: zod 4, Kysely 0.29, pg-boss 12, Better Auth 1.7. All pinned by the lockfile.
2. **Super-admin has no tenant access yet** (by design, until impersonation with audit on Day 6).
3. **Google sign-in is wired but untested** — needs real OAuth credentials from your D1-V-01 rotation.
4. **Email is console-only** until the SES/Resend adapter (D6-I3-04); in production the console mailer prints only subjects.
5. API docs (`/api/docs`) are **off in production** unless `ENABLE_API_DOCS=true` (then super-admin only).
6. Rate limits: 20/min/IP on `/api/auth/*`, 600/min/IP elsewhere — a university NAT'd office could hit the second; tune with real traffic.

## Not done on Day 2 (and why)

- `GET /api/dashboard`, lead detail/timeline, policy engine, intake, dial job → Day 3 (as planned).
- Invitation accept, tenant creation, impersonation → Day 6.
- A `schedules` registry for recurring jobs → waiting on I3's confirmation of the shape they want.
