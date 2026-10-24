import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  plannerSettings,
  proposal,
  proposalsResponse,
  putPlannerSettingsBody,
  rejectProposalBody,
  type PlannerSettings,
} from "@vernacular/contracts";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { SEAM_META } from "@/lib/seam";

/**
 * Planner approvals (D6-I4-04e) against the PROPOSED contract (packages/contracts/src/planner.ts). After a decision the
 * lists are refetched, so every row shows the server's state.
 */
export const plannerKeys = {
  all: ["planner"] as const,
  list: (tab: string) => ["planner", "proposals", tab] as const,
  settings: ["settings", "planner"] as const,
};

export const useProposals = (tab: "pending" | "all") =>
  useInfiniteQuery({
    queryKey: plannerKeys.list(tab),
    queryFn: ({ pageParam }) =>
      apiGet("/api/planner/proposals", proposalsResponse, {
        approval: tab === "pending" ? "pending" : undefined,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
    meta: SEAM_META,
  });

export function useDecide() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: plannerKeys.all });
  return {
    approve: useMutation({
      mutationFn: (id: string) => apiPost(`/api/planner/proposals/${id}/approve`, {}, proposal),
      meta: SEAM_META,
      onSuccess: refresh,
    }),
    reject: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) =>
        apiPost(
          `/api/planner/proposals/${id}/reject`,
          rejectProposalBody.parse({ reason }),
          proposal,
        ),
      meta: SEAM_META,
      onSuccess: refresh,
    }),
  };
}

/** Bulk approve: one request per proposal, in order; stops at the first failure and reports it. */
export function useBulkApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      let approved = 0;
      for (const id of ids) {
        await apiPost(`/api/planner/proposals/${id}/approve`, {}, proposal);
        approved += 1;
      }
      return approved;
    },
    meta: SEAM_META,
    onSettled: () => void qc.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}

export const usePlannerSettings = () =>
  useQuery({
    queryKey: plannerKeys.settings,
    queryFn: () => apiGet("/api/settings/planner", plannerSettings),
    retry: false,
    meta: SEAM_META,
  });

export function useSavePlannerSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: PlannerSettings["mode"]) =>
      apiPut("/api/settings/planner", putPlannerSettingsBody.parse({ mode }), plannerSettings),
    meta: SEAM_META,
    onSuccess: (s) => qc.setQueryData(plannerKeys.settings, s),
  });
}
