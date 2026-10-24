# E2E journeys & screenshot sweep (D7-I4-01, D7-I4-02)

## Goal

One browser harness (Playwright, installed Chrome) that (1) sweeps every Appendix-B page at 1440 px and 390 px for
horizontal overflow, missing states and provider-name leaks, and (2) walks each role's journey against the real API.

## Status

- **Harness:** `@playwright/test` (root devDependency), `playwright.config.ts`, `pnpm test:e2e`. Marked
  `TODO(D3-I1-02)`: I1's harness (compose stack + CI job) supersedes it; the root `package.json` script and the config
  are the only merge points. **Not run in CI** (`pnpm test` is vitest only; `.github/workflows/ci.yml` belongs to I2 and
  is untouched) — so "all green in CI" is the one D7-I4-01 acceptance item that needs Vaidik's call.
- **Type-checked:** `tests/e2e/tsconfig.json` (`pnpm typecheck:e2e`), chained into the root `pnpm typecheck` that CI
  runs. The generated route tree is mapped to `tests/e2e/types/route-tree.d.ts` so the check doesn't pull the whole web
  app (and its Vite-only types) into the program.
- **Sweep (D7-I4-02):** complete; no backend needed.
- **Journeys (D7-I4-01):** real for every step whose API exists (auth redirect, sidebars per role, dashboard, leads
  list + filter + masking, Lead 360 note, policy save/restore, lead sources). Steps waiting for an API are
  `test.fixme("… needs <module> (<task>)")` — a visible checklist, never a green tick for a "not available yet" page.

## How to run

```
pnpm test:e2e --project=sweep        # no backend; screenshots → artifacts/screenshots/D7-I4-02/
pnpm db:up && pnpm db:migrate && pnpm jobs:install && pnpm db:seed && pnpm dev
pnpm test:e2e --project=journeys     # needs the API on :3001 and SEED_PASSWORD (.env)
```

Two dev servers: `:3000` (stub session — role from `localStorage["vernacular.devRole"]`) for the sweep, `:3100`
(`VITE_STUB_SESSION=false`, real sign-in) for the journeys. Both are reused when already running. Journeys skip with
the reason when the API or the seed password is missing.

## Sweep rules

- Pages come from `PAGES` in `apps/web/src/lib/sitemap.ts` (the sweep can't drift from the sitemap); each page is
  opened with a role that may see it; `$param` pages use `sampleHref`.
- Three states per page and width, produced by **test-only** request interception (`tests/e2e/fixtures/stub.ts`) —
  the app never receives fake data: `missing` (404 "Route not found" → the seam), `loading` (requests held),
  `error` (500). `/api/me` answers 401 so the stub session applies.
- Stability: each page is measured after `settle()` (load event + stable URL, for client redirects), and DOM reads are
  retried when a navigation or dev-server reload replaces the page (`retryOnNavigation`). Each project writes to its
  own `test-results/<project>`; the sweep runs with traces off (they only produced teardown noise).
- Assertions: `documentElement` and `<main>` don't scroll sideways (≤ 1 px), no provider name in the HTML, no
  placeholder page. Screenshots: `artifacts/screenshots/D7-I4-02/NN-<pageId>-<state>-<width>.png` (gitignored, per the
  repo's D1–D4 convention; attach to the PR / sign-off). No screenshots are committed.

## Journeys (fixme = waiting for the API)

| Role           | Real                                                                                 | fixme                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Everyone       | signed out → `/login?redirect=…`                                                     | —                                                                                                                                   |
| Admin (owner)  | dashboard home, Settings in sidebar, policy change persists + restored, lead sources | agent create (D4-I2), campaign create/start (D3-I3-04)                                                                              |
| Admission head | dashboard, leads list + stage filter in URL                                          | bulk assign (D6-I2-05), planner approval (D6-I2-03/04), fee paid (D5-I1-01)                                                         |
| Counsellor     | workspace home, phones masked by the server, Lead 360 note on timeline               | queue (D4-I2), call review (D4-I2-03), visit booking (D4-I2)                                                                        |
| Super-admin    | — (blocked, see Findings)                                                            | landing on Platform → Tenants (needs a platform-level session), create tenant (D6-I3-01), impersonate (D6-I3-02), top-up (D6-I2-01) |

## Findings (2026-10-17 runs)

- **Credentials in the URL (fixed):** on a cold dev server the login form was submitted before hydration and the
  browser fell back to GET, putting email + password in the URL. Every form that renders a password field now
  declares `method="post"`; `apps/web/src/lib/forms-method.test.ts` keeps it that way. Journeys wait for network idle.
- **No session for super-admins (open, I2):** `GET /api/me` answers `403 NO_TENANT_CONTEXT` for the platform admin
  (no tenant membership), so the console can't get a session in a real deployment (dev falls back to the stub).
  Needs a platform-level "me" (or `/api/me` without a tenant for platform admins). Journey marked `fixme`.
- **Only one trusted origin:** Better Auth trusts `PUBLIC_BASE_URL` only, so sign-in journeys run on `:3000`; the
  signed-out check runs on the no-stub `:3100` server (no sign-in there).
- **Policy page polish (fixed):** the holiday list now shows compact inline states instead of a nested full card.

Last full run (`pnpm test:e2e`, after the stability fixes): 307 passed (sweep 300/300 — 50 pages × 2 widths × 3
states, 0 px overflow — plus 7 journey steps), 12 fixme, 0 failed, no teardown errors.

## Out of scope

Compose stack, CI job and cross-browser runs (D3-I1-02); load tests (k6, D7-I1-01).
