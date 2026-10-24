import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { statementsResponse, usageResponse, walletResponse } from "@vernacular/contracts";
import { apiGet, apiGetBlob } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import { SEAM_META } from "@/lib/seam";

/**
 * Billing (D6-I4-03) against the PROPOSED contract (packages/contracts/src/billing.ts). Not built yet: "Route not
 * found" → "Billing service not available yet". All money arrives in paise and is only formatted here.
 */
export const billingKeys = {
  wallet: ["billing", "wallet"] as const,
  usage: (from: string, to: string) => ["billing", "usage", from, to] as const,
  statements: ["billing", "statements"] as const,
};

/** Page 0 carries the balance/plan/period; later pages only add older transactions. */
export const useWallet = () =>
  useInfiniteQuery({
    queryKey: billingKeys.wallet,
    queryFn: ({ pageParam }) =>
      apiGet("/api/billing/wallet", walletResponse, { cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
    meta: SEAM_META,
  });

export const useUsage = (from: string, to: string) =>
  useQuery({
    queryKey: billingKeys.usage(from, to),
    queryFn: () => apiGet("/api/billing/usage", usageResponse, { from, to }),
    retry: false,
    meta: SEAM_META,
  });

export const useStatements = () =>
  useQuery({
    queryKey: billingKeys.statements,
    queryFn: () => apiGet("/api/billing/statements", statementsResponse),
    retry: false,
    meta: SEAM_META,
  });

export async function downloadStatement(id: string, period: string, format: "csv" | "pdf") {
  saveBlob(
    await apiGetBlob(`/api/billing/statements/${id}/file?format=${format}`),
    `statement-${period}.${format}`,
  );
}
