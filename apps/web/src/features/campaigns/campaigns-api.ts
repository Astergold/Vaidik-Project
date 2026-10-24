import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  campaign,
  campaignPlatformOptions,
  campaignsListResponse,
  createCampaignBody,
  leadsListResponse,
  patchCampaignBody,
  type CampaignAction,
  type CampaignLeadFilter,
} from "@vernacular/contracts";
import type { z } from "zod";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { ErrorMeta } from "@/lib/errors";
import { matchCountQuery } from "@/features/campaigns/campaign-logic";

/**
 * Campaigns calls (D3-I4-04, packages/contracts/src/campaigns.ts). Campaigns are created here and mirrored to the
 * calling platform by the server. Errors are shown on the page; a 401 still goes to the global sign-in redirect.
 */
const META: ErrorMeta = {
  handles: [0, 400, 403, 404, 409, 422, 500, 502, 503, 504],
};
const keys = {
  list: ["campaigns"] as const,
  detail: (id: string) => ["campaigns", id] as const,
};

export const useCampaigns = () =>
  useQuery({
    queryKey: keys.list,
    queryFn: () => apiGet("/api/campaigns", campaignsListResponse),
    retry: false,
    meta: META,
  });

/** Polls every 5 s while running; React Query pauses it when the tab is hidden; stops once not running. */
export const useCampaign = (id: string) =>
  useQuery({
    queryKey: keys.detail(id),
    queryFn: () => apiGet(`/api/campaigns/${id}`, campaign),
    retry: false,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 5000 : false),
    refetchIntervalInBackground: false,
    meta: META,
  });

/** Workflows, telephony configurations and defaults, read live from the calling platform. */
export const usePlatformOptions = () =>
  useQuery({
    queryKey: ["campaigns", "platform-options"],
    queryFn: () => apiGet("/api/campaigns/platform-options", campaignPlatformOptions),
    retry: false,
    staleTime: 60_000,
    meta: META,
  });

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof createCampaignBody>) =>
      apiPost("/api/campaigns", createCampaignBody.parse(body), campaign),
    meta: META,
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.list }),
  });
}

export function usePatchCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: z.input<typeof patchCampaignBody>) =>
      apiPatch(`/api/campaigns/${id}`, patchCampaignBody.parse(body), campaign),
    meta: META,
    onSuccess: (c) => {
      qc.setQueryData(keys.detail(id), c);
      void qc.invalidateQueries({ queryKey: keys.list });
    },
  });
}

/** Start/pause/resume/stop. The page shows the status the server returns (never optimistic). */
export function useCampaignAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: CampaignAction) => apiPost(`/api/campaigns/${id}/${action}`, {}, campaign),
    meta: META,
    onSuccess: (c) => {
      qc.setQueryData(keys.detail(id), c);
      void qc.invalidateQueries({ queryKey: keys.list });
    },
  });
}

/** Live "leads matching now" from the existing GET /api/leads (real data; only `total` is used). */
export const useMatchCount = (filter: CampaignLeadFilter) => {
  const query = matchCountQuery(filter);
  return useQuery({
    queryKey: ["leads", query],
    queryFn: () => apiGet("/api/leads", leadsListResponse, query),
    select: (r) => r.total,
    meta: { silent: true },
  });
};
