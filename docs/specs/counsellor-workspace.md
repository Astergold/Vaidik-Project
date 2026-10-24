# Counsellor workspace + call review (D4-I4-01)

## Goal

A counsellor's home at `/workspace`: everything that needs them today, and an in-page side panel to review calls
(recording, transcript with the AI's quotes highlighted, verify / override) and resolve queue items, so they can clear
ten items without leaving the page. The same panel powers `/calls/review`.

## Status

**Built against a proposed contract; the backend (D4-I2-03 queues/review, D3-I1-01 recording) is pending.** Contracts:
`packages/contracts/src/queue.ts`, `packages/contracts/src/call-review.ts`. If I2 prefers other paths (e.g.
`/api/reviews/:callId/...`) they change the contract here in the same PR. Until then every queue/review call answers
`404 Route not found` and the UI says "not available yet" — no data is faked. **My leads** (real `GET /api/leads`) and
**follow-ups due today** (real) work now. Visits, meetings and tasks join the Today tab with D4-I4-02.

## Users & stories

- As a counsellor I open my workspace and see four tabs: Needs counsellor, Review calls, My leads, Today.
- As a counsellor I open a call, listen, read the transcript with the AI's evidence highlighted, and either verify the
  AI's label or override it with a reason — then the next item opens automatically.
- As a counsellor I resolve a "needs counsellor" item by booking a callback / visit / meeting (or noting it was
  handled) with a note.

## Endpoints (proposed)

| Call                                      | Body → response                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /api/queue?kind&status&limit&cursor` | → `queueListResponse { items, nextCursor }`; unknown `kind` → 422. Counsellors get their own items, managers all |
| `POST /api/queue/:id/claim`               | `{}` → `queueItem` (status `claimed`)                                                                            |
| `POST /api/queue/:id/resolve`             | `resolveQueueBody { outcome, note, followUpAt? }` → `queueItem` (status `resolved`)                              |
| `GET /api/calls/:id`                      | → `callReview` (call + transcript + analysis + review state)                                                     |
| `GET /api/calls/:id/recording`            | 302 → short-lived signed URL (range requests / seeking); writes `recording_access_log`                           |
| `POST /api/calls/:id/review/verify`       | `{}` → `callReview`                                                                                              |
| `POST /api/calls/:id/review/override`     | `overrideReviewBody { temperature, nextStep?, nextStepDueAt?, reason ≥ 3 }` → `callReview`                       |

Verify/override also resolve that call's open `review_call` queue item (server side).

## Tables touched (by the backend)

`counsellor_queue_item` (status `open|claimed|resolved|dismissed`, `outcome`, `resolved_at`), `analysis` (read),
`call_attempt` (read: `transcript_text`, `recording_key`), `recording_access_log` (insert),
`lead_temperature_observation` (insert).

## Rules & edge cases

- **Verify / override never write `lead.current_temperature`** (AGENTS.md: trigger-written cache). Verify inserts a
  `lead_temperature_observation` (source `counsellor`, value = the AI value, `call_attempt_id`); override inserts one
  with the new value, `reason` and `observer_user_id`. The DB trigger updates the lead. The UI sends neither.
- **Quote highlighting** uses the DB's rule (`crm.norm_ws`): case-sensitive exact substring after collapsing
  whitespace (`\s+` → one space, trimmed). The first occurrence is highlighted; overlapping quotes merge; a quote that
  isn't found is listed as "quote not found in transcript" and never breaks the page. Text is rendered as React text
  (never `dangerouslySetInnerHTML`).
- Phones render exactly as the API sends them (masked for counsellors server-side).
- Audio: `<audio controls preload="none" src="/api/calls/:id/recording">` (the browser follows the 302 and does range
  requests). No recording → "Recording not available yet".
- After verify / override / resolve: invalidate `["queue"]`, `["call", id]`, `["lead", leadId]` and open the next open
  item in place — no route change.
- Roles: `/workspace` is counsellor-only (sitemap); `/calls/review` is for all tenant roles.

## Acceptance tests

Handbook D4-I4-01: a counsellor can clear 10 review items without leaving the page; works at 390 px. Own:
`highlight.test.ts`, `ReviewPanel.test.tsx`, `WorkspacePage.test.tsx` (tabs and their states, phone as received,
10 items cleared with the panel mounted and the route unchanged), structural width checks + 1440/390 screenshots.

## Out of scope

Transcript editing, bulk review, SLA breach handling UI beyond listing (`sla_breach` items show in Needs counsellor),
the extraction-rules settings page (no Appendix B row).
