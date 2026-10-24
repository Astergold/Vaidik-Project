import { z } from "zod";
import { isoDateTime } from "./common.js";

/**
 * Branding + custom domains (D6-I4-02 UI ↔ D6-I1-01/02). PROPOSED CONTRACT — endpoints not built yet.
 * Spec: docs/specs/settings-ui.md. Settings routes: owner/admin. GET /api/branding is public (pre-login, by Host).
 *
 *   GET    /api/branding                         → publicBranding (resolved from Host; used by the app shell)
 *   GET    /api/settings/branding                → brandingSettings
 *   PUT    /api/settings/branding                putBrandingBody → brandingSettings
 *   POST   /api/settings/branding/assets         multipart: kind=logo|favicon, file → brandingSettings
 *                                                (NOT in Appendix A — proposed; stored at tenants/<id>/branding/…)
 *   GET    /api/settings/domains                 → domainsResponse
 *   POST   /api/settings/domains                 addDomainBody → 201 tenantDomain (409 DOMAIN_TAKEN)
 *   POST   /api/settings/domains/:id/verify      {} → tenantDomain (re-checks DNS now; the verify job also runs)
 *   DELETE /api/settings/domains/:id             → 204
 */

/** #rrggbb — what <input type="color"> produces; any CSS colour works for the --brand token. */
export const hexColour = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a colour like #1d4ed8");

export const publicBranding = z.object({
  productName: z.string(),
  logoUrl: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  brandColor: hexColour.nullable(),
});
export type PublicBranding = z.infer<typeof publicBranding>;

export const brandingSettings = publicBranding.extend({
  emailFrom: z.string().nullable(),
  whatsappSender: z.string().nullable(),
  updatedAt: isoDateTime.nullable(),
});
export type BrandingSettings = z.infer<typeof brandingSettings>;

export const putBrandingBody = z.object({
  productName: z.string().trim().min(1, "Enter a product name").max(60),
  brandColor: hexColour.nullable(),
  /** Remove an uploaded asset by sending null; omit to keep. */
  logoUrl: z.null().optional(),
  faviconUrl: z.null().optional(),
});
export type PutBrandingBody = z.infer<typeof putBrandingBody>;

export const BRANDING_ASSET_KINDS = ["logo", "favicon"] as const;
export const MAX_BRANDING_ASSET_BYTES = 1024 * 1024; // 1 MB
export const BRANDING_ASSET_TYPES = [
  "image/png",
  "image/svg+xml",
  "image/jpeg",
  "image/webp",
  "image/x-icon",
] as const;

export const TLS_STATUSES = ["pending", "issued", "failed"] as const;
export const tenantDomain = z.object({
  id: z.uuid(),
  hostname: z.string(),
  /** Point the hostname here with a CNAME. */
  cnameTarget: z.string(),
  /** Add a TXT record `txtName` = `verificationToken` to prove ownership. */
  txtName: z.string(),
  verificationToken: z.string(),
  verifiedAt: isoDateTime.nullable(),
  tlsStatus: z.enum(TLS_STATUSES),
  lastCheckedAt: isoDateTime.nullable(),
  /** Human reason the last check failed ("CNAME points to x", "TXT record not found"). */
  lastError: z.string().nullable(),
  createdAt: isoDateTime,
});
export type TenantDomain = z.infer<typeof tenantDomain>;

export const domainsResponse = z.object({ items: z.array(tenantDomain) });

export const addDomainBody = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
      "Enter a hostname like admissions.college.edu (no https://)",
    ),
});
