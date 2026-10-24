import { z } from "zod";
import { idRef, isoDateTime } from "./common.js";
import { usageKind } from "./enums.js";
import { billingMode, paise } from "./platform.js";

/**
 * Tenant billing page (D6-I4-03 UI ↔ D6-I2-01 ledger, D6-I2-02 statements). PROPOSED CONTRACT — endpoints not built
 * yet. Spec: docs/specs/billing-ui.md. Roles: owner/admin (top-ups are super-admin, on the platform console).
 * Money is integer paise; `usage_event` is the single ledger, so the page must match it exactly.
 *
 *   GET /api/billing/wallet                       ?cursor → walletResponse (balance, plan, period, transactions page)
 *   GET /api/billing/usage                        ?from&to (YYYY-MM-DD, tenant-local) → usageResponse
 *   GET /api/billing/statements                   → statementsResponse
 *   GET /api/billing/statements/:id/file          ?format=csv|pdf → the file (NOT in Appendix A by this exact path —
 *                                                 proposed under Appendix A's /billing/statements)
 */

export const WALLET_TX_KINDS = ["top_up", "usage", "plan_fee", "adjustment"] as const;

export const walletTransaction = z.object({
  id: z.uuid(),
  at: isoDateTime,
  kind: z.enum(WALLET_TX_KINDS),
  /** + top-up / adjustment in, - usage / plan fee out. */
  amountPaise: paise,
  balanceAfterPaise: paise,
  /** Top-up payment reference, or the usage kind for usage rows. */
  reference: z.string().nullable(),
  createdBy: z.string().nullable(),
});
export type WalletTransaction = z.infer<typeof walletTransaction>;

export const billingPlan = idRef.extend({
  monthlyFeePaise: paise,
  includedMinutes: z.number().int().min(0),
  includedWhatsapp: z.number().int().min(0),
  overage: z.object({
    callMinutePaise: paise,
    whatsappPaise: paise,
    analystRunPaise: paise,
  }),
});

export const walletResponse = z.object({
  billingMode,
  /** Prepaid balance; null for postpaid. At or below 0 every billable action is rejected with WALLET_EMPTY. */
  balancePaise: paise.nullable(),
  /** A low-balance notification is sent below this. */
  lowBalanceThresholdPaise: paise.nullable(),
  plan: billingPlan.nullable(),
  currentPeriod: z.object({
    from: z.iso.date(),
    to: z.iso.date(),
    usedMinutes: z.number().min(0),
    usedWhatsapp: z.number().int().min(0),
  }),
  transactions: z.array(walletTransaction),
  nextCursor: z.string().nullable(),
});
export type WalletResponse = z.infer<typeof walletResponse>;

export const usageRow = z.object({
  date: z.iso.date(),
  kind: usageKind,
  /** Minutes for call_minute; count otherwise. */
  quantity: z.number().min(0),
  amountPaise: paise,
});
export const usageResponse = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  /** One row per day and kind with any usage (days without usage are omitted). */
  days: z.array(usageRow),
  totals: z.array(usageRow.omit({ date: true })),
});
export type UsageResponse = z.infer<typeof usageResponse>;

export const STATEMENT_FORMATS = ["csv", "pdf"] as const;
export const statement = z.object({
  id: z.uuid(),
  /** "2026-09" */
  period: z.string().regex(/^\d{4}-\d{2}$/),
  totals: z.object({
    planFeePaise: paise,
    usagePaise: paise,
    overagePaise: paise,
    topUpsPaise: paise,
    totalDuePaise: paise,
  }),
  createdAt: isoDateTime,
  formats: z.array(z.enum(STATEMENT_FORMATS)),
});
export type Statement = z.infer<typeof statement>;
export const statementsResponse = z.object({ items: z.array(statement) });
