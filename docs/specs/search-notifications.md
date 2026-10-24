# Search & notifications (D6-I4-04a)

## Goal

Find any student in two keystrokes from anywhere (⌘K / Ctrl+K) and never miss what needs attention: a bell with an
unread count, a notifications page, and mark-as-read.

## Status

**Built against a proposed contract; the search API (D6-I2-05) and notification API (D6-I1-03) don't exist yet.** The
palette still jumps to **pages** (from `sitemap.ts`, filtered by role — no data involved) and says "Lead search isn't
available yet" for people; the bell shows no badge and `/notifications` shows "Notifications service not available
yet". Nothing is faked. Contract: `packages/contracts/src/search.ts`. `GET /api/search` is Appendix A's `/search`;
the notification endpoints are **not in Appendix A** (proposed).

## Users & stories

- As a counsellor I press Ctrl+K, type "4321" and open the lead whose phone ends in 4321 (only my leads appear).
- As an admin I type "APP-12" and land on that applicant's Lead 360; I type "camp" and jump to Campaigns.
- As anyone I see a red count on the bell, open Notifications, click one to go to the lead, and mark all read.

## Endpoints (proposed)

| Call                                         | Response                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/search?q=`                         | `searchResponse` (≤ 20 results: lead, name, phone as received, email, application no., stage, which field matched) |
| `GET /api/notifications?unread&cursor&limit` | `notificationsResponse` (`items`, `unreadCount`, `nextCursor`)                                                     |
| `POST /api/notifications/:id/read`           | `notification`                                                                                                     |
| `POST /api/notifications/read-all`           | `{ unreadCount: 0 }`                                                                                               |

## Rules & edge cases

- Palette: opens on ⌘K/Ctrl+K (and the top-bar search button, incl. phones), closes on Esc; ↑/↓ move, Enter opens.
  Search starts at 2 characters, debounced 250 ms; results come only from the server. Page shortcuts come from the
  sitemap for the viewer's role.
- Notification links are opened only if they are same-site paths (`safeRedirect`); anything else is ignored.
- Bell count polls every 60 s while the tab is visible; on any error the badge is simply hidden.
- Mark read shows the server's notification; nothing optimistic.

## Acceptance (once the API exists)

Handbook D6-I4-04: global search, notifications bell; each page has an e2e smoke test (D7-I4-01).

## Out of scope

Notification preferences/email digests (D6-I1-03), searching beyond leads (calls, visits).
