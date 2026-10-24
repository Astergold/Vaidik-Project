import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  leadMessagesResponse,
  sendMessageBody,
  sendMessageResponse,
  putWhatsappSettingsBody,
  templatesResponse,
  whatsappSettings,
  type LeadMessagesResponse,
  type PutWhatsappSettingsBody,
  type SendMessageBody,
} from "@vernacular/contracts";
import type { InfiniteData } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { SEAM_META } from "@/lib/seam";

/**
 * WhatsApp on Lead 360 (D5-I4-02) against the PROPOSED contract (packages/contracts/src/messaging.ts). Not built yet:
 * a "Route not found" 404 is shown as "not available yet". A sent message appears when the server returns it.
 */
export const messageKeys = {
  lead: (leadId: string) => ["messages", leadId] as const,
  templates: (leadId: string) => ["whatsapp", "templates", leadId] as const,
};

/** Polls every 15 s (paused while the tab is hidden) so ticks and replies appear without reload. */
export const useLeadMessages = (leadId: string) =>
  useInfiniteQuery({
    queryKey: messageKeys.lead(leadId),
    queryFn: ({ pageParam }) =>
      apiGet(`/api/leads/${leadId}/messages`, leadMessagesResponse, { cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (q) => (q.state.error ? false : 15_000),
    refetchIntervalInBackground: false,
    retry: false,
    meta: SEAM_META,
  });

/** Page 0 is the newest fetch: its window/suppression flags are the current ones. Messages oldest → newest. */
export function flattenMessages(data: InfiniteData<LeadMessagesResponse> | undefined) {
  const latest = data?.pages[0];
  return {
    messages: data ? [...data.pages].reverse().flatMap((p) => p.items) : [],
    freeTextAllowed: latest?.freeTextAllowed ?? false,
    freeTextWindowEndsAt: latest?.freeTextWindowEndsAt ?? null,
    suppression: latest?.suppression ?? null,
  };
}

export const useTemplates = (leadId: string, enabled: boolean) =>
  useQuery({
    queryKey: messageKeys.templates(leadId),
    queryFn: () => apiGet("/api/whatsapp/templates", templatesResponse, { leadId }),
    enabled,
    retry: false,
    meta: SEAM_META,
  });

export function useSendMessage(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SendMessageBody) =>
      apiPost("/api/messages", sendMessageBody.parse(body), sendMessageResponse),
    meta: SEAM_META,
    onSuccess: (r) => {
      if (r.message) void qc.invalidateQueries({ queryKey: messageKeys.lead(leadId) });
    },
  });
}

/* ---- Settings → WhatsApp (owner/admin) ---- */

export const useWhatsappSettings = () =>
  useQuery({
    queryKey: ["settings", "whatsapp"],
    queryFn: () => apiGet("/api/settings/whatsapp", whatsappSettings),
    retry: false,
    meta: SEAM_META,
  });

/** Saves sender, optional new key and every variable mapping; the cache takes the server's reply. */
export function usePutWhatsappSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PutWhatsappSettingsBody) =>
      apiPut("/api/settings/whatsapp", putWhatsappSettingsBody.parse(body), whatsappSettings),
    meta: SEAM_META,
    onSuccess: (s) => {
      qc.setQueryData(["settings", "whatsapp"], s);
      void qc.invalidateQueries({ queryKey: ["whatsapp", "templates"] });
    },
  });
}
