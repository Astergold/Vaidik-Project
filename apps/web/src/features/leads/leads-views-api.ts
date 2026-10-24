import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bulkLeadsBody,
  bulkLeadsResult,
  createSavedViewBody,
  savedLeadFilters,
  savedView,
  savedViewsResponse,
  type BulkLeadsBody,
  type SavedLeadFilters,
  type SavedView,
} from "@vernacular/contracts";
import type { z } from "zod";
import type { LeadsSearch } from "@/features/leads/leads-search";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { SEAM_META } from "@/lib/seam";

/**
 * Saved views + bulk actions on /leads (D6-I4-04b) against the PROPOSED contract
 * (packages/contracts/src/leads-bulk.ts). After a bulk action the leads list is refetched from the server.
 */
export const viewKeys = { list: ["saved-views", "lead"] as const };

/** URL state → stored filters (no paging; empty values dropped). */
export function filtersFromSearch(s: LeadsSearch): SavedLeadFilters {
  const f: SavedLeadFilters = {
    q: s.q?.trim() || undefined,
    stage: s.stage,
    temperature: s.temperature,
    sourceId: s.sourceId,
    agentId: s.agentId,
    counsellorId: s.counsellorId,
    createdFrom: s.createdFrom,
    createdTo: s.createdTo,
    sort: s.sort,
    order: s.order,
  };
  return savedLeadFilters.parse(
    Object.fromEntries(
      Object.entries(f).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
    ),
  );
}

/** Same filters? (order of array values doesn't matter) */
export function sameFilters(a: SavedLeadFilters, b: SavedLeadFilters): boolean {
  const norm = (f: SavedLeadFilters) =>
    JSON.stringify(
      Object.entries(f)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v])
        .sort(([x], [y]) => String(x).localeCompare(String(y))),
    );
  return norm(a) === norm(b);
}

export const useSavedViews = () =>
  useQuery({
    queryKey: viewKeys.list,
    queryFn: () => apiGet("/api/saved-views", savedViewsResponse, { entity: "lead" }),
    retry: false,
    meta: SEAM_META,
  });

export function useViewMutations() {
  const qc = useQueryClient();
  const set = (fn: (items: SavedView[]) => SavedView[]) =>
    qc.setQueryData(viewKeys.list, (old: { items: SavedView[] } | undefined) =>
      old ? { items: fn(old.items) } : old,
    );
  return {
    create: useMutation({
      mutationFn: (b: z.input<typeof createSavedViewBody>) =>
        apiPost("/api/saved-views", createSavedViewBody.parse(b), savedView),
      meta: SEAM_META,
      onSuccess: (v) => set((items) => [...items, v]),
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete(`/api/saved-views/${id}`),
      meta: SEAM_META,
      onSuccess: (_v, id) => set((items) => items.filter((x) => x.id !== id)),
    }),
  };
}

export function useBulkLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: BulkLeadsBody) =>
      apiPost("/api/leads/bulk", bulkLeadsBody.parse(b), bulkLeadsResult),
    meta: SEAM_META,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}
