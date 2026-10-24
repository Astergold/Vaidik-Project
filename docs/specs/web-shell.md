# web-shell (D1-I4-02 · D1-I4-03 · D1-I4-04)

## Goal

Stand up `apps/web` as a TanStack Start app that talks only to same-origin `/api/*`, themed entirely from tokens, with a
role-aware app shell and a placeholder route for every page in handbook Appendix B. Later tasks replace placeholders one by one.

## Users & stories

- As a **counsellor** I see only Home (my workspace), Leads, Calls, Visits and System in the sidebar, so I'm not shown pages I can't use.
- As an **admission head / admin / owner** I see the management areas for my role (Settings only for owner/admin).
- As a **super-admin** I see the Platform area and a tenant switcher in the top bar.
- As a **tenant** I see my product name, logo and brand colour everywhere, never "Vernacular AI" hard-coded and never the voice provider's name.
- As a **developer (Day 1)** I can switch the viewed role and the Empty / Loading / Error state of any page, to test and screenshot
  every role and state without a running API.
- As anyone on a **390 px phone** I get a hamburger that opens the sidebar as a drawer; the page never scrolls sideways.

## Endpoints / jobs / pages

Calls (browser → same origin, proxied to `crm-api:3001` by Vite in dev and by Caddy on servers):

| Call                                                   | Used for                      | Day 1 behaviour                                                                                     |
| ------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /api/me` → `meResponse` (`@vernacular/contracts`) | session, role for the sidebar | 200 → real session. Anything else (404/401/5xx/network) **in stub mode** → dev session, no redirect |
| `GET /api/branding`                                    | product name, logo, colour    | not called yet; `BrandingProvider` uses defaults (D6-I1 feeds it)                                   |

**Stub mode** = `vite dev` only (`import.meta.env.DEV`; `VITE_STUB_SESSION=false` turns it off). A production build can never use it: `DEV` is a build-time constant, so the dev session is compiled out. Outside stub mode a failed `/api/me` redirects to `/login`
(other 401s: see `docs/specs/web-day2.md`). The dev session is UI-only: the API enforces every permission,
the role is never trusted for security.

Layouts (chosen in `src/routes/__root.tsx` by pathname):

- **Auth layout** — `/login`, `/forgot-password`, `/reset-password`, `/accept-invitation/$invitationId`: centred branded card, no sidebar/top bar.
- **AppShell** — everything else: sidebar (filtered by role) + top bar (hamburger < 768 px, search placeholder, notifications
  placeholder, tenant switcher for super-admin, dev role switcher in stub mode, user menu).

Pages (Appendix B; registry in `src/lib/sitemap.ts`, one route file each, all render `PlaceholderPage`):

| Area              | Path(s)                                                                                                                                | Roles              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Auth              | `/login` `/forgot-password` `/reset-password` `/accept-invitation/$id`                                                                 | all                |
| Home              | `/` (sends you to the right home) · `/dashboard` (owner, admin, head) · `/workspace` (counsellor)                                      | by role            |
| Leads             | `/leads` · `/leads/$leadId` · `/leads/duplicates`                                                                                      | all tenant roles   |
| Calls             | `/calls` · `/calls/review`                                                                                                             | all tenant roles   |
| Campaigns         | `/campaigns` · `/campaigns/new` · `/campaigns/$campaignId` · `/campaigns/$campaignId/edit`                                             | owner, admin, head |
| Visits & calendar | `/calendar` · `/visits` · `/meetings`                                                                                                  | all tenant roles   |
| Applications      | `/applications` · `/applications/import` · `/applications/unmatched`                                                                   | owner, admin, head |
| AI                | `/ai/agents` · `/ai/planner` · `/ai/compliance`                                                                                        | owner, admin, head |
| Programs          | `/programs` · `/programs/matrix` · `/programs/knowledge-base`                                                                          | owner, admin, head |
| Reports           | `/reports/performance` · `/reports/exports`                                                                                            | owner, admin, head |
| Settings          | `/settings` (general) · `/settings/{policy,stages,branding,domains,team,lead-sources,integrations,whatsapp,email,llm,billing,privacy}` | owner, admin       |
| Platform          | `/platform/tenants` · `/platform/tenants/new` · `/platform/plans` · `/platform/health` · `/platform/audit-log`                         | super-admin        |
| System            | `/notifications` · `/profile` · any unknown URL → 404 · thrown error → error page                                                      | all                |

"Tenant roles" = `ROLES` from contracts (`owner`, `admin`, `admission_head`, `counsellor`). `super_admin` is a UI-only viewer
role (`isPlatformAdmin`, no tenant membership): Platform + System only until impersonation lands (D6).

`PlaceholderPage` shows title, area, what will be built and by which task, links to its child pages (sample ids), and a
state switcher **Empty / Loading / Error** kept in the URL (`?state=loading|error`) so screenshots are linkable.
Visiting a page your role can't use shows a "not available for your role" state (the API still enforces it).

## Theme tokens (D1-I4-03)

- One input variable: `--brand` in `src/styles.css`. `--primary`, `--ring`, `--accent`, sidebar active colours and the logo
  mark are all derived from it (`color-mix(in oklab, …)`; oklch mixing with white drifts the hue). Change `--brand` →
  whole app recolours. Dev preview without editing CSS: `VITE_BRAND_COLOR="oklch(0.55 0.16 150)" pnpm dev`.
- `BrandingProvider` (`src/lib/branding.tsx`) holds `{ productName, logoUrl, brandColor }`, defaults `"Vernacular AI"`, no logo,
  no override. If `brandColor` is set it writes `--brand` on `<html>`; no component contains a colour literal.
- shadcn/ui components live in `src/components/ui` and use only tokens.

## Run

`pnpm dev` (port 3000; `/api` proxied to `API_PROXY_TARGET`, default `http://localhost:3001`). `pnpm build` writes
`dist/client` + `dist/server/server.js` (a fetch handler); `pnpm start` serves both on port 3000 with `srvx` for the
`crm-web` container (Caddy still routes `/api/*` to `crm-api`).

## Tables touched

None. `apps/web` never touches Postgres, R2 or providers; it imports only `@vernacular/contracts`.

## Rules & edge cases

- No `fetch` to anything but relative `/api/...` (`src/lib/api.ts`). No server functions that touch data.
- Session loads client-side only; SSR renders the shell with a loading sidebar (no hydration mismatch). Dev role is kept in
  `localStorage` (read after mount, wrapped in try/catch).
- Sidebar drawer closes on navigation and on Escape; main column is `min-w-0` so long content can't widen the page.
- Never render the voice provider's name; brand text only from `BrandingProvider`.

## Acceptance tests

- D1-I4-02: `apps/web` builds; `grep -riE "pg|kysely|dograh"` over `apps/web` source returns nothing.
- D1-I4-03: changing `--brand` recolours the whole app; no hard-coded brand colour or provider text in `apps/web/src`.
- D1-I4-04: every route renders; shell screenshots at 1440 px and 390 px (no horizontal scroll).
- Own: `src/lib/sitemap.test.ts` — every sitemap page has a route; counsellor sees no Settings/Campaigns; super-admin sees
  Platform only; settings are owner/admin only.

## Out of scope

Real login/forms (D2-I4-02), typed API client + error toast + 401 redirect (D2-I4-01), real page content (later tasks),
`/api/branding` and live branding preview (D6), global search / notifications (D6-I4-04), dark mode, impersonation (D6).
The old console is not in this repo, so D1-I4-02 starts from a clean TanStack Start app rather than a copy; nothing from the
old UI (DB/provider calls) is carried over.

## D1-I4-01 closure (old-app security fix) — closed by replacement

The old console was never copied into this repo (D1-I4-02 started from a clean app), so its unauthenticated
server functions do not exist here. Evidence (2026-10-17, branch `feat/I4-followups-filters-import-campaigns`):

| Check                                                                                                                                                           | Result                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `grep -rnE "listWorkflowOptions\|listCampaigns\|getCampaign\|getCampaignProgress\|listRuns\|getUsageAnalytics\|requireAdminSession\|requireAuthIssue" apps/web` | no matches (exit 1)                                        |
| `grep -rn BETTER_AUTH_URL apps/web` + every `.env*` in the repo                                                                                                 | no matches; `apps/web` has no `.env*` files                |
| `grep -ri "kysely\|from 'pg'\|dograh" apps/web`                                                                                                                 | no matches (exit 1) — also proves D1-I4-02                 |
| `apps/web/src/routes/settings/whatsapp.tsx`                                                                                                                     | a `PlaceholderPage` ("coming soon"); no fake WhatsApp data |

`apps/web` has no server functions at all: the browser only calls same-origin `/api/*` through `src/lib/api.ts`.
**Not verifiable from this repo:** whether the old deployment (Vercel) is still live and still exposes those six
endpoints. Taking it down or patching it is Vaidik's decision.
