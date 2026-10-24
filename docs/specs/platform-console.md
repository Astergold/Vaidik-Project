# Platform console (D6-I4-01)

## Goal

Laveric's super-admins onboard and run institutions without touching code: see every tenant (status, plan, usage,
wallet), create one in under 10 minutes, suspend/activate, top up a prepaid wallet, impersonate a tenant user with a
logged reason, edit plans, and watch platform health and the cross-tenant audit log.

## Status

**Screens built against a proposed contract; the platform API (D6-I3-01/02, D6-I2-01, D6-I1) does not exist yet**, so
nothing can be demonstrated end to end. Every screen shows "Platform service not available yet" when the API answers
`404 Route not found`. No data is faked. Contract: `packages/contracts/src/platform.ts`. `POST
/api/platform/tenants/:id/top-up` is **not in Appendix A** — proposed here because the handbook asks for a manual
super-admin top-up (D6-I2-01) without naming the endpoint. The impersonation banner reads the real
`GET /api/me → impersonatedBy` and gets the countdown from the proposed `GET /api/platform/impersonate`.

## Users & stories

- As a super-admin I see all tenants with status, plan, this month's minutes/messages and wallet balance, and filter
  by name or status.
- As a super-admin I create "Demo College": name, slug (subdomain), timezone, plan, billing mode, Voice Engine org
  (create new, or paste an existing **Voice Engine Org ID / Key**), owner's email — one screen, review, create; the
  result says what was set up and that the owner was invited.
- As a super-admin I suspend a tenant with a reason (blocks logins and dials) and activate it again.
- As a super-admin I top up a prepaid wallet with an amount and payment reference.
- As a super-admin I impersonate a tenant's owner with a reason; a banner shows whom I'm acting as and a 30-minute
  countdown, with **Exit**. Everything I do is audit-logged with both ids.
- As a super-admin I edit plans (fee, included minutes/messages, overage rates, seat limit, billing mode).
- As a super-admin I check queue depth, failed jobs, sync-health parity per tenant, and search the audit log.

## Endpoints (proposed)

| Call                                                            | Body / response                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /api/platform/tenants`                                     | `?q&status` → `platformTenantsResponse`                                   |
| `POST /api/platform/tenants`                                    | `createTenantBody` → 201 `createTenantResponse` (`ownerInvited`, `setup`) |
| `POST /api/platform/tenants/:id/suspend` · `/activate`          | `{ reason }` · `{}` → `platformTenant`                                    |
| `POST /api/platform/tenants/:id/top-up`                         | `{ amountPaise, reference }` → `platformTenant` (not in Appendix A)       |
| `POST /api/platform/impersonate`                                | `{ tenantId, userId?, reason }` → `impersonationSession`                  |
| `GET /api/platform/impersonate`                                 | → `{ session \| null }`                                                   |
| `DELETE /api/platform/impersonate`                              | → 204                                                                     |
| `GET/POST /api/platform/plans`, `PATCH /api/platform/plans/:id` | `planBody` → `plan`                                                       |
| `GET /api/platform/health`                                      | → `platformHealth` (queues, syncHealth, recentErrors)                     |
| `GET /api/admin/audit-log`                                      | `auditLogQuery` → `auditLogResponse`                                      |

Money is integer **paise**. The voice provider is called "Voice Engine" in every label; the API never returns its org
id or key (`voiceEngineConnected` only).

## Tables touched

None by the UI. Backend: `tenant`, `tenant_secret`, `plan`, `wallet_transaction`, `audit_log`, pg-boss tables.

## Pages

`/platform/tenants` (list, Suspend/Activate, Top up, Impersonate), `/platform/tenants/new` (single-screen wizard with
review step), `/platform/plans` (list + side-sheet editor), `/platform/health`, `/platform/audit-log` (filters, JSON
diff on expand). Impersonation banner in `AppShell`, above the top bar, on every page while active.

## Rules & edge cases

- Super-admin only (sitemap `PLATFORM`); other roles get "not available for your role" and no request is made.
- Suspend and impersonate require a reason; both are confirmed in a dialog.
- Never optimistic: rows show the tenant the server returned.
- Countdown uses the server's `expiresAt`; at zero the banner says the session expired and offers a reload.
- No provider name anywhere (DOM, errors, tooltips): "Voice Engine".

## Acceptance (once the API exists)

Handbook D6-I4-01: create a tenant through the UI in < 10 min. Checkpoint 6: impersonation shows in the audit log
with both ids; no "dograh" in rendered HTML.

## Out of scope

Tenant deletion, payment gateway, per-tenant domain management (tenant-side settings), editing a tenant's name/slug.
