import type { PolicyAction } from "@vernacular/contracts";

/** Per-tenant rules. Mirrors crm.tenant_policy (times as "HH:MM"). */
export interface TenantPolicy {
  callWindowStart: string;
  /** EXCLUSIVE: 21:00 is rejected, 20:59 is allowed. */
  callWindowEnd: string;
  /** ISO weekdays: 1 = Mon ... 7 = Sun */
  allowedDays: number[];
  maxAttemptsPerDay: number;
  maxAttemptsTotal: number;
  minGapMinutes: number;
  requireConsent: boolean;
  ndncCheck: boolean;
  promoRequires140: boolean;
}

/** Handbook §7.3 defaults. */
export const DEFAULT_POLICY: TenantPolicy = {
  callWindowStart: "09:00",
  callWindowEnd: "21:00",
  allowedDays: [1, 2, 3, 4, 5, 6],
  maxAttemptsPerDay: 3,
  maxAttemptsTotal: 8,
  minGapMinutes: 60,
  requireConsent: true,
  ndncCheck: true,
  promoRequires140: false,
};

export type WalletState =
  | { mode: "unmetered" } // postpaid / plan with overage / not configured yet: never blocks
  | { mode: "prepaid"; balance: number };

export type ConsentState = "granted" | "revoked" | "none";
export type NdncState = "clear" | "listed" | "unknown";
export type Channel = "voice" | "whatsapp";

/**
 * Everything the engine needs, already loaded by the caller. The engine does no I/O,
 * so every rule is unit-testable with plain objects.
 */
export interface PolicyFacts {
  tenant: { status: string; timezone: string };
  policy: TenantPolicy;
  wallet: WalletState;
  /** Identifier is on the suppression list for dnd / opt_out / invalid (NOT ndnc: see `ndnc`). */
  suppressed: boolean;
  ndnc: NdncState;
  /** Latest consent for this channel + purpose. */
  consent: ConsentState;
  /** Tenant holidays as local dates, YYYY-MM-DD. */
  holidays: string[];
  attempts: { today: number; total: number; lastAttemptAt: Date | null };
  activeCall: boolean;
  /** Marketing/admission outreach (as opposed to e.g. a visit-booking reminder). */
  promotional: boolean;
  callerId140: boolean;
  /** WhatsApp only: service messages (visit reminders) are exempt from window / NDNC. */
  transactional?: boolean;
  /** action = "planner": which channel the proposed action would use. Default voice. */
  plannerChannel?: Channel;
}

export type { PolicyAction };
