import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  callReview,
  overrideReviewBody,
  queueItem,
  queueListResponse,
  resolveQueueBody,
  type OverrideReviewBody,
  type QueueKind,
  type ResolveQueueBody,
} from "@vernacular/contracts";
import { apiGet, apiPost } from "@/lib/api";
import type { ErrorMeta } from "@/lib/errors";

/**
 * Queue + call review calls (D4-I4-01) against the PROPOSED contracts (packages/contracts/src/{queue,call-review}.ts).
 * Not built yet: "Route not found" 404s are shown as "not available yet". Errors are shown in place; a 401 still
 * goes to the global sign-in redirect.
 */
export const REVIEW_META: ErrorMeta = { handles: [0, 400, 403, 404, 409, 422, 500, 502, 503, 504] };

export const reviewKeys = {
  queue: (kind: QueueKind) => ["queue", kind] as const,
  call: (id: string) => ["call", id] as const,
};

export const useQueue = (kind: QueueKind) =>
  useQuery({
    queryKey: reviewKeys.queue(kind),
    queryFn: () => apiGet("/api/queue", queueListResponse, { kind, status: "open", limit: 50 }),
    retry: false,
    meta: REVIEW_META,
  });

export const useCallReview = (callId: string) =>
  useQuery({
    queryKey: reviewKeys.call(callId),
    queryFn: () => apiGet(`/api/calls/${callId}`, callReview),
    retry: false,
    meta: REVIEW_META,
  });

/** After any review/resolve: refresh the queues, this call and the lead (its temperature comes from the DB trigger). */
function useAfterReview() {
  const qc = useQueryClient();
  return (callId: string | null, leadId: string) => {
    void qc.invalidateQueries({ queryKey: ["queue"] });
    if (callId) void qc.invalidateQueries({ queryKey: reviewKeys.call(callId) });
    void qc.invalidateQueries({ queryKey: ["lead", leadId] });
  };
}

export function useVerify(callId: string, leadId: string) {
  const after = useAfterReview();
  return useMutation({
    mutationFn: () => apiPost(`/api/calls/${callId}/review/verify`, {}, callReview),
    meta: REVIEW_META,
    onSuccess: () => after(callId, leadId),
  });
}

export function useOverride(callId: string, leadId: string) {
  const after = useAfterReview();
  return useMutation({
    mutationFn: (body: OverrideReviewBody) =>
      apiPost(`/api/calls/${callId}/review/override`, overrideReviewBody.parse(body), callReview),
    meta: REVIEW_META,
    onSuccess: () => after(callId, leadId),
  });
}

export function useResolve(itemId: string, callId: string | null, leadId: string) {
  const after = useAfterReview();
  return useMutation({
    mutationFn: (body: ResolveQueueBody) =>
      apiPost(`/api/queue/${itemId}/resolve`, resolveQueueBody.parse(body), queueItem),
    meta: REVIEW_META,
    onSuccess: () => after(callId, leadId),
  });
}
