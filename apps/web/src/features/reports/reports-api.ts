import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createExportBody,
  exportJob,
  exportsResponse,
  performanceResponse,
  type CreateExportBody,
  type ExportJob,
} from "@vernacular/contracts";
import { apiGet, apiGetBlob, apiPost } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import { SEAM_META } from "@/lib/seam";

/**
 * Reports (D6-I4-04d) against the PROPOSED contract (packages/contracts/src/reports.ts). Not built yet: "Route not
 * found" → "Reports service not available yet".
 */
export const reportKeys = {
  performance: (from: string, to: string) => ["reports", "performance", from, to] as const,
  exports: ["reports", "exports"] as const,
};

export const usePerformance = (from: string, to: string) =>
  useQuery({
    queryKey: reportKeys.performance(from, to),
    queryFn: () => apiGet("/api/reports/performance", performanceResponse, { from, to }),
    retry: false,
    meta: SEAM_META,
  });

const busy = (j: ExportJob) => j.status === "queued" || j.status === "running";

/** Polls every 5 s while any export is still being built (paused while the tab is hidden). */
export const useExports = () =>
  useQuery({
    queryKey: reportKeys.exports,
    queryFn: () => apiGet("/api/reports/exports", exportsResponse),
    refetchInterval: (q) => (q.state.data?.items.some(busy) ? 5000 : false),
    refetchIntervalInBackground: false,
    retry: false,
    meta: SEAM_META,
  });

export function useRequestExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateExportBody) =>
      apiPost("/api/reports/exports", createExportBody.parse(b), exportJob),
    meta: SEAM_META,
    onSuccess: (j) =>
      qc.setQueryData(reportKeys.exports, (old: { items: ExportJob[] } | undefined) => ({
        items: [j, ...(old?.items ?? []).filter((x) => x.id !== j.id)],
      })),
  });
}

export async function downloadExport(j: ExportJob) {
  saveBlob(
    await apiGetBlob(`/api/reports/exports/${j.id}/file`),
    `${j.kind}-${j.createdAt.slice(0, 10)}.csv`,
  );
}
