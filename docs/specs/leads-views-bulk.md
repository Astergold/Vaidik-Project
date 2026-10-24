# Leads: saved views & bulk actions (D6-I4-04b)

## Goal

Managers stop rebuilding the same filters and stop editing leads one by one: save a filter set as a personal or shared
view, select rows (or everything matching), and assign, change stage (with a reason), add to a campaign or export.

## Status

**Built against a proposed contract; saved views and `POST /api/leads/bulk` (D6-I2-05) don't exist yet.** The Leads
list itself is live (`GET /api/leads`). The views menu shows "Saved views aren't available yet" and bulk actions say
"Bulk actions aren't available yet" on `404 Route not found`. Nothing is faked. Contract:
`packages/contracts/src/leads-bulk.ts`. `POST /api/leads/bulk` is in Appendix A; saved views are **not** (proposed).
Assignee options come from the live `GET /api/leads/filters`; campaign options from the proposed `GET /api/campaigns`.

## Users & stories

- As an admission head I filter "Interested, Website, this week", save it as a shared view "Hot website leads", and my
  team picks it from the Views menu.
- As an admin I tick 40 rows and assign them to Chitra; or select all 214 matching the filter and assign in one action.
- As an admission head I move selected leads to Lost with the reason "Joined another college"; the server records the
  reason on every lead and skips any it can't move (shown afterwards).
- As a manager I add selected leads to a draft campaign, or export them (the file appears under Reports → Exports).

## Endpoints (proposed)

| Call                                          | Body / response                                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/saved-views?entity=lead`            | → `savedViewsResponse` (mine + shared, `isMine`)                                                                                                                               |
| `POST /api/saved-views`                       | `createSavedViewBody` → `savedView`                                                                                                                                            |
| `PATCH /api/saved-views/:id` · `DELETE …/:id` | `patchSavedViewBody` → `savedView` · 204                                                                                                                                       |
| `POST /api/leads/bulk`                        | `bulkLeadsBody` (`assign` / `stage` + reason / `add_to_campaign` / `export`; target = ids or filter + expectedCount) → `bulkLeadsResult` (`affected`, `skipped[]`, `exportId`) |

## Rules & edge cases

- Roles: views for every tenant role (shared ones created by managers); selection and bulk only for owner/admin/
  admission_head (handbook §7.5). Counsellors see no checkboxes.
- Applying a view replaces the URL filters (the URL stays the source of truth); "Save view" stores the current filters
  without page.
- Selection is cleared whenever the filters or page change. "Select all N matching" switches the target to the filter
  with `expectedCount`; the server refuses if the count drifted.
- Stage change requires a reason; the UI never writes `lead.stage` — the server uses `moveStage(mode: "manual")`.
- After a bulk action the list is refetched and the server's `affected`/`skipped` are shown.

## Acceptance (once the API exists)

Handbook D6-I2-05: bulk-assign 200 leads in one action; logged. D6-I4-04: saved views and bulk action bar on Leads.

## Out of scope

Bulk delete, bulk WhatsApp, editing other people's personal views.
