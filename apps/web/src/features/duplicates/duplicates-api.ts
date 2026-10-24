import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  dismissDuplicateBody,
  dismissDuplicateResponse,
  duplicatesResponse,
  mergePersonsBody,
  mergeResult,
  type DuplicatesResponse,
} from "@vernacular/contracts";
import { apiGet, apiPost } from "@/lib/api";
import { SEAM_META } from "@/lib/seam";

/**
 * Duplicates (D6-I4-04c) against the PROPOSED contract (packages/contracts/src/duplicates.ts). The browser only names
 * the survivor; the server merges. A pair leaves the list once the server confirms.
 */
export const duplicateKeys = { list: ["duplicates"] as const };

export const useDuplicates = () =>
  useInfiniteQuery({
    queryKey: duplicateKeys.list,
    queryFn: ({ pageParam }) =>
      apiGet("/api/duplicates", duplicatesResponse, { cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
    meta: SEAM_META,
  });

function useDropPair() {
  const qc = useQueryClient();
  return (id: string) => {
    qc.setQueryData<InfiniteData<DuplicatesResponse>>(duplicateKeys.list, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              items: p.items.filter((c) => c.id !== id),
              total: Math.max(0, p.total - 1),
            })),
          }
        : old,
    );
    void qc.invalidateQueries({ queryKey: ["leads"] });
  };
}

export function useMerge(candidateId: string) {
  const drop = useDropPair();
  return useMutation({
    mutationFn: ({ survivorId, mergedId }: { survivorId: string; mergedId: string }) =>
      apiPost(
        "/api/persons/merge",
        mergePersonsBody.parse({ candidateId, survivorId, mergedId }),
        mergeResult,
      ),
    meta: SEAM_META,
    onSuccess: () => drop(candidateId),
  });
}

export function useDismissDuplicate(candidateId: string) {
  const drop = useDropPair();
  return useMutation({
    mutationFn: () =>
      apiPost(
        `/api/duplicates/${candidateId}/dismiss`,
        dismissDuplicateBody.parse({}),
        dismissDuplicateResponse,
      ),
    meta: SEAM_META,
    onSuccess: () => drop(candidateId),
  });
}
