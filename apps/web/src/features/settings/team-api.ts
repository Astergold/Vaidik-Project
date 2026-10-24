import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  invitation,
  inviteBody,
  patchMemberBody,
  teamMember,
  teamResponse,
  type InviteBody,
  type Role,
  type TeamMember,
  type TeamResponse,
} from "@vernacular/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { SEAM_META } from "@/lib/seam";

/**
 * Settings → Team (D6-I4-02) against the PROPOSED contract (packages/contracts/src/team.ts). Not built yet:
 * "Route not found" → "not available yet". The cache takes the server's member/invitation; seat counts are refetched.
 */
export const teamKey = ["settings", "team"] as const;

export const useTeam = () =>
  useQuery({
    queryKey: teamKey,
    queryFn: () => apiGet("/api/settings/team", teamResponse),
    retry: false,
    meta: SEAM_META,
  });

export function useTeamMutations() {
  const qc = useQueryClient();
  const patch = (fn: (t: TeamResponse) => TeamResponse) =>
    qc.setQueryData<TeamResponse>(teamKey, (old) => (old ? fn(old) : old));
  const storeMember = (m: TeamMember) =>
    patch((t) => ({ ...t, members: t.members.map((x) => (x.userId === m.userId ? m : x)) }));
  const refreshSeats = () => void qc.invalidateQueries({ queryKey: teamKey });
  return {
    invite: useMutation({
      mutationFn: (b: InviteBody) =>
        apiPost("/api/settings/team/invitations", inviteBody.parse(b), invitation),
      meta: SEAM_META,
      onSuccess: (inv) => {
        patch((t) => ({ ...t, invitations: [inv, ...t.invitations] }));
        refreshSeats();
      },
    }),
    cancelInvite: useMutation({
      mutationFn: (id: string) => apiDelete(`/api/settings/team/invitations/${id}`),
      meta: SEAM_META,
      onSuccess: (_v, id) => {
        patch((t) => ({ ...t, invitations: t.invitations.filter((i) => i.id !== id) }));
        refreshSeats();
      },
    }),
    setRole: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
        apiPatch(
          `/api/settings/team/members/${userId}`,
          patchMemberBody.parse({ role }),
          teamMember,
        ),
      meta: SEAM_META,
      onSuccess: storeMember,
    }),
    setActive: useMutation({
      mutationFn: ({ userId, active }: { userId: string; active: boolean }) =>
        apiPost(
          `/api/settings/team/members/${userId}/${active ? "reactivate" : "deactivate"}`,
          {},
          teamMember,
        ),
      meta: SEAM_META,
      onSuccess: (m) => {
        storeMember(m);
        refreshSeats();
      },
    }),
  };
}
