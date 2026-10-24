import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  application,
  applicationsListResponse,
  dismissApplicationBody,
  dismissApplicationResponse,
  linkApplicationBody,
  unmatchedListResponse,
  type UnmatchedListResponse,
} from "@vernacular/contracts";
import { apiGet, apiPost, type QueryValue } from "@/lib/api";
import { SEAM_META } from "@/lib/seam";

/**
 * Applications (D5-I4-01) against the PROPOSED contract (packages/contracts/src/applications.ts). Not built yet:
 * a "Route not found" 404 is shown as "not available yet". Nothing is cached optimistically.
 */
export const applicationKeys = {
  all: ["applications"] as const,
  list: (q: Record<string, QueryValue>) => ["applications", "list", q] as const,
  lead: (leadId: string) => ["applications", "lead", leadId] as const,
  unmatched: ["applications", "unmatched"] as const,
};

/** Cursor pages: "Load more" fetches the next one. */
export const useApplications = (query: Record<string, QueryValue>) =>
  useInfiniteQuery({
    queryKey: applicationKeys.list(query),
    queryFn: ({ pageParam }) =>
      apiGet("/api/applications", applicationsListResponse, { ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
    meta: SEAM_META,
  });

/** Lead 360 panel: the same endpoint scoped to one lead. */
export const useLeadApplications = (leadId: string) =>
  useQuery({
    queryKey: applicationKeys.lead(leadId),
    queryFn: () => apiGet("/api/applications", applicationsListResponse, { leadId, limit: 20 }),
    retry: false,
    meta: SEAM_META,
  });

export const useUnmatched = () =>
  useInfiniteQuery({
    queryKey: applicationKeys.unmatched,
    queryFn: ({ pageParam }) =>
      apiGet("/api/applications/unmatched", unmatchedListResponse, {
        cursor: pageParam,
        limit: 50,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
    meta: SEAM_META,
  });

/** After the server confirms a link/dismiss: drop that row from the cached pages and refresh the lists. */
function useResolved() {
  const qc = useQueryClient();
  return (id: string) => {
    qc.setQueryData<InfiniteData<UnmatchedListResponse>>(applicationKeys.unmatched, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              items: p.items.filter((i) => i.id !== id),
              // `total` is repeated on every page (the UI reads page 0): one row fewer everywhere.
              total: Math.max(0, p.total - 1),
            })),
          }
        : old,
    );
    void qc.invalidateQueries({ queryKey: ["applications", "list"] });
  };
}

export function useLinkApplication(id: string) {
  const resolved = useResolved();
  return useMutation({
    mutationFn: (leadId: string) =>
      apiPost(`/api/applications/${id}/link`, linkApplicationBody.parse({ leadId }), application),
    meta: SEAM_META,
    onSuccess: (a) => resolved(a.id),
  });
}

export function useDismissApplication(id: string) {
  const resolved = useResolved();
  return useMutation({
    mutationFn: (reason: string) =>
      apiPost(
        `/api/applications/${id}/dismiss`,
        dismissApplicationBody.parse({ reason: reason.trim() || undefined }),
        dismissApplicationResponse,
      ),
    meta: SEAM_META,
    onSuccess: (r) => resolved(r.id),
  });
}
