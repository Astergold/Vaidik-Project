import { plan, platformTenant } from "@vernacular/contracts";

/** TEST fixtures for the platform console, parsed with the proposed contract (the app never fabricates data). */
export const TENANT_ID = "01a14679-0000-7000-8000-0000000007a1";
export const PLAN_ID = "01a14679-0000-7000-8000-0000000007b1";

export const tenantFixture = (over: object = {}) =>
  platformTenant.parse({
    id: TENANT_ID,
    name: "Demo College",
    slug: "demo-college",
    status: "active",
    suspendedReason: null,
    timezone: "Asia/Kolkata",
    plan: { id: PLAN_ID, name: "Starter" },
    billingMode: "prepaid",
    walletBalancePaise: 1_250_050,
    usageThisMonth: { callMinutes: 1234.6, whatsappMessages: 560 },
    ownerEmail: "owner@demo.local",
    voiceEngineConnected: true,
    createdAt: "2026-10-01T05:00:00.000Z",
    ...over,
  });

export const planFixture = (over: object = {}) =>
  plan.parse({
    id: PLAN_ID,
    name: "Starter",
    billingMode: "prepaid",
    monthlyFeePaise: 1_500_000,
    includedMinutes: 2000,
    includedWhatsapp: 1000,
    overage: { callMinutePaise: 250, whatsappPaise: 80, analystRunPaise: 150 },
    seatLimit: 10,
    isActive: true,
    tenantCount: 3,
    ...over,
  });
