# Visits, calendar, meetings (D4-I4-02)

## Goal

Counsellors and managers book, reschedule and close campus visits and counsellor meetings, see them on a calendar
(month / week / day; a stacked day agenda on phones), and record what happened — in one place and inside Lead 360.

## Status

**Built against a proposed contract; the backend (D4-I2-04) is pending.** Contract: `packages/contracts/src/visits.ts`.
`campus_visit` and `meeting` don't exist yet: their status values here are proposals and must equal the CHECKs the
Day-4 migration creates (change them here in that PR if I2 differs). `task` already exists and is mirrored exactly
(`open|done|cancelled`, kinds `callback|follow_up|document`). Until the endpoints exist every screen says "not available
yet"; nothing is faked — in particular **slots are never invented client-side**: without `GET /api/visits/slots`,
booking is disabled with an explanation.

## Users & stories

- As a counsellor I book a campus visit for a lead from the available slots, reschedule it, and mark it attended /
  no-show / cancelled with a note.
- As a manager I see every visit on a calendar and filter the list by status, campus, date and who booked it (AI or a
  person).
- As a counsellor I schedule a meeting (phone, video, in person) and record its outcome; my Today tab lists today's
  visits, meetings and tasks.

## Endpoints (proposed)

| Call                                                                                         | Body → response                                                                                                             |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/visits?from&to&status&campus&bookedBy&leadId`                                      | → `visitsListResponse` (dates are tenant-local `YYYY-MM-DD`)                                                                |
| `POST /api/visits`                                                                           | `createVisitBody { leadId, campus, scheduledAt, note? }` → 201 `visit` (server: stage → Visit booked, 24 h + 2 h reminders) |
| `PATCH /api/visits/:id`                                                                      | `patchVisitBody { status?, scheduledAt?, outcomeNote? }` → `visit` (attended → stage Visited)                               |
| `GET /api/visits/slots?campus&from&to`                                                       | → `visitSlotsResponse { slots: isoDateTime[] }` (derived from campus hours and capacity — not a table)                      |
| `GET /api/meetings?from&to&status&leadId` · `POST /api/meetings` · `PATCH /api/meetings/:id` | `meeting` CRUD                                                                                                              |
| `GET /api/tasks?status&dueBefore&mine` · `POST /api/tasks`                                   | `task` (mirrors `crm.task`)                                                                                                 |

## Rules

- The UI never moves a stage: booking / attending are PATCH/POST; the server's stage auto-move and reminders follow
  (the UI says so in the dialogs).
- Per-status actions — visits: `booked`, `rescheduled` → Reschedule · Attended · No-show · Cancel; `attended`,
  `no_show`, `cancelled` → none. Meetings: `scheduled` → Reschedule · Attended · No-show · Cancel; others → none.
  No-show and cancel ask for a note.
- Times are shown and entered in the tenant timezone (`me.tenant.timezone`), never the viewer's.
- The calendar buckets events by tenant-local day; weeks start on Monday. At < 768 px it is a stacked agenda for the
  selected day.
- `bookedBy: ai` shows an "AI" badge; `user` shows who booked it.
- Phones render as received (masked for counsellors by the API).

## Acceptance

Handbook: booking a visit moves the stage to Visit booked and schedules two reminders; marking attended moves it to
Visited (server). UI: list / calendar / meetings / Lead 360 panel with loading, empty, error and not-available states;
filters in the URL; booking from loaded slots; outcomes with notes; 1440 / 390 px.

## Out of scope

Campus/slot administration, reminder message templates (D5), drag-to-reschedule on the calendar.
