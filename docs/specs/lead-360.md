# Lead 360 (D3-I4-01)

## Goal

One page per lead at `/leads/$leadId`: who they are, where they are in the pipeline, everything that happened, and the
three actions a counsellor needs today (change stage, add a note, call now) — all from the lead APIs, policy-aware.

## Users & stories

- As a counsellor I open a lead and see its stage, temperature, next step and history, with phone/email masked, so I can
  pick up the conversation.
- As a counsellor I change the stage with a reason (and a next step if the lead stays open) so the timeline explains why.
- As anyone with access I press **Call now** and, if the call isn't allowed (e.g. outside calling hours), I see why and
  when it can happen instead — nothing is dialled.
- As a manager I can take a lead (assign to me) or unassign it. Counsellors can't reassign.

## Endpoints / pages

| Call                                                               | Use                                     | Notes                                                                                                                                                 |
| ------------------------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/leads/:id` → `leadDetail`                                | header + side panel                     | 404 not in tenant, 403 counsellor not on this lead                                                                                                    |
| `GET /api/leads/:id/timeline?limit=20&cursor` → `timelineResponse` | timeline, newest first                  | `nextCursor` passed back verbatim; "Load more" until `null`                                                                                           |
| `PATCH /api/leads/:id` → `leadDetail`                              | stage (+ reason, next step, due), owner | Response replaces the cached lead. 422 `REASON_REQUIRED` → reason field; 422 `NEXT_STEP_REQUIRED` → next-step field; 403 `ONLY_MANAGERS_CAN_REASSIGN` |
| `POST /api/leads/:id/notes` → 201 `{ id }`                         | add note / outcome                      | Refreshes the timeline                                                                                                                                |
| `POST /api/leads/:id/call-now` → 200 `callNowResponse`             | call now                                | `queued:false` + `rejection` is a **warning on the page**, not an error/toast. 409 `LEAD_CLOSED` is the only error                                    |

## Rules & edge cases

- Identifiers render exactly as received (counsellors get `••••••1234`, `a•••@domain`). Never re-format or unmask.
- Stage change: reason required (≥ 3 chars) client-side and server-side. Moving to an open stage when the lead has no next
  step asks for one. Changing stage sends `subStageId: null` (a sub-stage belongs to one stage; there is no sub-stage list
  endpoint yet, so the sub-stage is shown read-only). Closing stages: enrolled, lost, invalid.
- `lead.stage` is never written client-side: the page shows what PATCH returns.
- Reject codes (`POLICY_REJECT_CODES`) have plain-language text; `retryAt` is shown in the tenant timezone. Unknown codes
  (`lastRejectCode` is a free string) fall back to a generic line plus the code.
- Call events: "Play recording" / "View transcript" appear only when `hasRecording` / `hasTranscript`, and say
  "not available yet" — `/api/calls/:id` and `/recording` don't exist yet (D3-I1-01 / I3). No other endpoints are invented.
- Owner: managers get "Assign to me" / "Unassign" (no member list endpoint yet); counsellors see the owner read-only.
- Dev stub session: `/api/leads/:id` 401s → the page shows its own "sign in to see this lead" state (no redirect loop).

## Acceptance tests

- Header, full timeline and action bar render from the two endpoints; "Load more" pages with `nextCursor`.
- Call now outside the window shows `OUTSIDE_WINDOW` with `retryAt` on the page; no call is placed.
- Stage change without a reason is blocked client-side; a server `REASON_REQUIRED` still shows inline.
- A counsellor sees masked identifiers and no owner control.
- 390 px and 1440 px; loading, empty-timeline, not-found, no-access, error states.
- Unit tests: reject-code rendering, timeline page merging/cursor, stage form validation + 422 mapping.

## Out of scope

Audio player / transcript drawer (needs `/api/calls/:id`), sub-stage picker and full owner picker (need list endpoints),
schedule callback (Day 4 tasks), applications panel (D5; placeholder), WhatsApp tab (D5). The visits &
meetings panel is built by D4-I4-02 (`LeadVisitsPanel`, docs/specs/visits-calendar.md).
