# Applications UI (D5-I4-01)

## Goal

Admission heads see who filled the form and who paid the fee, from a filterable list and on every Lead 360. Admins
import the admissions portal's export (CSV) and resolve rows we couldn't match to a lead. The UI never matches or
changes stages itself: the server matches (application no. → phone → email) and auto-advances stages (D5-I1-02).

## Status

**Screens built against a proposed contract; the applications API (D5-I1-01) does not exist yet**, so nothing can be
demonstrated end to end. Every screen shows "Applications service not available yet" when the API answers
`404 Route not found`. No data is faked. Contract: `packages/contracts/src/applications.ts` — the backend implements
to it or changes it there in the same PR as the UI. Live today: the lead picker on the unmatched list searches with the
real `GET /api/leads?q=`.

## Users & stories

- As an admission head I open **Applications** and press **Fee paid** — I see everyone who has paid (two clicks).
- As an admission head I filter by status, program, paid/unpaid and date, and search by application no. or name.
- As anyone working a lead I see its applications on Lead 360: status chip, application no., fee, paid date, source.
- As an admin I upload the portal export, map its columns once (saved for next time), preview 20 rows with how each
  would match, import, and download the error report.
- As an admin I link an unmatched row to the right lead, or dismiss it.

## Endpoints (proposed)

| Call                                       | Body / response                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `GET /api/applications`                    | `applicationsQuery` → `applicationsListResponse` (`items`, `nextCursor`, `total`) |
| `POST /api/applications/import`            | multipart `file` → 201 `createApplicationImportResponse`                          |
| `PUT /api/applications/import/:id/mapping` | `applicationImportMappingBody` → `applicationImport`                              |
| `GET /api/applications/import/:id/preview` | → `applicationImportPreviewResponse` (20 rows, each with `match`)                 |
| `POST /api/applications/import/:id/commit` | `{}` → 202 `applicationImport`                                                    |
| `GET /api/applications/import/:id`         | → `applicationImport` (polled every 2 s while queued/running)                     |
| `GET /api/applications/import/:id/errors`  | → `text/csv`                                                                      |
| `GET /api/applications/unmatched`          | → `unmatchedListResponse`                                                         |
| `POST /api/applications/:id/link`          | `{ leadId }` → `application`; 409 `ALREADY_LINKED`                                |
| `POST /api/applications/:id/dismiss`       | `{ reason? }` → `{ id, dismissed: true }`                                         |

Roles: owner/admin/admission_head. `GET /api/applications?leadId=` is allowed for any role with access to that lead
(the Lead 360 panel; counsellors only their own leads, enforced by `assertLeadAccess`).

Shapes: `status` = `not_started | form_started | form_submitted | fee_paid | admitted | enrolled | withdrawn` (local to
`applications.ts` until the API ships). `feeAmount` whole rupees; `paidAt` UTC, shown in the tenant timezone; `phone`
arrives masked for counsellors and is rendered as received.

## Tables touched

None by the UI. Backend: `application` (`lead_id`, `external_application_no`, `status`, `fee_amount`, `paid_at`, `source`).

## Pages

- `/applications` — filters (status, program, paid/unpaid chips, date range, search) kept in the URL, so a filtered
  view is linkable and survives reload. Table: lead, application no., program, status chip, fee, paid on, source,
  updated. "Load more" via `nextCursor`. Program options come from `GET /api/programs` (proposed, D4-I4-03).
- `/applications/import` — the shared CSV wizard (`features/csv-import`): upload → map columns → preview → import →
  error report. Same reducer and steps as lead CSV import.
- `/applications/unmatched` — rows with reason; **Link to lead** opens a picker that searches real leads; **Dismiss**
  asks for an optional reason. The row disappears only after the server confirms.
- Lead 360 → Applications panel replaces the placeholder.

## Rules & edge cases

- Never optimistic: list and panel show what the server returned after each action.
- Client validation mirrors the API: mapping needs the status column and one of application no./phone/email.
- 404 "Route not found" → "not available yet"; 403 → "not available for your role"; other errors inline with retry.
- No horizontal page scroll at 390 px: tables scroll inside their own container.

## Acceptance (once the API exists)

Handbook D5-I4-01: admission head can see who has paid in two clicks. D5-I1-01: uploading MIT-ADT's sample export
updates statuses; unmatched rows listed.

## Out of scope

Editing an application by hand, the `/v1/applications` API (D5-I2-02), the portal webhook, stage changes (server).
