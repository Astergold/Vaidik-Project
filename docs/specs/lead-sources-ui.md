# Settings → Lead sources UI (D3-I4-03, part 1)

API and payload rules: `docs/specs/intake.md`. This file covers the screen.

## Goal

Owners/admins connect a web form or lead provider without a developer: create a source, hand over its URL and
token, map the provider's fields, and dry-run a sample payload. Admission heads can see what's connected.

## Pages / calls

`/settings/lead-sources` — `GET /api/settings/sources` (owner/admin/head); `POST /api/settings/sources`,
`PATCH …/:id`, `POST …/:id/rotate-token`, `POST …/:id/test-mapping` (owner/admin).

## Rules

- **Token shown once.** It exists only in the create/rotate dialog's component state — never in the query cache,
  never refetched (the list only has `hasToken`). The dialog can't be dismissed by clicking outside, and "Done"
  stays disabled until "I've copied the token" is ticked. Rotating warns that the old token stops immediately.
- Copy buttons use the clipboard API; if it's blocked, the text is selected and the user is told to press Ctrl+C.
- **Mapping editor:** one row per field (`full_name, phone, email, city, state, language, program, external_id,
consent`): "From field" (a path; several comma-separated paths are joined with a space) or "Fixed value". Empty
  row = automatic recognition. Consent channels: calls (default) / WhatsApp. Validated with `fieldMapping`.
- **Test payload** runs `test-mapping` with the mapping as currently edited (saved or not). It writes nothing.
- Role gates mirror the API: owner/admin get create/edit/rotate/activate; heads get the list read-only with no
  buttons that would 403; counsellors don't see the page (API 403 → "not available for your role").
- No delete endpoint: "Deactivate" (`isActive: false`) stops intake (the API then rejects the token).
- No program/agent list endpoints yet, so default program / default AI agent aren't editable here.

## Acceptance (verified locally, see the PR)

Create → URL + token once (copy works, gone after Done and after reload); intake with it → 202; rotate → old 401,
new 202; test payload shows the mapped result and the lead count is unchanged; saved mapping applies to real intake;
list matches the tenant's rows in SQL; head read-only; counsellor blocked; empty/loading/error; 1440 + 390 px.

## CSV import (D3-I4-03b) — screen delivered, backend outstanding

**Status:** the wizard UI is built; the server endpoints (D3-I3-03) **do not exist yet**, so acceptance ("a 5,000-row
file with 50 bad rows imports 4,950 and reports 50") **cannot be demonstrated** until they land. Today the upload
answers 404 and the wizard shows "Import service not available yet" — nothing is faked.

**Contract the UI is built against:** `packages/contracts/src/leads-import.ts` (a proposal: the backend implements to
it, or changes it there in the same PR as the UI). Endpoints:

| Call                                 | Body / response                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/leads/imports`            | multipart: `sourceId` + `file` (.csv, ≤ 10 MB, ≤ 50,000 rows) → 201 `createImportResponse` (columns, row count, 5 sample rows, the source's saved mapping) |
| `PUT /api/leads/imports/:id/mapping` | `importMappingBody` (`fieldMapping`, also saved on the source) → `leadImport`                                                                              |
| `GET /api/leads/imports/:id/preview` | → `importPreviewResponse`: first 20 rows mapped + per-row errors (`path` = our field)                                                                      |
| `POST /api/leads/imports/:id/commit` | → 202 `leadImport` (enqueues the job; calling it again after a `failed` job retries)                                                                       |
| `GET /api/leads/imports/:id`         | → `leadImport`: status + counts `{ imported, duplicates, failed, pending }` (polled every 2 s while queued/running)                                        |
| `GET /api/leads/imports/:id/errors`  | → `text/csv` row-error report                                                                                                                              |

Roles: owner/admin (imports create leads). Rows must go through the intake ingest path (`normalizePhone`,
`normalizeEmail`, dedupe, consent) — the browser uploads the raw file and never normalises values.

**Screen:** Settings → Lead sources → _Import CSV_ (`/settings/lead-sources/import`). Steps: Upload (source + .csv;
client checks type, size, empty) → Map columns (row/column counts first, sample rows, the shared `MappingRows` in CSV
mode: a path is one exact column header) → Preview (20 rows, error cells highlighted, problems listed) → Import
(progress bar + counts, error-report download, retry when the job failed). Back/Cancel work from any step; cancel
clears the wizard (there is no delete endpoint; an abandoned server-side upload is the backend's to expire). A 404
"Route not found" from any call → "not available yet"; a 404 for a record (e.g. an expired import) shows as an error.

## Out of scope

Default program/agent pickers (need list endpoints). Deleting sources. "Add to campaign" after import (handbook
option; needs campaigns).
