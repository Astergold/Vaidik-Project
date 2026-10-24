import { z } from "zod";
import { isoDateTime } from "./common.js";
import { coreStage } from "./enums.js";

/**
 * Global search + in-app notifications (D6-I4-04a UI ↔ D6-I2-05 search, D6-I1-03 notifications).
 * PROPOSED CONTRACT — endpoints not built yet. Spec: docs/specs/search-notifications.md. All tenant roles
 * (search is scoped like the leads list: counsellors only find their own leads; phones masked server-side).
 *
 *   GET  /api/search                         ?q (2–100 chars) → searchResponse            (Appendix A: GET /search)
 *   GET  /api/notifications                  ?unread&cursor&limit → notificationsResponse (NOT in Appendix A — proposed)
 *   POST /api/notifications/:id/read         {} → notification                            (proposed)
 *   POST /api/notifications/read-all         {} → { unreadCount: 0 }                      (proposed)
 */

export const SEARCH_MATCHES = ["name", "phone", "email", "application_no"] as const;

export const searchResult = z.object({
  leadId: z.uuid(),
  name: z.string().nullable(),
  /** Masked for counsellors by the server; render as received. */
  phone: z.string().nullable(),
  email: z.string().nullable(),
  applicationNo: z.string().nullable(),
  stage: coreStage,
  program: z.string().nullable(),
  /** Which field matched, so the palette can say why a row is there. */
  matched: z.enum(SEARCH_MATCHES),
});
export type SearchResult = z.infer<typeof searchResult>;

export const searchResponse = z.object({ results: z.array(searchResult).max(20) });
export type SearchResponse = z.infer<typeof searchResponse>;

/** Known kinds get an icon/label in the UI; the server may send others (shown generically). */
export const NOTIFICATION_KINDS = [
  "sla_breach",
  "needs_counsellor",
  "review_call",
  "visit_booked",
  "low_balance",
  "wallet_empty",
  "import_finished",
  "webhook_disabled",
  "planner_approval",
] as const;

export const notification = z.object({
  id: z.uuid(),
  kind: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  /** Same-site app path to open (e.g. "/leads/…"); never an absolute URL. */
  link: z.string().nullable(),
  createdAt: isoDateTime,
  readAt: isoDateTime.nullable(),
});
export type Notification = z.infer<typeof notification>;

export const notificationsResponse = z.object({
  items: z.array(notification),
  unreadCount: z.number().int().min(0),
  nextCursor: z.string().nullable(),
});
export type NotificationsResponse = z.infer<typeof notificationsResponse>;

export const readAllResponse = z.object({ unreadCount: z.literal(0) });
