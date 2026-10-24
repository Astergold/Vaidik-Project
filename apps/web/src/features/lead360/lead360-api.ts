import {
  addNoteBody,
  callNowResponse,
  leadDetail,
  timelineResponse,
  type PatchLeadBody,
} from "@vernacular/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { STUB_SESSION } from "@/lib/session";
import { nextPageParam, TIMELINE_PAGE_SIZE } from "@/features/lead360/timeline-paging";

/**
 * Lead 360 data (D3-I4-01). Only GET /api/leads/:id and /timeline, plus the three actions.
 * The page explains 403/404 itself (and, with the dev session, 401) instead of the global toast.
 */
export const leadKeys = {
  detail: (id: string) => ["lead", id] as const,
  timeline: (id: string) => ["lead", id, "timeline"] as const,
};

const pageHandles = STUB_SESSION ? [401, 403, 404] : [403, 404];

export const useLead = (id: string) =>
  useQuery({
    queryKey: leadKeys.detail(id),
    queryFn: () => apiGet(`/api/leads/${id}`, leadDetail),
    meta: { handles: pageHandles },
  });

export const useTimeline = (id: string, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: leadKeys.timeline(id),
    queryFn: ({ pageParam }) =>
      apiGet(`/api/leads/${id}/timeline`, timelineResponse, {
        limit: TIMELINE_PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageParam,
    enabled,
    meta: { handles: pageHandles },
  });

/** PATCH returns the full lead: it replaces the cache (the client never writes `stage` itself). */
export function usePatchLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchLeadBody) => apiPatch(`/api/leads/${id}`, body, leadDetail),
    // Field errors (422) and role errors (403) are shown in the dialog.
    meta: { handles: [403, 404, 422] },
    onSuccess: (lead) => {
      qc.setQueryData(leadKeys.detail(id), lead);
      void qc.invalidateQueries({ queryKey: leadKeys.timeline(id) });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useAddNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof addNoteBody>) =>
      apiPost(`/api/leads/${id}/notes`, addNoteBody.parse(body), z.object({ id: z.uuid() })),
    meta: { handles: [422] },
    onSuccess: () => void qc.invalidateQueries({ queryKey: leadKeys.timeline(id) }),
  });
}

/** Always 200 for policy blocks (`queued:false` + `rejection`) — a warning, not an error. 409 = closed lead. */
export function useCallNow(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/api/leads/${id}/call-now`, {}, callNowResponse),
    meta: { handles: [409] },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: leadKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: leadKeys.timeline(id) });
    },
  });
}
