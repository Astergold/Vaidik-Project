# Planner approvals, compliance report, calls log (D6-I4-04e)

## Goal

Managers stay in control of AI re-engagement (auto-run or approve each proposal, with the planner's rationale and any
policy rejection), see the nightly compliance audit, and everyone can browse their calls with outcome and recording.

## Status

**Built against a proposed contract; none of these endpoints exist yet.** Each page shows "… service not available yet"
on `404 Route not found`. Nothing is faked. Contract: `packages/contracts/src/planner.ts`. `GET /api/admin/
compliance-report` and `GET /api/calls` are in Appendix A; `/api/planner/proposals*` and `/api/settings/planner` are
**not** (proposed). Recordings play through `<audio src="/api/calls/:id/recording">` (the browser follows the 302 to
the signed URL; no blob download).

## Users & stories

- As an owner I switch the planner from "Run automatically" to "Admission head approves each action".
- As an admission head I see pending proposals (lead, action, when, rationale), approve them one by one or in bulk,
  or reject with a reason; rejected-by-policy ones show the typed code (e.g. `OUTSIDE_WINDOW`) with its explanation.
- As an owner I open the compliance report: a green "0 violations" when clean, else each call outside the window,
  without consent, to a suppressed number or over the caps.
- As a counsellor I list my calls, filter by status/outcome/date, play a recording and open the lead.

## Endpoints (proposed)

| Call                                                         | Body / response                                   |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `GET /api/planner/proposals?status&approval&cursor`          | → `proposalsResponse` (`pendingApproval` count)   |
| `POST /api/planner/proposals/:id/approve` · `/reject`        | `{}` · `{ reason }` → `proposal`                  |
| `GET/PUT /api/settings/planner`                              | `{ mode: auto \| approval }` → `plannerSettings`  |
| `GET /api/admin/compliance-report?date`                      | → `complianceReport`                              |
| `GET /api/calls?status&disposition&agentId&from&to&q&cursor` | → `callsResponse` (`dispositions` for the filter) |

## Rules & edge cases

- Roles: planner page + compliance = owner/admin/admission_head (sitemap); the mode switch is owner/admin (heads see it
  read-only); approve/reject = managers. Calls = all tenant roles, scoped by the server.
- Bulk approve = one request per proposal, in sequence; each row shows the server's result.
- Reject codes are shown with `describeRejection` (the same copy as Lead 360); unknown codes stay readable.
- Phones as received; no provider names, ids or URLs anywhere (recordings via our API only).

## Acceptance (once the API exists)

Handbook D6-I2-03/04: proposals visible with rationale; rejected ones show the policy code; with approval on nothing
is sent until approved. D6-I1-04: seeded violation appears in tomorrow's report. Checkpoint 6 #6: a proposal outside
the window shows `OUTSIDE_WINDOW`.

## Out of scope

Editing a proposal, planner prompt tuning, call transcript editing (review stays at `/calls/review`).
