import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHolidayBody,
  holiday,
  holidaysResponse,
  policySettings,
  policySettingsBody,
  type PolicySettings,
} from "@vernacular/contracts";
import type { z } from "zod";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { SEAM_META } from "@/lib/seam";

/**
 * Settings → Policy & holidays (D6-I4-02) against the REAL Day-3 API (apps/api/src/modules/policy): reads for
 * owner/admin/head, writes for owner/admin. The cache only ever holds what the server returned.
 */
export const policyKeys = {
  policy: ["settings", "policy"] as const,
  holidays: ["settings", "holidays"] as const,
};

export const usePolicy = () =>
  useQuery({
    queryKey: policyKeys.policy,
    queryFn: () => apiGet("/api/settings/policy", policySettings),
    retry: false,
    meta: SEAM_META,
  });

export function useSavePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PolicySettings) =>
      apiPut("/api/settings/policy", policySettingsBody.parse(body), policySettings),
    meta: SEAM_META,
    onSuccess: (p) => qc.setQueryData(policyKeys.policy, p),
  });
}

export const useHolidays = () =>
  useQuery({
    queryKey: policyKeys.holidays,
    queryFn: () => apiGet("/api/settings/holidays", holidaysResponse),
    retry: false,
    meta: SEAM_META,
  });

type Holidays = z.infer<typeof holidaysResponse>;
const byDate = (items: Holidays["items"]) =>
  [...items].sort((a, b) => a.date.localeCompare(b.date));

/** Adding a date that already exists renames it (the API upserts on date). */
export function useAddHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: z.input<typeof createHolidayBody>) =>
      apiPost("/api/settings/holidays", createHolidayBody.parse(b), holiday),
    meta: SEAM_META,
    onSuccess: (h) =>
      qc.setQueryData<Holidays>(policyKeys.holidays, (old) =>
        old ? { items: byDate([...old.items.filter((x) => x.date !== h.date), h]) } : old,
      ),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/settings/holidays/${id}`),
    meta: SEAM_META,
    onSuccess: (_void, id) =>
      qc.setQueryData<Holidays>(policyKeys.holidays, (old) =>
        old ? { items: old.items.filter((x) => x.id !== id) } : old,
      ),
  });
}
