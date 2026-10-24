import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDomainBody,
  brandingSettings,
  domainsResponse,
  putBrandingBody,
  tenantDomain,
  type BrandingSettings,
  type PutBrandingBody,
  type TenantDomain,
} from "@vernacular/contracts";
import { apiDelete, apiGet, apiPost, apiPostForm, apiPut } from "@/lib/api";
import { brandingKey } from "@/lib/branding";
import { SEAM_META } from "@/lib/seam";

/**
 * Settings → Branding + Domains (D6-I4-02) against the PROPOSED contract (packages/contracts/src/branding.ts).
 * After a save the app-wide branding (GET /api/branding) is refetched, so the shell shows the server's values.
 */
export const brandingKeys = {
  settings: ["settings", "branding"] as const,
  domains: ["settings", "domains"] as const,
};

export const useBrandingSettings = () =>
  useQuery({
    queryKey: brandingKeys.settings,
    queryFn: () => apiGet("/api/settings/branding", brandingSettings),
    retry: false,
    meta: SEAM_META,
  });

function useStoreBranding() {
  const qc = useQueryClient();
  return (b: BrandingSettings) => {
    qc.setQueryData(brandingKeys.settings, b);
    void qc.invalidateQueries({ queryKey: brandingKey });
  };
}

export function useSaveBranding() {
  const store = useStoreBranding();
  return useMutation({
    mutationFn: (b: PutBrandingBody) =>
      apiPut("/api/settings/branding", putBrandingBody.parse(b), brandingSettings),
    meta: SEAM_META,
    onSuccess: store,
  });
}

/** Raw file to the API (it checks type/size again and stores it); returns the updated branding. */
export function useUploadBrandingAsset() {
  const store = useStoreBranding();
  return useMutation({
    mutationFn: ({ kind, file }: { kind: "logo" | "favicon"; file: File }) => {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file, file.name);
      return apiPostForm("/api/settings/branding/assets", form, brandingSettings);
    },
    meta: SEAM_META,
    onSuccess: store,
  });
}

/* ---- domains ---- */

export const useDomains = () =>
  useQuery({
    queryKey: brandingKeys.domains,
    queryFn: () => apiGet("/api/settings/domains", domainsResponse),
    retry: false,
    meta: SEAM_META,
  });

export function useDomainMutations() {
  const qc = useQueryClient();
  const upsert = (d: TenantDomain) =>
    qc.setQueryData(brandingKeys.domains, (old: { items: TenantDomain[] } | undefined) =>
      old
        ? {
            items: old.items.some((x) => x.id === d.id)
              ? old.items.map((x) => (x.id === d.id ? d : x))
              : [...old.items, d],
          }
        : old,
    );
  return {
    add: useMutation({
      mutationFn: (hostname: string) =>
        apiPost("/api/settings/domains", addDomainBody.parse({ hostname }), tenantDomain),
      meta: SEAM_META,
      onSuccess: upsert,
    }),
    verify: useMutation({
      mutationFn: (id: string) => apiPost(`/api/settings/domains/${id}/verify`, {}, tenantDomain),
      meta: SEAM_META,
      onSuccess: upsert,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete(`/api/settings/domains/${id}`),
      meta: SEAM_META,
      onSuccess: (_v, id) =>
        qc.setQueryData(brandingKeys.domains, (old: { items: TenantDomain[] } | undefined) =>
          old ? { items: old.items.filter((x) => x.id !== id) } : old,
        ),
    }),
  };
}
