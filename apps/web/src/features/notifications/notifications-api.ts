import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notification, notificationsResponse, readAllResponse } from "@vernacular/contracts";
import { apiGet, apiPost } from "@/lib/api";
import { SEAM_META } from "@/lib/seam";

/**
 * Notifications (D6-I4-04a) against the PROPOSED contract (packages/contracts/src/search.ts). Not built yet: the bell
 * shows no badge and the page says "not available yet". After marking read, the server's lists are refetched.
 */
export const notificationKeys = {
  all: ["notifications"] as const,
  count: ["notifications", "count"] as const,
  list: (unread: boolean) => ["notifications", "list", unread] as const,
};

/** Unread count for the bell: polled every 60 s while visible; any failure just hides the badge. */
export const useUnreadCount = (enabled: boolean) =>
  useQuery({
    queryKey: notificationKeys.count,
    queryFn: () => apiGet("/api/notifications", notificationsResponse, { unread: true, limit: 1 }),
    select: (r) => r.unreadCount,
    enabled,
    refetchInterval: (q) => (q.state.error ? false : 60_000),
    refetchIntervalInBackground: false,
    retry: false,
    meta: { silent: true },
  });

export const useNotifications = (unread: boolean) =>
  useInfiniteQuery({
    queryKey: notificationKeys.list(unread),
    queryFn: ({ pageParam }) =>
      apiGet("/api/notifications", notificationsResponse, {
        unread: unread || undefined,
        cursor: pageParam,
        limit: 30,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
    meta: SEAM_META,
  });

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/api/notifications/${id}/read`, {}, notification),
    meta: SEAM_META,
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost("/api/notifications/read-all", {}, readAllResponse),
    meta: SEAM_META,
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
