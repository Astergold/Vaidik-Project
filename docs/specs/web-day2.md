# web-day2 (D2-I4-01 · D2-I4-02 · D2-I4-03 · D2-I4-04)

## Goal

Make the shell real: one API client with global error handling, working auth pages on Better Auth, the
person-centric Leads list on `GET /api/leads`, and the Dashboard on `GET /api/dashboard`.

## Users & stories

- As anyone, when a request fails I see one clear toast; when my session has expired I land on `/login` and
  return to where I was after signing in.
- As an invited/existing user I can sign in with email + password or Google, reset a forgotten password from
  the emailed link, and accept a team invitation.
- As an owner/admin/head I can page, sort, search (name/phone/email) and filter (stage, temperature, created
  date) every lead; as a counsellor I see only my leads with phones masked to the last 4 digits.
- As an owner/admin/head I see leads by stage, temperature split, call stats, and per-source/per-agent tables
  for a date range.

## Endpoints / pages

| Page                                                                        | Calls                                                                         | Notes                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| all                                                                         | any `/api/*` via `src/lib/api.ts`                                             | No component calls `fetch`. Errors → `ApiCallError(status, code, message, details)`                                                                                                                                                                                                                                             |
| `/login?redirect&error`                                                     | `POST /api/auth/sign-in/email`, `POST /api/auth/sign-in/social`               | 401 → "Wrong email or password." (never says which). Google 404 → "isn't set up". `redirect` must be a same-site path (`safeRedirect`)                                                                                                                                                                                          |
| `/forgot-password`                                                          | `POST /api/auth/request-password-reset {email, redirectTo:"/reset-password"}` | Always shows "check your email" (API always 200)                                                                                                                                                                                                                                                                                |
| `/reset-password?token\|error`                                              | `POST /api/auth/reset-password {newPassword, token}`                          | No token / `error` / 400 `INVALID_TOKEN` → "link expired" state. Min 10 chars (`PASSWORD_MIN_LENGTH`)                                                                                                                                                                                                                           |
| `/accept-invitation/$invitationId`                                          | `POST /api/auth/organization/accept-invitation`                               | Matches the API's invite email link. 401 → sign in first; 403 → wrong account; 400/404 → invalid. Invitee first-time sign-up is D6                                                                                                                                                                                              |
| `/leads?page&pageSize&sort&order&q&stage&temperature&createdFrom&createdTo` | `GET /api/leads`                                                              | URL is the state (shareable). Search debounced 300 ms. Phones rendered as received                                                                                                                                                                                                                                              |
| `/dashboard?from&to&sourceId&agentId`                                       | `GET /api/dashboard`                                                          | 403 → "not available for your role" (inline, no toast). 422 (range too long) → inline. D3-I4-02: source options from `/api/settings/sources`, agent options from the agents seen in responses (no agents endpoint yet); avg talk time = connected calls, m:ss; null → "—"; empty range still shows the 11-stage funnel of zeros |

Request/response shapes: `packages/contracts/src/{auth,leads,dashboard}.ts`.

## Error policy (D2-I4-01) — `src/lib/errors.ts`, wired in `src/router.tsx`

| Failure                                         | Action                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| 401 outside auth pages                          | clear cache, go to `/login?redirect=<current>`                          |
| 401 with the dev stub session (`vite dev` only) | toast "Not signed in" — no redirect, so the role switcher keeps working |
| 401 on an auth page                             | nothing global; the form shows it                                       |
| 403 / 0 (offline) / other 4xx                   | toast with the API's message                                            |
| 5xx / unknown                                   | generic toast; internals never shown                                    |

Runs once per final failure (QueryCache/MutationCache `onError`). 4xx are never retried; 5xx/network once.
`meta: { silent: true }` opts a query/mutation out entirely (auth forms show every error inline);
`meta: { handles: [403, 422] }` opts out only for those statuses (dashboard) so 401/5xx still use the policy.
The session probe uses `handles: [401]`: only a 401 means "signed out" — when the API is down the user gets
a toast and stays on the page. Identical toasts are deduped; max 3 visible.

## Tables touched

None (UI only). `packages/contracts/src/auth.ts` added (wire shapes of the Better Auth calls).

## Rules & edge cases

- Masking is server-side (`maskPhone`); the UI never masks or unmasks.
- Counsellors' lead scope = own leads + leads of AI agents allocated to them (API rule).
- URL params are untrusted: invalid values are dropped, not errors (`src/lib/search.ts`).
- Dates show in the tenant's timezone (`me.tenant.timezone`), not the browser's.
- Source / AI agent / counsellor filters (D2-I4-03b): options from ONE query of `GET /api/leads/filters`
  (D2-I4-03a, `leadsFiltersResponse`), scoped like the list (a counsellor sees only themselves and their allocated
  agents). URL params `sourceId`/`agentId`/`counsellorId` (uuids, invalid/duplicate dropped), sent as repeated params.
  Loading → skeleton; empty → disabled "No … yet"; failed → inline retry in the filter, no toast (`meta.silent`).
  Any filter change resets the page. The dashboard still derives agent options from its responses (D3-I4-02);
  switching it to this endpoint is a follow-up.

## Acceptance tests

- D2-I4-01: no component calls `fetch` directly; a failed request shows the global toast; 401 → `/login`.
- D2-I4-02: login works with seeded users; forgot/reset/accept pages are interactive, validated, branded.
- D2-I4-03: real paginated data with sort, filters and debounced search; counsellor phones masked; empty,
  loading, error states; 1440 + 390 px without horizontal overflow.
- D2-I4-04: cards + chart placeholders from `GET /api/dashboard`; loading/empty/error; 1440 + 390 px.
- Own: unit tests for the error policy, API client, auth messages/schemas, URL validators, leads query
  mapping (checked against `leadsListQuery`), dashboard formatting; browser e2e against the local API + seed.

## Out of scope

Lead 360 (D3-I4-01), dashboard aggregates beyond the current endpoint (D3-I4-02), saved views and bulk
actions (D6-I4-04), invitee sign-up (D6), chart library (bars are plain CSS).
