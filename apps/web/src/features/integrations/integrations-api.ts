import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiKey,
  apiKeysResponse,
  callingPlatformStatus,
  putCallingPlatformBody,
  createApiKeyBody,
  createApiKeyResponse,
  createWebhookBody,
  createWebhookResponse,
  deliveriesResponse,
  patchWebhookBody,
  webhook,
  webhookDelivery,
  webhooksResponse,
  type ApiKey,
  type CreateApiKeyBody,
  type CreateWebhookBody,
  type Webhook,
} from "@vernacular/contracts";
import type { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { SEAM_META } from "@/lib/seam";

/**
 * Settings → Integrations (D5-I4-03) against the PROPOSED contract (packages/contracts/src/integrations.ts). Not built
 * yet: "Route not found" → "not available yet". Lists take the server's reply; secrets are returned to the caller
 * once and never put in the cache.
 */
export const integrationKeys = {
  apiKeys: ["settings", "api-keys"] as const,
  webhooks: ["settings", "webhooks"] as const,
  deliveries: (id: string) => ["settings", "webhooks", id, "deliveries"] as const,
};

function useUpsert<T extends { id: string }>(key: readonly unknown[]) {
  const qc = useQueryClient();
  return (item: T) =>
    qc.setQueryData(key, (old: { items: T[] } | undefined) =>
      old
        ? {
            items: old.items.some((x) => x.id === item.id)
              ? old.items.map((x) => (x.id === item.id ? item : x))
              : [item, ...old.items],
          }
        : old,
    );
}

/* ---- API keys ---- */

export const useApiKeys = () =>
  useQuery({
    queryKey: integrationKeys.apiKeys,
    queryFn: () => apiGet("/api/settings/api-keys", apiKeysResponse),
    retry: false,
    meta: SEAM_META,
  });

export function useCreateApiKey() {
  const upsert = useUpsert<ApiKey>(integrationKeys.apiKeys);
  return useMutation({
    mutationFn: (body: CreateApiKeyBody) =>
      apiPost("/api/settings/api-keys", createApiKeyBody.parse(body), createApiKeyResponse),
    meta: SEAM_META,
    onSuccess: (r) => upsert(r.key), // only the key's metadata is cached, never r.secret
  });
}

export function useRevokeApiKey(id: string) {
  const upsert = useUpsert<ApiKey>(integrationKeys.apiKeys);
  return useMutation({
    mutationFn: () => apiPost(`/api/settings/api-keys/${id}/revoke`, {}, apiKey),
    meta: SEAM_META,
    onSuccess: upsert,
  });
}

/* ---- webhooks ---- */

export const useWebhooks = () =>
  useQuery({
    queryKey: integrationKeys.webhooks,
    queryFn: () => apiGet("/api/settings/webhooks", webhooksResponse),
    retry: false,
    meta: SEAM_META,
  });

export function useCreateWebhook() {
  const upsert = useUpsert<Webhook>(integrationKeys.webhooks);
  return useMutation({
    mutationFn: (body: CreateWebhookBody) =>
      apiPost("/api/settings/webhooks", createWebhookBody.parse(body), createWebhookResponse),
    meta: SEAM_META,
    onSuccess: (r) => upsert(r.webhook),
  });
}

export function usePatchWebhook(id: string) {
  const upsert = useUpsert<Webhook>(integrationKeys.webhooks);
  return useMutation({
    mutationFn: (body: z.input<typeof patchWebhookBody>) =>
      apiPatch(`/api/settings/webhooks/${id}`, patchWebhookBody.parse(body), webhook),
    meta: SEAM_META,
    onSuccess: upsert,
  });
}

export function useDeleteWebhook(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete(`/api/settings/webhooks/${id}`),
    meta: SEAM_META,
    onSuccess: () =>
      qc.setQueryData(integrationKeys.webhooks, (old: { items: Webhook[] } | undefined) =>
        old ? { items: old.items.filter((w) => w.id !== id) } : old,
      ),
  });
}

/** Sends a signed test.ping; the result is shown, and the delivery log refreshed. */
export function useTestWebhook(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/api/settings/webhooks/${id}/test`, {}, webhookDelivery),
    meta: SEAM_META,
    onSuccess: () => void qc.invalidateQueries({ queryKey: integrationKeys.deliveries(id) }),
  });
}

export const useDeliveries = (id: string, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: integrationKeys.deliveries(id),
    queryFn: ({ pageParam }) =>
      apiGet(`/api/settings/webhooks/${id}/deliveries`, deliveriesResponse, { cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    retry: false,
    meta: SEAM_META,
  });

export function useReplayDelivery(webhookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) =>
      apiPost(
        `/api/settings/webhooks/${webhookId}/deliveries/${deliveryId}/replay`,
        {},
        webhookDelivery,
      ),
    meta: SEAM_META,
    onSuccess: () => void qc.invalidateQueries({ queryKey: integrationKeys.deliveries(webhookId) }),
  });
}

/* ---- calling platform ---- */

export const callingPlatformKey = ["settings", "calling-platform"] as const;

export const useCallingPlatform = () =>
  useQuery({
    queryKey: callingPlatformKey,
    queryFn: () => apiGet("/api/settings/calling-platform", callingPlatformStatus),
    retry: false,
    meta: SEAM_META,
  });

/** The key goes to the server once and is never kept in the cache: only the returned status is. */
export function useConnectCallingPlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) =>
      apiPut(
        "/api/settings/calling-platform",
        putCallingPlatformBody.parse({ apiKey }),
        callingPlatformStatus,
      ),
    meta: SEAM_META,
    onSuccess: (s) => {
      qc.setQueryData(callingPlatformKey, s);
      void qc.invalidateQueries({ queryKey: ["campaigns", "platform-options"] });
    },
  });
}

export function useDisconnectCallingPlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiDelete("/api/settings/calling-platform");
      return apiGet("/api/settings/calling-platform", callingPlatformStatus);
    },
    meta: SEAM_META,
    onSuccess: (s) => {
      qc.setQueryData(callingPlatformKey, s);
      void qc.invalidateQueries({ queryKey: ["campaigns", "platform-options"] });
    },
  });
}
