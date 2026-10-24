import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  auditLogResponse,
  createTenantBody,
  createTenantResponse,
  currentImpersonationResponse,
  impersonationSession,
  plan,
  planBody,
  plansResponse,
  platformHealth,
  platformTenant,
  platformTenantsResponse,
  startImpersonationBody,
  suspendTenantBody,
  topUpBody,
  type CreateTenantBody,
  type Plan,
  type PlatformTenant,
} from "@vernacular/contracts";
import type { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost, type QueryValue } from "@/lib/api";
import { SEAM_META } from "@/lib/seam";

/**
 * Platform console (D6-I4-01) against the PROPOSED contract (packages/contracts/src/platform.ts). Not built yet:
 * "Route not found" → "not available yet". Rows are replaced with what the server returns.
 */
export const platformKeys = {
  tenants: (f: Record<string, QueryValue>) => ["platform", "tenants", f] as const,
  plans: ["platform", "plans"] as const,
  health: ["platform", "health"] as const,
  audit: (f: Record<string, QueryValue>) => ["platform", "audit", f] as const,
  impersonation: ["platform", "impersonation"] as const,
};

export const useTenants = (filters: { q?: string; status?: "active" | "suspended" }) =>
  useQuery({
    queryKey: platformKeys.tenants(filters),
    queryFn: () => apiGet("/api/platform/tenants", platformTenantsResponse, filters),
    retry: false,
    meta: SEAM_META,
  });

/** Put the server's tenant into every cached tenants list. */
function useStoreTenant() {
  const qc = useQueryClient();
  return (t: PlatformTenant) =>
    qc.setQueriesData<z.infer<typeof platformTenantsResponse>>(
      { queryKey: ["platform", "tenants"] },
      (old) => (old ? { items: old.items.map((x) => (x.id === t.id ? t : x)) } : old),
    );
}

export function useTenantActions(id: string) {
  const store = useStoreTenant();
  const opts = { meta: SEAM_META, onSuccess: store };
  return {
    suspend: useMutation({
      mutationFn: (reason: string) =>
        apiPost(
          `/api/platform/tenants/${id}/suspend`,
          suspendTenantBody.parse({ reason }),
          platformTenant,
        ),
      ...opts,
    }),
    activate: useMutation({
      mutationFn: () => apiPost(`/api/platform/tenants/${id}/activate`, {}, platformTenant),
      ...opts,
    }),
    topUp: useMutation({
      mutationFn: (b: z.input<typeof topUpBody>) =>
        apiPost(`/api/platform/tenants/${id}/top-up`, topUpBody.parse(b), platformTenant),
      ...opts,
    }),
  };
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateTenantBody) =>
      apiPost("/api/platform/tenants", createTenantBody.parse(b), createTenantResponse),
    meta: SEAM_META,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["platform", "tenants"] }),
  });
}

/* ---- plans ---- */

export const usePlans = () =>
  useQuery({
    queryKey: platformKeys.plans,
    queryFn: () => apiGet("/api/platform/plans", plansResponse),
    retry: false,
    meta: SEAM_META,
  });

export function useSavePlan(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: z.input<typeof planBody>) =>
      id
        ? apiPatch(`/api/platform/plans/${id}`, planBody.parse(b), plan)
        : apiPost("/api/platform/plans", planBody.parse(b), plan),
    meta: SEAM_META,
    onSuccess: (p: Plan) =>
      qc.setQueryData(platformKeys.plans, (old: { items: Plan[] } | undefined) =>
        old
          ? {
              items: old.items.some((x) => x.id === p.id)
                ? old.items.map((x) => (x.id === p.id ? p : x))
                : [...old.items, p],
            }
          : old,
      ),
  });
}

/* ---- health + audit ---- */

/** Refreshes every 30 s while the page is open and visible. */
export const usePlatformHealth = () =>
  useQuery({
    queryKey: platformKeys.health,
    queryFn: () => apiGet("/api/platform/health", platformHealth),
    refetchInterval: (q) => (q.state.error ? false : 30_000),
    refetchIntervalInBackground: false,
    retry: false,
    meta: SEAM_META,
  });

export const useAuditLog = (filters: Record<string, QueryValue>) =>
  useInfiniteQuery({
    queryKey: platformKeys.audit(filters),
    queryFn: ({ pageParam }) =>
      apiGet("/api/admin/audit-log", auditLogResponse, {
        ...filters,
        cursor: pageParam,
        limit: 50,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
    meta: SEAM_META,
  });

/* ---- impersonation ---- */

export function useStartImpersonation() {
  return useMutation({
    mutationFn: (b: z.input<typeof startImpersonationBody>) =>
      apiPost("/api/platform/impersonate", startImpersonationBody.parse(b), impersonationSession),
    meta: SEAM_META,
  });
}

/** Only asked while /api/me says we're impersonating. */
export const useCurrentImpersonation = (enabled: boolean) =>
  useQuery({
    queryKey: platformKeys.impersonation,
    queryFn: () => apiGet("/api/platform/impersonate", currentImpersonationResponse),
    enabled,
    retry: false,
    meta: SEAM_META,
  });

export const useStopImpersonation = () =>
  useMutation({ mutationFn: () => apiDelete("/api/platform/impersonate"), meta: SEAM_META });
