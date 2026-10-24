import { walletResponse } from "@vernacular/contracts";

/** TEST fixtures for billing, parsed with the proposed contract (the app never fabricates data). */
export const walletFixture = (over: object = {}) =>
  walletResponse.parse({
    billingMode: "prepaid",
    balancePaise: 1_250_050,
    lowBalanceThresholdPaise: 200_000,
    plan: {
      id: "01a14679-0000-7000-8000-0000000007b1",
      name: "Starter",
      monthlyFeePaise: 1_500_000,
      includedMinutes: 2000,
      includedWhatsapp: 1000,
      overage: { callMinutePaise: 250, whatsappPaise: 80, analystRunPaise: 150 },
    },
    currentPeriod: { from: "2026-10-01", to: "2026-10-31", usedMinutes: 1500, usedWhatsapp: 1200 },
    transactions: [
      { id: "01a14679-0000-7000-8000-000000000fa1", at: "2026-10-16T05:00:00.000Z", kind: "usage", amountPaise: -2_500, balanceAfterPaise: 1_250_050, reference: "call_minute", createdBy: null },
      { id: "01a14679-0000-7000-8000-000000000fa2", at: "2026-10-10T05:00:00.000Z", kind: "top_up", amountPaise: 1_000_000, balanceAfterPaise: 1_252_550, reference: "UTR123", createdBy: "Laveric Admin" },
    ],
    nextCursor: null,
    ...over,
  });
