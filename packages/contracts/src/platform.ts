import { z } from "zod";
import { idRef, isoDateTime } from "./common.js";

/**
 * Platform console (D6-I4-01 UI ↔ D6-I3-01/02 tenants + impersonation, D6-I2-01 plans, D6-I1 health).
 * PROPOSED CONTRACT — endpoints not built yet. Spec: docs/specs/platform-console.md. Role: super-admin only
 * (user.is_platform_admin), except GET/DELETE /api/platform/impersonate which the impersonated session also calls.
 *
 *   GET    /api/platform/tenants              ?q&status → platformTenantsResponse
 *   POST   /api/platform/tenants              createTenantBody → 201 createTenantResponse
 *   POST   /api/platform/tenants/:id/suspend  suspendTenantBody → platformTenant
 *   POST   /api/platform/tenants/:id/activate {} → platformTenant
 *   POST   /api/platform/tenants/:id/top-up   topUpBody → platformTenant          (NOT in Appendix A — proposed)
 *   POST   /api/platform/impersonate          startImpersonationBody → impersonationSession (30 min, audit-logged)
 *   GET    /api/platform/impersonate          → currentImpersonationResponse
 *   DELETE /api/platform/impersonate          → 204 (back to the super-admin session)
 *   GET    /api/platform/plans                → plansResponse
 *   POST   /api/platform/plans                planBody → 201 plan
 *   PATCH  /api/platform/plans/:id            planBody.partial() → plan
 *   GET    /api/platform/health               → platformHealth
 *   GET    /api/admin/audit-log               auditLogQuery → auditLogResponse (cross-tenant)
 *
 * Money is integer paise everywhere (₹1 = 100) so ledger maths never rounds.
 */

export const BILLING_MODES = ["prepaid", "postpaid"] as const;
export const billingMode = z.enum(BILLING_MODES);
export type BillingMode = z.infer<typeof billingMode>;

export const paise = z.number().int();

export const platformTenant = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(["active", "suspended"]),
  suspendedReason: z.string().nullable(),
  timezone: z.string(),
  plan: idRef.nullable(),
  billingMode,
  /** Prepaid wallet balance; null for postpaid tenants. */
  walletBalancePaise: paise.nullable(),
  usageThisMonth: z.object({
    callMinutes: z.number().min(0),
    whatsappMessages: z.number().int().min(0),
  }),
  ownerEmail: z.string().nullable(),
  /** Whether the voice engine org is mapped (never its id or key). */
  voiceEngineConnected: z.boolean(),
  createdAt: isoDateTime,
});
export type PlatformTenant = z.infer<typeof platformTenant>;

export const platformTenantsResponse = z.object({ items: z.array(platformTenant) });

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const createTenantBody = z.object({
  name: z.string().trim().min(2, "Enter the institution's name").max(120),
  /** Subdomain: <slug>.laveric.com. */
  slug: z
    .string()
    .trim()
    .regex(
      SLUG_PATTERN,
      "3–40 lowercase letters, digits or hyphens; not starting or ending with a hyphen",
    ),
  timezone: z.string().min(1, "Pick a timezone"),
  planId: z.uuid("Pick a plan"),
  billingMode,
  /** Voice engine org: create a new one through its API, or paste an existing org's id + key. */
  voiceEngine: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("create") }),
    z.object({
      mode: z.literal("existing"),
      orgId: z.string().trim().min(1, "Enter the Voice Engine Org ID").max(200),
      apiKey: z.string().trim().min(8, "Enter the Voice Engine key").max(500),
    }),
  ]),
  ownerEmail: z.email("Enter the owner's email").transform((e) => e.trim().toLowerCase()),
  ownerName: z.string().trim().max(120).optional(),
});
export type CreateTenantBody = z.input<typeof createTenantBody>;

export const createTenantResponse = z.object({
  tenant: platformTenant,
  ownerInvited: z.boolean(),
  /** What was copied from the defaults. */
  setup: z.object({
    policy: z.boolean(),
    stages: z.boolean(),
    starterAgent: z.boolean(),
  }),
});
export type CreateTenantResponse = z.infer<typeof createTenantResponse>;

export const suspendTenantBody = z.object({
  reason: z.string().trim().min(3, "Say why (it's audit-logged)").max(500),
});
export const topUpBody = z.object({
  amountPaise: paise.min(100, "At least ₹1").max(100_000_000),
  reference: z.string().trim().min(1, "Add a payment reference").max(200),
});

/* ---- impersonation ---- */

export const startImpersonationBody = z.object({
  tenantId: z.uuid(),
  /** Defaults to the tenant's owner. */
  userId: z.uuid().optional(),
  reason: z.string().trim().min(5, "Say why (at least 5 characters; it's audit-logged)").max(500),
});
export const impersonationSession = z.object({
  tenant: idRef,
  user: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
  reason: z.string(),
  startedAt: isoDateTime,
  /** Auto-expires 30 min after start. */
  expiresAt: isoDateTime,
});
export type ImpersonationSession = z.infer<typeof impersonationSession>;
export const currentImpersonationResponse = z.object({ session: impersonationSession.nullable() });

/* ---- plans ---- */

export const plan = z.object({
  id: z.uuid(),
  name: z.string(),
  billingMode,
  monthlyFeePaise: paise.min(0),
  includedMinutes: z.number().int().min(0),
  includedWhatsapp: z.number().int().min(0),
  overage: z.object({
    callMinutePaise: paise.min(0),
    whatsappPaise: paise.min(0),
    analystRunPaise: paise.min(0),
  }),
  /** Max active team members; null = unlimited. */
  seatLimit: z.number().int().min(1).nullable(),
  isActive: z.boolean(),
  tenantCount: z.number().int().min(0),
});
export type Plan = z.infer<typeof plan>;
export const plansResponse = z.object({ items: z.array(plan) });

export const planBody = plan.omit({ id: true, tenantCount: true }).extend({
  name: z.string().trim().min(1, "Name the plan").max(80),
});
export type PlanBody = z.infer<typeof planBody>;

/* ---- health ---- */

export const platformHealth = z.object({
  generatedAt: isoDateTime,
  queues: z.array(
    z.object({
      name: z.string(),
      queued: z.number().int().min(0),
      active: z.number().int().min(0),
      failed24h: z.number().int().min(0),
      oldestQueuedAt: isoDateTime.nullable(),
    }),
  ),
  /** Daily parity between the voice engine's runs and our call attempts, per tenant. */
  syncHealth: z.array(
    z.object({
      tenant: idRef,
      date: z.iso.date(),
      engineRuns: z.number().int().min(0),
      crmAttempts: z.number().int().min(0),
    }),
  ),
  recentErrors: z.array(
    z.object({
      id: z.string(),
      queue: z.string(),
      tenant: idRef.nullable(),
      /** Sanitised message (no provider names, URLs or secrets). */
      message: z.string(),
      attempts: z.number().int().min(1),
      failedAt: isoDateTime,
    }),
  ),
});
export type PlatformHealth = z.infer<typeof platformHealth>;

/* ---- audit log ---- */

export const auditLogQuery = z.object({
  tenantId: z.uuid().optional(),
  /** Free text over action, entity, actor name/email. */
  q: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const auditEntry = z.object({
  id: z.uuid(),
  at: isoDateTime,
  tenant: idRef.nullable(),
  actor: idRef.nullable(),
  /** Set when a super-admin did this while impersonating `actor`. */
  impersonator: idRef.nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  diff: z.unknown().nullable(),
  ip: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntry>;
export const auditLogResponse = z.object({
  items: z.array(auditEntry),
  nextCursor: z.string().nullable(),
});
export type AuditLogResponse = z.infer<typeof auditLogResponse>;
