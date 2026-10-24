import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { publicBranding } from "@vernacular/contracts";
import { apiGet } from "@/lib/api";

/**
 * Tenant branding (D1-I4-03, D6-I4-02). Everything the tenant sees as "theirs" comes from here or from CSS tokens.
 * The root provider reads `GET /api/branding` (resolved from the Host, before login); any failure — including the
 * route not existing yet — keeps the defaults. `brandColor` overrides the single `--brand` token.
 *
 * Live preview (Settings → Branding): `setPreview` overlays unsaved values on the whole app instantly, with no request.
 * `setPreview(null)` drops the overlay (on Cancel, Save, or leaving the page).
 */
export interface Branding {
  productName: string;
  logoUrl: string | null;
  brandColor: string | null;
  faviconUrl?: string | null;
}

export const DEFAULT_BRANDING: Branding = {
  productName: "Vernacular AI",
  logoUrl: null,
  // Dev-only preview of a tenant colour, e.g. VITE_BRAND_COLOR="oklch(0.55 0.18 150)".
  brandColor: import.meta.env.VITE_BRAND_COLOR ?? null,
  faviconUrl: null,
};

export const brandingKey = ["branding"] as const;

interface BrandingValue {
  branding: Branding;
  setPreview: (preview: Partial<Branding> | null) => void;
  previewing: boolean;
}

const BrandingContext = createContext<BrandingValue>({
  branding: DEFAULT_BRANDING,
  setPreview: () => {},
  previewing: false,
});

/** Root use: fetches the tenant's branding. Tests (and the auth layout before a host exists) can pass `branding`. */
export function BrandingProvider({
  branding,
  children,
}: {
  branding?: Branding;
  children: ReactNode;
}) {
  const q = useQuery({
    queryKey: brandingKey,
    queryFn: () => apiGet("/api/branding", publicBranding),
    enabled: branding === undefined,
    retry: false,
    staleTime: 5 * 60_000,
    meta: { silent: true }, // a failure just means "defaults"
  });
  const saved = useMemo<Branding>(() => {
    if (branding) return branding;
    if (!q.data) return DEFAULT_BRANDING;
    return {
      productName: q.data.productName,
      logoUrl: q.data.logoUrl,
      brandColor: q.data.brandColor ?? DEFAULT_BRANDING.brandColor,
      faviconUrl: q.data.faviconUrl,
    };
  }, [branding, q.data]);
  return <PreviewLayer saved={saved}>{children}</PreviewLayer>;
}

function PreviewLayer({ saved, children }: { saved: Branding; children: ReactNode }) {
  const [preview, setPreviewState] = useState<Partial<Branding> | null>(null);
  const setPreview = useCallback((p: Partial<Branding> | null) => setPreviewState(p), []);
  const effective = useMemo(() => ({ ...saved, ...preview }), [saved, preview]);

  useEffect(() => {
    const root = document.documentElement;
    if (effective.brandColor) root.style.setProperty("--brand", effective.brandColor);
    else root.style.removeProperty("--brand");
  }, [effective.brandColor]);

  useEffect(() => {
    if (!effective.faviconUrl) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = effective.faviconUrl;
  }, [effective.faviconUrl]);

  const value = useMemo(
    () => ({ branding: effective, setPreview, previewing: preview !== null }),
    [effective, setPreview, preview],
  );
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

/** The branding to show right now (saved, or the live preview while editing). */
export const useBranding = () => useContext(BrandingContext).branding;

/** For Settings → Branding: overlay unsaved values app-wide. */
export function useBrandingPreview() {
  const { setPreview, previewing } = useContext(BrandingContext);
  return { setPreview, previewing };
}
