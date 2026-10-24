# Reports & seat matrix (D6-I4-04d)

## Goal

Managers see how each counsellor is doing, pull CSVs of leads/calls/applications, and see every program's seat bucket
and next deadlines on one grid (flipping a bucket inline).

## Status

- `/reports/performance`, `/reports/exports`: **built against a proposed contract** (`packages/contracts/src/reports.ts`);
  the endpoints don't exist and are **not in Appendix A**. Pages show "Reports service not available yet" on 404.
- `/programs/matrix`: **no new endpoint** — reuses the D4 programs contract (`GET /api/programs`,
  `PUT /api/programs/:id/seat`), also not built yet; shows "Programs service not available yet" on 404.
- Nothing is faked.

## Users & stories

- As an admission head I compare counsellors for "last 30 days": calls reviewed (and overrides), queue items resolved,
  SLA breaches, visits booked/attended, conversions, median response time.
- As an admin I request "Applications, this month" as CSV, watch it go queued → ready, and download it before it expires.
- As an admin I see all programs × this academic year's seat bucket and upcoming deadlines, and switch B.Des to
  "Limited" inline; heads see the same grid read-only.

## Endpoints (proposed)

| Call                                              | Body / response                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/reports/performance?from&to`            | → `performanceResponse` (`rows[]` per counsellor)                      |
| `GET /api/reports/exports`                        | → `exportsResponse` (polled every 5 s while any job is queued/running) |
| `POST /api/reports/exports`                       | `{ kind, from?, to? }` → 202 `exportJob`                               |
| `GET /api/reports/exports/:id/file`               | → CSV via `apiGetBlob`                                                 |
| `GET /api/programs`, `PUT /api/programs/:id/seat` | D4 programs contract                                                   |

## Rules & edge cases

- Seat availability is categorical only (open / limited / closed) — never counts (handbook §7.4).
- Matrix year = the current academic year ("2026-27" from today in the tenant timezone, June start); bucket "—" when
  unset. Only owner/admin can change it (heads read-only), and the cell shows what the server returned.
- Dates tenant-local; performance defaults to the last 30 days.

## Acceptance (once the API exists)

Handbook D6-I4-04: counsellor performance view, program seat/deadline matrix, exports; e2e smoke per page.

## Out of scope

Custom report builder, scheduled exports, charts beyond the table.
