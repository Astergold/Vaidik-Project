# Data model (D1-I2-05)

Source of truth is `packages/db/migrations/*.sql`. The **Implemented tables** section below is generated from the live
schema after all migrations in `packages/db/migrations`; if it disagrees with the migrations, the migrations win — fix this file.
Handbook §6 is the design intent; the **Deviations** list says exactly where the implementation differs and why.

## Conventions

| Topic                 | Rule                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema                | Everything in `crm`. Never `public`. dbmate tracks versions in `crm.schema_migrations`.                                                                                 |
| Roles                 | `crm_owner` = migrations only. `crm_app` = api/worker/tests; no superuser, no BYPASSRLS, owns nothing.                                                                  |
| Tenant context        | Per request/job: `select set_config('app.tenant_id', $tenant, true)` — use `withTenant()`. Unset ⇒ zero rows.                                                           |
| RLS                   | Every table except Better Auth tables has `tenant_id` and policy `tenant_id = crm.current_tenant_id()` (USING + WITH CHECK). `tenant` itself uses `id`.                 |
| IDs                   | UUIDv7 via `crm.uuid_v7()` default (Postgres 17 has no native one). Don't generate IDs in app code unless you must know them first (e.g. creating a tenant).            |
| Enums                 | `text` + `CHECK`. Mirrored in `@vernacular/contracts` (`enums.ts`); `schema-structure.test.ts` fails if they diverge.                                                   |
| Time                  | `timestamptz`, UTC. Display in tenant timezone. Policy window end is **exclusive** (21:00 rejected, 20:59 allowed).                                                     |
| Phones/emails         | Normalise before insert: phone E.164, email lower+trim. Dedupe = `UNIQUE (tenant_id, kind, value_norm)` + `ON CONFLICT`.                                                |
| Append-only           | `audit_log`, `lead_stage_history`, `consent_record`, `lead_temperature_observation`, `usage_event`, `agent_tool_call`, `recording_access_log`: SELECT + INSERT only.    |
| Erasure (DPDP, Day 7) | Append-only tables hold PII-adjacent text (quotes, evidence). Erasure will be a SECURITY DEFINER function owned by `crm_owner` (D7-I2-01), not a grant to the app role. |

## Database-enforced rules

1. **Dedupe** — `person_identifier UNIQUE (tenant_id, kind, value_norm)`.
2. **One lead per person per cycle** — `lead UNIQUE (tenant_id, person_id, cycle_id)`.
3. **One active call per lead** — partial unique index `call_attempt_one_active_per_lead` on `(lead_id) WHERE status IN ('reserved','dialing','in_progress')`. Reserve-then-dial treats `23505` as "already being called".
4. **One provider run → one call_attempt** — unique `(tenant_id, dograh_run_id)` where not null.
5. **One current cycle per tenant** — partial unique on `admission_cycle(tenant_id) WHERE is_current`.
6. **Verbatim quotes** — trigger on `lead_temperature_observation` (source `ai_analyst`) and `analysis.objections`: quote must be a case-sensitive exact substring of `call_attempt.transcript_text` after collapsing whitespace on both sides. Violation = SQLSTATE `23514`. AI observations must also carry `call_attempt_id` and a non-empty quote (CHECK).
7. **Temperature cache** — `lead.current_temperature` is set by an AFTER INSERT trigger on observations; the latest `observed_at` wins (a back-dated observation does not overwrite a newer value).
8. **Append-only** — enforced by missing grants (see Conventions).
9. **Suppression / consent are per tenant**; consent revocation is a new row with `granted = false`.

## Pre-tenant lookup functions (SECURITY DEFINER, `search_path = crm, pg_temp`, EXECUTE for `crm_app` only)

| Function                                 | Used by                                              | Returns                                                                  |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `crm.resolve_tenant_by_domain(host)`     | branding / tenant from Host (verified custom domain) | `tenant_id, slug, status`                                                |
| `crm.resolve_tenant_by_slug(slug)`       | `slug.laveric.com` hosts                             | `tenant_id, slug, status`                                                |
| `crm.resolve_tenant_by_webhook_key(key)` | `/api/webhooks/*/:tenantKey`                         | `tenant_id, slug, status`                                                |
| `crm.resolve_intake_source(source_key)`  | `POST /api/intake/:sourceKey`                        | source row incl. `secret_token_hash`, mapping, defaults, `tenant_status` |
| `crm.domain_allowed(host)`               | Caddy on-demand TLS `ask`                            | `boolean` (verified domain AND active tenant)                            |

Later (when their task starts): `resolve_api_key(prefix)` (Day 5), `platform_list_tenants()` (Day 6). Add as new migrations — do not
widen these.

## Deviations from handbook §6 (all deliberate)

| Handbook                                      | Implemented                                                                                                                    | Reason                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `lead_stage_history.at`, `consent_record.at`  | `created_at`                                                                                                                   | Consistent naming; `at` is awkward in SQL.                                                                                  |
| `tenant_policy.holiday_calendar_id`           | table `tenant_holiday(tenant_id, on_date, name)`                                                                               | A calendar table adds nothing for v1.                                                                                       |
| `tenant_secret` (ciphertext, iv, key_version) | + `auth_tag bytea`                                                                                                             | AES-256-GCM needs the tag.                                                                                                  |
| `call_attempt.transcript json`                | + `transcript_text text`                                                                                                       | The quote triggers need plain text; finalize must fill both.                                                                |
| not listed                                    | `person.ndnc_status/ndnc_checked_at/erased_at`                                                                                 | Needed by D3-I1-04 (NDNC import) and D7-I2-01 (erasure).                                                                    |
| not listed                                    | `recording_access_log`, `lead.last_reject_code/at`, `call_attempt.direction`, `tenant.webhook_key`, `intake_source.source_key` | Required by D3-I1-01, D3-I2-03 / Lead 360 reject reason, inbound calls, webhook URLs, intake URL.                           |
| `user.is_platform_admin`, etc.                | Better Auth camelCase columns (`"isPlatformAdmin"`)                                                                            | Matches Better Auth defaults, so no field mapping on Day 2. Our own tables are snake_case.                                  |
| "RLS on every tenant table"                   | Better Auth tables have **no RLS**                                                                                             | They're read before a tenant is known. Authorisation is in the service layer; all tenant data behind them is RLS-protected. |
| `dograh_run_raw` "never edited"               | upsertable by the sync job                                                                                                     | Payload refreshes while a run progresses; humans never edit it.                                                             |
| `analysis` many per call                      | `UNIQUE (call_attempt_id)`                                                                                                     | Analyst job is idempotent: re-run = upsert.                                                                                 |
| `call_attempt.dial_job_id`, `dial_trigger`    | added by migration `20261007000100`                                                                                            | Lets the dial job recognise its own reservation after a crash (see dial-job.md).                                            |
| `program_fee/_seat/_deadline`, `kb_document`  | not yet                                                                                                                        | Day 4 migration (D4-I2-01). `program` exists now because `lead` references it.                                              |

## Planned tables (new migration each, owner I2 — others _request_ via I2)

| Table(s)                                                                                    | Needed by                    | When    |
| ------------------------------------------------------------------------------------------- | ---------------------------- | ------- |
| `program_fee`, `program_seat`, `program_deadline`, `kb_document`, `tenant_extraction_rules` | D4-I2-01, D4-I1-02           | Day 4   |
| `campus_visit`, `meeting`                                                                   | D4-I2-04                     | Day 4   |
| `application`, `tracked_link`, `whatsapp_template`, `whatsapp_message`                      | D5-I1-01, D5-I1-03, D5-I3-01 | Day 4–5 |
| `api_key`, `webhook_subscription`, `webhook_delivery`                                       | D5-I2-01/03                  | Day 5   |
| `plan`, `wallet_transaction`, `invoice_statement`, `tenant.plan_id` FK                      | D6-I2-01/02                  | Day 6   |
| `llm_provider_config`, `planner_proposal`, `notification`, `saved_view`                     | D4-I1-01, D6-*               | Day 4–6 |

## Better Auth status (updated Day 2)

- **Verified against migration 0200 with no schema change needed**: email+password sign-in/out, password reset, session cookie,
  `generateId: false` (DB-generated UUIDv7 ids), `isPlatformAdmin` additional field (`input: false`), session hook that defaults
  `activeOrganizationId` to the user's oldest membership.
- **Not yet exercised** (Day 6): organization invitation endpoints, `setActive`, admin plugin (impersonation/ban), Google OAuth. Before
  building them, run the Better Auth CLI `generate` and diff against 0200; any difference goes in a **new** migration.
- `tenant.id` **is** `organization.id`. Create the organization first, then the tenant inside `withTenant(newId)`.
- Roles are `owner | admin | admission_head | counsellor` (CHECK on `member.role`), defined in the organization plugin's access control.
- The API reads `member` directly (no RLS on auth tables) on every request to resolve role; removing a member is effective immediately.

## Implemented tables

### Auth (Better Auth, no RLS)

**`user`**

| column          | type        | null | default   |
| --------------- | ----------- | ---- | --------- |
| id              | uuid        | no   | uuid_v7() |
| name            | text        | no   |           |
| email           | text        | no   |           |
| emailVerified   | bool        | no   | false     |
| image           | text        | yes  |           |
| isPlatformAdmin | bool        | no   | false     |
| role            | text        | yes  |           |
| banned          | bool        | yes  | false     |
| banReason       | text        | yes  |           |
| banExpires      | timestamptz | yes  |           |
| createdAt       | timestamptz | no   | now()     |
| updatedAt       | timestamptz | no   | now()     |

**`organization`**

| column    | type        | null | default   |
| --------- | ----------- | ---- | --------- |
| id        | uuid        | no   | uuid_v7() |
| name      | text        | no   |           |
| slug      | text        | no   |           |
| logo      | text        | yes  |           |
| metadata  | text        | yes  |           |
| createdAt | timestamptz | no   | now()     |

**`session`**

| column               | type        | null | default   |
| -------------------- | ----------- | ---- | --------- |
| id                   | uuid        | no   | uuid_v7() |
| expiresAt            | timestamptz | no   |           |
| token                | text        | no   |           |
| ipAddress            | text        | yes  |           |
| userAgent            | text        | yes  |           |
| userId               | uuid        | no   |           |
| activeOrganizationId | uuid        | yes  |           |
| impersonatedBy       | uuid        | yes  |           |
| createdAt            | timestamptz | no   | now()     |
| updatedAt            | timestamptz | no   | now()     |

**`account`**

| column                | type        | null | default   |
| --------------------- | ----------- | ---- | --------- |
| id                    | uuid        | no   | uuid_v7() |
| accountId             | text        | no   |           |
| providerId            | text        | no   |           |
| userId                | uuid        | no   |           |
| accessToken           | text        | yes  |           |
| refreshToken          | text        | yes  |           |
| idToken               | text        | yes  |           |
| accessTokenExpiresAt  | timestamptz | yes  |           |
| refreshTokenExpiresAt | timestamptz | yes  |           |
| scope                 | text        | yes  |           |
| password              | text        | yes  |           |
| createdAt             | timestamptz | no   | now()     |
| updatedAt             | timestamptz | no   | now()     |

**`verification`**

| column     | type        | null | default   |
| ---------- | ----------- | ---- | --------- |
| id         | uuid        | no   | uuid_v7() |
| identifier | text        | no   |           |
| value      | text        | no   |           |
| expiresAt  | timestamptz | no   |           |
| createdAt  | timestamptz | no   | now()     |
| updatedAt  | timestamptz | no   | now()     |

**`member`**

| column         | type        | null | default   |
| -------------- | ----------- | ---- | --------- |
| id             | uuid        | no   | uuid_v7() |
| organizationId | uuid        | no   |           |
| userId         | uuid        | no   |           |
| role           | text        | no   |           |
| createdAt      | timestamptz | no   | now()     |

**`invitation`**

| column         | type        | null | default   |
| -------------- | ----------- | ---- | --------- |
| id             | uuid        | no   | uuid_v7() |
| organizationId | uuid        | no   |           |
| email          | text        | no   |           |
| role           | text        | yes  |           |
| status         | text        | no   | 'pending' |
| expiresAt      | timestamptz | no   |           |
| inviterId      | uuid        | no   |           |
| createdAt      | timestamptz | no   | now()     |

### Platform & tenancy

**`tenant`**

| column        | type        | null | default                                                          |
| ------------- | ----------- | ---- | ---------------------------------------------------------------- |
| id            | uuid        | no   |                                                                  |
| name          | text        | no   |                                                                  |
| slug          | text        | no   |                                                                  |
| status        | text        | no   | 'active'                                                         |
| timezone      | text        | no   | 'Asia/Kolkata'                                                   |
| plan_id       | uuid        | yes  |                                                                  |
| dograh_org_id | text        | yes  |                                                                  |
| webhook_key   | text        | no   | replace(((gen_random_uuid()) \|\| (gen_random_uuid())), '-', '') |
| created_at    | timestamptz | no   | now()                                                            |
| updated_at    | timestamptz | no   | now()                                                            |

**`tenant_secret`**

| column      | type        | null | default   |
| ----------- | ----------- | ---- | --------- |
| id          | uuid        | no   | uuid_v7() |
| tenant_id   | uuid        | no   |           |
| kind        | text        | no   |           |
| ciphertext  | bytea       | no   |           |
| iv          | bytea       | no   |           |
| auth_tag    | bytea       | no   |           |
| key_version | int4        | no   | 1         |
| created_at  | timestamptz | no   | now()     |
| updated_at  | timestamptz | no   | now()     |

**`tenant_branding`**

| column          | type        | null | default         |
| --------------- | ----------- | ---- | --------------- |
| tenant_id       | uuid        | no   |                 |
| product_name    | text        | no   | 'Vernacular AI' |
| logo_key        | text        | yes  |                 |
| favicon_key     | text        | yes  |                 |
| colours         | jsonb       | no   | '{}'            |
| email_from      | text        | yes  |                 |
| whatsapp_sender | text        | yes  |                 |
| updated_at      | timestamptz | no   | now()           |

**`tenant_domain`**

| column             | type        | null | default                               |
| ------------------ | ----------- | ---- | ------------------------------------- |
| id                 | uuid        | no   | uuid_v7()                             |
| tenant_id          | uuid        | no   |                                       |
| hostname           | text        | no   |                                       |
| verification_token | text        | no   | replace((gen_random_uuid()), '-', '') |
| verified_at        | timestamptz | yes  |                                       |
| tls_status         | text        | no   | 'pending'                             |
| created_at         | timestamptz | no   | now()                                 |

**`tenant_policy`**

| column               | type        | null | default                            |
| -------------------- | ----------- | ---- | ---------------------------------- |
| tenant_id            | uuid        | no   |                                    |
| call_window_start    | time        | no   | '09:00:00'::time without time zone |
| call_window_end      | time        | no   | '21:00:00'::time without time zone |
| allowed_days         | _int2       | no   | '{1,2,3,4,5,6}'::smallint[]        |
| max_attempts_per_day | int4        | no   | 3                                  |
| max_attempts_total   | int4        | no   | 8                                  |
| min_gap_minutes      | int4        | no   | 60                                 |
| require_consent      | bool        | no   | true                               |
| ndnc_check           | bool        | no   | true                               |
| promo_requires_140   | bool        | no   | false                              |
| ai_disclosure_text   | text        | yes  |                                    |
| updated_at           | timestamptz | no   | now()                              |

**`tenant_holiday`**

| column    | type | null | default   |
| --------- | ---- | ---- | --------- |
| id        | uuid | no   | uuid_v7() |
| tenant_id | uuid | no   |           |
| on_date   | date | no   |           |
| name      | text | no   |           |

**`audit_log`**

| column          | type        | null | default   |
| --------------- | ----------- | ---- | --------- |
| id              | uuid        | no   | uuid_v7() |
| tenant_id       | uuid        | no   |           |
| actor_user_id   | uuid        | yes  |           |
| impersonator_id | uuid        | yes  |           |
| action          | text        | no   |           |
| entity          | text        | no   |           |
| entity_id       | text        | yes  |           |
| diff            | jsonb       | yes  |           |
| ip              | inet        | yes  |           |
| created_at      | timestamptz | no   | now()     |

### Catalog, sources, agents

**`program`**

| column     | type        | null | default   |
| ---------- | ----------- | ---- | --------- |
| id         | uuid        | no   | uuid_v7() |
| tenant_id  | uuid        | no   |           |
| name       | text        | no   |           |
| code       | text        | yes  |           |
| is_active  | bool        | no   | true      |
| created_at | timestamptz | no   | now()     |
| updated_at | timestamptz | no   | now()     |

**`ai_agent`**

| column             | type        | null | default   |
| ------------------ | ----------- | ---- | --------- |
| id                 | uuid        | no   | uuid_v7() |
| tenant_id          | uuid        | no   |           |
| display_name       | text        | no   |           |
| dograh_workflow_id | text        | yes  |           |
| language           | text        | no   | 'en'      |
| voice              | text        | yes  |           |
| is_active          | bool        | no   | true      |
| created_at         | timestamptz | no   | now()     |
| updated_at         | timestamptz | no   | now()     |

**`ai_agent_counsellor`**

| column      | type | null | default |
| ----------- | ---- | ---- | ------- |
| tenant_id   | uuid | no   |         |
| ai_agent_id | uuid | no   |         |
| user_id     | uuid | no   |         |

**`intake_source`**

| column             | type        | null | default                                                          |
| ------------------ | ----------- | ---- | ---------------------------------------------------------------- |
| id                 | uuid        | no   | uuid_v7()                                                        |
| tenant_id          | uuid        | no   |                                                                  |
| source_key         | text        | no   | replace(((gen_random_uuid()) \|\| (gen_random_uuid())), '-', '') |
| name               | text        | no   |                                                                  |
| kind               | text        | no   |                                                                  |
| secret_token_hash  | text        | yes  |                                                                  |
| field_mapping      | jsonb       | no   | '{}'                                                             |
| default_program_id | uuid        | yes  |                                                                  |
| default_agent_id   | uuid        | yes  |                                                                  |
| auto_dial          | bool        | no   | true                                                             |
| is_active          | bool        | no   | true                                                             |
| created_at         | timestamptz | no   | now()                                                            |
| updated_at         | timestamptz | no   | now()                                                            |

### Students & pipeline

**`person`**

| column             | type        | null | default   |
| ------------------ | ----------- | ---- | --------- |
| id                 | uuid        | no   | uuid_v7() |
| tenant_id          | uuid        | no   |           |
| full_name          | text        | yes  |           |
| preferred_language | text        | yes  |           |
| city               | text        | yes  |           |
| state              | text        | yes  |           |
| notes              | text        | yes  |           |
| ndnc_status        | text        | no   | 'unknown' |
| ndnc_checked_at    | timestamptz | yes  |           |
| erased_at          | timestamptz | yes  |           |
| created_at         | timestamptz | no   | now()     |
| updated_at         | timestamptz | no   | now()     |

**`person_identifier`**

| column     | type        | null | default   |
| ---------- | ----------- | ---- | --------- |
| id         | uuid        | no   | uuid_v7() |
| tenant_id  | uuid        | no   |           |
| person_id  | uuid        | no   |           |
| kind       | text        | no   |           |
| value_raw  | text        | no   |           |
| value_norm | text        | no   |           |
| is_primary | bool        | no   | false     |
| created_at | timestamptz | no   | now()     |

**`admission_cycle`**

| column     | type | null | default   |
| ---------- | ---- | ---- | --------- |
| id         | uuid | no   | uuid_v7() |
| tenant_id  | uuid | no   |           |
| name       | text | no   |           |
| starts_on  | date | no   |           |
| ends_on    | date | no   |           |
| is_current | bool | no   | false     |

**`lead_sub_stage`**

| column     | type | null | default   |
| ---------- | ---- | ---- | --------- |
| id         | uuid | no   | uuid_v7() |
| tenant_id  | uuid | no   |           |
| core_stage | text | no   |           |
| name       | text | no   |           |
| sort_order | int4 | no   | 0         |

**`lead`**

| column              | type        | null | default   |
| ------------------- | ----------- | ---- | --------- |
| id                  | uuid        | no   | uuid_v7() |
| tenant_id           | uuid        | no   |           |
| person_id           | uuid        | no   |           |
| cycle_id            | uuid        | no   |           |
| source_id           | uuid        | yes  |           |
| program_id          | uuid        | yes  |           |
| stage               | text        | no   | 'new'     |
| sub_stage_id        | uuid        | yes  |           |
| current_temperature | text        | yes  |           |
| next_step           | text        | yes  |           |
| next_step_due_at    | timestamptz | yes  |           |
| owner_counsellor_id | uuid        | yes  |           |
| ai_agent_id         | uuid        | yes  |           |
| lost_reason         | text        | yes  |           |
| last_reject_code    | text        | yes  |           |
| last_reject_at      | timestamptz | yes  |           |
| created_at          | timestamptz | no   | now()     |
| updated_at          | timestamptz | no   | now()     |

**`lead_stage_history`**

| column        | type        | null | default   |
| ------------- | ----------- | ---- | --------- |
| id            | uuid        | no   | uuid_v7() |
| tenant_id     | uuid        | no   |           |
| lead_id       | uuid        | no   |           |
| from_stage    | text        | yes  |           |
| to_stage      | text        | no   |           |
| reason        | text        | yes  |           |
| actor         | text        | no   |           |
| actor_user_id | uuid        | yes  |           |
| created_at    | timestamptz | no   | now()     |

**`consent_record`**

| column     | type        | null | default   |
| ---------- | ----------- | ---- | --------- |
| id         | uuid        | no   | uuid_v7() |
| tenant_id  | uuid        | no   |           |
| person_id  | uuid        | no   |           |
| channel    | text        | no   |           |
| purpose    | text        | no   |           |
| granted    | bool        | no   |           |
| source     | text        | no   |           |
| evidence   | jsonb       | yes  |           |
| created_at | timestamptz | no   | now()     |

**`suppression`**

| column     | type        | null | default   |
| ---------- | ----------- | ---- | --------- |
| id         | uuid        | no   | uuid_v7() |
| tenant_id  | uuid        | no   |           |
| kind       | text        | no   |           |
| value_norm | text        | no   |           |
| reason     | text        | no   |           |
| source     | text        | yes  |           |
| expires_at | timestamptz | yes  |           |
| created_at | timestamptz | no   | now()     |

**`lead_note`**

| column     | type        | null | default   |
| ---------- | ----------- | ---- | --------- |
| id         | uuid        | no   | uuid_v7() |
| tenant_id  | uuid        | no   |           |
| lead_id    | uuid        | no   |           |
| author_id  | uuid        | yes  |           |
| body       | text        | no   |           |
| kind       | text        | no   | 'note'    |
| created_at | timestamptz | no   | now()     |

**`task`**

| column      | type        | null | default     |
| ----------- | ----------- | ---- | ----------- |
| id          | uuid        | no   | uuid_v7()   |
| tenant_id   | uuid        | no   |             |
| lead_id     | uuid        | no   |             |
| assignee_id | uuid        | yes  |             |
| title       | text        | no   |             |
| due_at      | timestamptz | yes  |             |
| status      | text        | no   | 'open'      |
| kind        | text        | no   | 'follow_up' |
| created_at  | timestamptz | no   | now()       |
| updated_at  | timestamptz | no   | now()       |

**`duplicate_candidate`**

| column     | type        | null | default   |
| ---------- | ----------- | ---- | --------- |
| id         | uuid        | no   | uuid_v7() |
| tenant_id  | uuid        | no   |           |
| person_a   | uuid        | no   |           |
| person_b   | uuid        | no   |           |
| reason     | text        | no   |           |
| status     | text        | no   | 'open'    |
| created_at | timestamptz | no   | now()     |

### Calls & AI

**`campaign`**

| column         | type        | null | default   |
| -------------- | ----------- | ---- | --------- |
| id             | uuid        | no   | uuid_v7() |
| tenant_id      | uuid        | no   |           |
| name           | text        | no   |           |
| ai_agent_id    | uuid        | no   |           |
| lead_filter    | jsonb       | no   | '{}'      |
| schedule       | jsonb       | no   | '{}'      |
| daily_cap      | int4        | yes  |           |
| max_concurrent | int4        | no   | 5         |
| status         | text        | no   | 'draft'   |
| created_by     | uuid        | yes  |           |
| created_at     | timestamptz | no   | now()     |
| updated_at     | timestamptz | no   | now()     |

**`call_attempt`**

| column          | type        | null | default    |
| --------------- | ----------- | ---- | ---------- |
| id              | uuid        | no   | uuid_v7()  |
| tenant_id       | uuid        | no   |            |
| lead_id         | uuid        | no   |            |
| campaign_id     | uuid        | yes  |            |
| ai_agent_id     | uuid        | yes  |            |
| direction       | text        | no   | 'outbound' |
| dograh_run_id   | text        | yes  |            |
| status          | text        | no   | 'reserved' |
| reject_code     | text        | yes  |            |
| started_at      | timestamptz | yes  |            |
| ended_at        | timestamptz | yes  |            |
| duration_s      | int4        | yes  |            |
| disposition     | text        | yes  |            |
| recording_key   | text        | yes  |            |
| transcript      | jsonb       | yes  |            |
| transcript_text | text        | yes  |            |
| created_at      | timestamptz | no   | now()      |
| updated_at      | timestamptz | no   | now()      |
| dial_job_id     | uuid        | yes  |            |
| dial_trigger    | text        | yes  |            |

**`dograh_run_raw`**

| column        | type        | null | default   |
| ------------- | ----------- | ---- | --------- |
| id            | uuid        | no   | uuid_v7() |
| tenant_id     | uuid        | no   |           |
| dograh_run_id | text        | no   |           |
| payload       | jsonb       | no   |           |
| fetched_at    | timestamptz | no   | now()     |

**`sync_cursor`**

| column       | type        | null | default   |
| ------------ | ----------- | ---- | --------- |
| id           | uuid        | no   | uuid_v7() |
| tenant_id    | uuid        | no   |           |
| source       | text        | no   |           |
| window_start | timestamptz | no   |           |
| window_end   | timestamptz | no   |           |
| last_run_at  | timestamptz | yes  |           |
| counts       | jsonb       | no   | '{}'      |

**`agent_tool_call`**

| column          | type        | null | default   |
| --------------- | ----------- | ---- | --------- |
| id              | uuid        | no   | uuid_v7() |
| tenant_id       | uuid        | no   |           |
| call_attempt_id | uuid        | yes  |           |
| tool            | text        | no   |           |
| request         | jsonb       | yes  |           |
| response        | jsonb       | yes  |           |
| latency_ms      | int4        | yes  |           |
| ok              | bool        | no   | true      |
| cache_status    | text        | yes  |           |
| created_at      | timestamptz | no   | now()     |

**`analysis`**

| column                  | type        | null | default   |
| ----------------------- | ----------- | ---- | --------- |
| id                      | uuid        | no   | uuid_v7() |
| tenant_id               | uuid        | no   |           |
| call_attempt_id         | uuid        | no   |           |
| model                   | text        | yes  |           |
| summary                 | text        | yes  |           |
| next_step               | text        | yes  |           |
| next_step_due_at        | timestamptz | yes  |           |
| objections              | jsonb       | no   | '[]'      |
| needs_counsellor        | bool        | no   | false     |
| needs_counsellor_reason | text        | yes  |           |
| language_detected       | text        | yes  |           |
| extracted               | jsonb       | no   | '{}'      |
| raw                     | jsonb       | yes  |           |
| created_at              | timestamptz | no   | now()     |

**`counsellor_queue_item`**

| column          | type        | null | default   |
| --------------- | ----------- | ---- | --------- |
| id              | uuid        | no   | uuid_v7() |
| tenant_id       | uuid        | no   |           |
| lead_id         | uuid        | no   |           |
| call_attempt_id | uuid        | yes  |           |
| kind            | text        | no   |           |
| reason          | text        | yes  |           |
| assignee_id     | uuid        | yes  |           |
| status          | text        | no   | 'open'    |
| due_at          | timestamptz | yes  |           |
| resolved_at     | timestamptz | yes  |           |
| outcome         | text        | yes  |           |
| created_at      | timestamptz | no   | now()     |

**`usage_event`**

| column          | type        | null | default   |
| --------------- | ----------- | ---- | --------- |
| id              | uuid        | no   | uuid_v7() |
| tenant_id       | uuid        | no   |           |
| kind            | text        | no   |           |
| quantity        | numeric     | no   |           |
| unit_price      | numeric     | no   | 0         |
| call_attempt_id | uuid        | yes  |           |
| ref             | text        | yes  |           |
| created_at      | timestamptz | no   | now()     |

**`recording_access_log`**

| column          | type        | null | default   |
| --------------- | ----------- | ---- | --------- |
| id              | uuid        | no   | uuid_v7() |
| tenant_id       | uuid        | no   |           |
| call_attempt_id | uuid        | no   |           |
| user_id         | uuid        | yes  |           |
| ip              | inet        | yes  |           |
| created_at      | timestamptz | no   | now()     |

**`lead_temperature_observation`**

| column           | type        | null | default   |
| ---------------- | ----------- | ---- | --------- |
| id               | uuid        | no   | uuid_v7() |
| tenant_id        | uuid        | no   |           |
| lead_id          | uuid        | no   |           |
| value            | text        | no   |           |
| source           | text        | no   |           |
| verbatim_quote   | text        | yes  |           |
| call_attempt_id  | uuid        | yes  |           |
| observer_user_id | uuid        | yes  |           |
| reason           | text        | yes  |           |
| observed_at      | timestamptz | no   | now()     |
