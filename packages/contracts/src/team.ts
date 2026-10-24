import { z } from "zod";
import { idRef, isoDateTime } from "./common.js";
import { role } from "./enums.js";

/**
 * Team management (D6-I4-02 UI ↔ D6-I3-03). PROPOSED CONTRACT — endpoints not built yet. Spec: docs/specs/settings-ui.md.
 * Roles: owner/admin (only an owner can grant or remove `owner`). Every change is audit-logged. Counsellor ↔ AI agent
 * allocation uses the D4 agents contract: PUT /api/agents/:id/counsellors.
 *
 *   GET    /api/settings/team                                  → teamResponse
 *   POST   /api/settings/team/invitations                      inviteBody → 201 invitation (409 SEAT_LIMIT | ALREADY_MEMBER)
 *   DELETE /api/settings/team/invitations/:id                  → 204
 *   PATCH  /api/settings/team/members/:userId                  patchMemberBody → teamMember (409 LAST_OWNER)
 *   POST   /api/settings/team/members/:userId/deactivate       {} → teamMember (409 LAST_OWNER)
 *   POST   /api/settings/team/members/:userId/reactivate       {} → teamMember (409 SEAT_LIMIT)
 */

export const teamMember = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  role,
  status: z.enum(["active", "deactivated"]),
  lastActiveAt: isoDateTime.nullable(),
  /** Counsellors: the AI agents whose leads they own. */
  allocatedAgents: z.array(idRef),
  joinedAt: isoDateTime,
});
export type TeamMember = z.infer<typeof teamMember>;

export const invitation = z.object({
  id: z.string(),
  email: z.string(),
  role,
  invitedBy: z.string().nullable(),
  invitedAt: isoDateTime,
  expiresAt: isoDateTime,
});
export type Invitation = z.infer<typeof invitation>;

export const teamResponse = z.object({
  members: z.array(teamMember),
  invitations: z.array(invitation),
  /** Active members + pending invitations vs the plan's seat limit (null = unlimited). */
  seats: z.object({ used: z.number().int().min(0), limit: z.number().int().min(1).nullable() }),
});
export type TeamResponse = z.infer<typeof teamResponse>;

export const inviteBody = z.object({
  email: z.email("Enter a valid email address").transform((e) => e.trim().toLowerCase()),
  role,
});
export type InviteBody = z.input<typeof inviteBody>;

export const patchMemberBody = z.object({ role });
