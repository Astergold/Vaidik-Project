import { z } from "zod";
import { isoDateTime } from "./common.js";
import { coreStage } from "./enums.js";

/**
 * Tenant settings pages (D6-I4-02): general, stages, email sender, data & privacy. PROPOSED CONTRACT — endpoints not
 * built yet. Spec: docs/specs/settings-ui.md. Roles: owner/admin. Appendix A lists /settings/{policy,holidays,
 * branding,domains,team,llm,…}; `general`, `stages`, `email` and `privacy` are NOT in Appendix A — proposed here
 * with the same /api/settings/<page> naming. Person export/erase use Appendix A's /persons endpoints.
 *
 *   GET    /api/settings/general                       → generalSettings
 *   PUT    /api/settings/general                       putGeneralBody → generalSettings
 *   GET    /api/settings/stages                        → stagesResponse
 *   POST   /api/settings/stages/sub-stages             createSubStageBody → subStage
 *   PATCH  /api/settings/stages/sub-stages/:id         { name } → subStage
 *   DELETE /api/settings/stages/sub-stages/:id         → 204 (409 SUB_STAGE_IN_USE while leads use it)
 *   PUT    /api/settings/stages/:coreStage/order       { ids } → stagesResponse
 *   GET    /api/settings/email                         → emailSettings
 *   PUT    /api/settings/email                         putEmailBody → emailSettings
 *   POST   /api/settings/email/verify                  {} → emailSettings (re-checks DNS)
 *   GET    /api/settings/privacy                       → privacySettings
 *   PUT    /api/settings/privacy                       putPrivacyBody → privacySettings
 *   GET    /api/persons/:id/export                     → application/json file (Appendix A)
 *   DELETE /api/persons/:id                            → 204 erasure: PII + identifiers deleted, billing kept (Appendix A)
 */

/* ---- general ---- */

export const admissionCycle = z.object({
  id: z.uuid(),
  name: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});
export type AdmissionCycle = z.infer<typeof admissionCycle>;

export const generalSettings = z.object({
  name: z.string(),
  /** Subdomain; changed only by Laveric. */
  slug: z.string(),
  timezone: z.string(),
  currentCycle: admissionCycle.nullable(),
});
export type GeneralSettings = z.infer<typeof generalSettings>;

export const putGeneralBody = z
  .object({
    name: z.string().trim().min(2, "Enter the institution's name").max(120),
    timezone: z.string().min(1, "Pick a timezone"),
    currentCycle: z.object({
      name: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}$/, "Use the form 2026-27"),
      startsOn: z.iso.date("Pick a start date"),
      endsOn: z.iso.date("Pick an end date"),
    }),
  })
  .refine((b) => b.currentCycle.startsOn < b.currentCycle.endsOn, {
    path: ["currentCycle"],
    message: "The cycle must end after it starts",
  });
export type PutGeneralBody = z.infer<typeof putGeneralBody>;

/* ---- stages (the 11 core stages are fixed; tenants add sub-stages) ---- */

export const subStage = z.object({
  id: z.uuid(),
  coreStage,
  name: z.string(),
  sortOrder: z.number().int(),
  /** Leads currently on it (a sub-stage in use can't be deleted). */
  leadCount: z.number().int().min(0),
});
export type SubStage = z.infer<typeof subStage>;

export const stagesResponse = z.object({
  stages: z.array(z.object({ stage: coreStage, subStages: z.array(subStage) })),
});
export type StagesResponse = z.infer<typeof stagesResponse>;

export const createSubStageBody = z.object({
  coreStage,
  name: z.string().trim().min(1, "Name the sub-stage").max(60),
});
export const patchSubStageBody = z.object({
  name: z.string().trim().min(1, "Name the sub-stage").max(60),
});
export const reorderSubStagesBody = z.object({ ids: z.array(z.uuid()).min(1) });

/* ---- email sender ---- */

export const DNS_RECORD_STATUSES = ["pending", "verified", "failed"] as const;
export const dnsRecord = z.object({
  type: z.enum(["TXT", "CNAME", "MX"]),
  host: z.string(),
  value: z.string(),
  status: z.enum(DNS_RECORD_STATUSES),
});
export type DnsRecord = z.infer<typeof dnsRecord>;

export const emailSettings = z.object({
  fromName: z.string().nullable(),
  fromAddress: z.string().nullable(),
  /** The sending domain (from fromAddress) and the DKIM/SPF records to add. Null until an address is set. */
  domain: z
    .object({
      name: z.string(),
      status: z.enum(DNS_RECORD_STATUSES),
      records: z.array(dnsRecord),
      lastCheckedAt: isoDateTime.nullable(),
    })
    .nullable(),
});
export type EmailSettings = z.infer<typeof emailSettings>;

export const putEmailBody = z.object({
  fromName: z.string().trim().min(1, "Enter the sender name").max(100),
  fromAddress: z.email("Enter an address like admissions@college.edu"),
});

/* ---- data & privacy (DPDP) ---- */

export const RETENTION_CHOICES = [null, 365, 730, 1095, 1825] as const;
export const privacySettings = z.object({
  /** Days after a lead's last activity before PII is purged; null = keep until erased by hand. */
  retentionDays: z.number().int().min(30).nullable(),
  lastPurgeAt: isoDateTime.nullable(),
  nextPurgeAt: isoDateTime.nullable(),
});
export type PrivacySettings = z.infer<typeof privacySettings>;
export const putPrivacyBody = z.object({
  retentionDays: z.number().int().min(30, "At least 30 days").max(3650).nullable(),
});
