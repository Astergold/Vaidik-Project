import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSourceBody,
  createSourceResponse,
  leadSource,
  patchSourceBody,
  rotateTokenResponse,
  sourcesListResponse,
  testMappingBody,
  testMappingResponse,
} from "@vernacular/contracts";
import type { z } from "zod";
import { apiGet, apiPatch, apiPost } from "@/lib/api";

/**
 * Lead sources (D3-I4-03). View: owner/admin/head. Create/edit/rotate/test: owner/admin.
 * Shared by Settings → Lead sources and the dashboard's source filter.
 * Tokens come back only from create/rotate and are NEVER put in the query cache.
 */
export const sourceKeys = { all: ["settings", "sources"] as const };

export const useSources = (enabled = true) =>
  useQuery({
    queryKey: sourceKeys.all,
    queryFn: () => apiGet("/api/settings/sources", sourcesListResponse),
    // A role without access just doesn't get the feature; the page explains it.
    meta: { handles: [403] },
    enabled,
  });

function useSourceMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    meta: { handles: [403, 404, 422] },
    onSuccess: () => void qc.invalidateQueries({ queryKey: sourceKeys.all }),
  });
}

export const useCreateSource = () =>
  useSourceMutation((body: z.input<typeof createSourceBody>) =>
    apiPost("/api/settings/sources", createSourceBody.parse(body), createSourceResponse),
  );

export const usePatchSource = (id: string) =>
  useSourceMutation((body: z.input<typeof patchSourceBody>) =>
    apiPatch(`/api/settings/sources/${id}`, patchSourceBody.parse(body), leadSource),
  );

export const useRotateToken = (id: string) =>
  useSourceMutation(() =>
    apiPost(`/api/settings/sources/${id}/rotate-token`, {}, rotateTokenResponse),
  );

/** Dry run: maps a sample payload with the (unsaved) mapping. Writes nothing, so no cache change. */
export const useTestMapping = (id: string) =>
  useMutation({
    mutationFn: (body: z.input<typeof testMappingBody>) =>
      apiPost(
        `/api/settings/sources/${id}/test-mapping`,
        testMappingBody.parse(body),
        testMappingResponse,
      ),
    meta: { handles: [403, 404, 422] },
  });
