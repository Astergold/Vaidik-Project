# Billing UI (D6-I4-03)

## Goal

Owners and admins see what the platform costs them and why: wallet balance (and the hard stop at zero), every ledger
movement, usage by kind and day, the current plan with included vs used, and monthly statements to download. The
numbers must match the ledger exactly (handbook: "Matches ledger").

## Status

**Screens built against a proposed contract; the billing API (D6-I2-01/02) does not exist yet**, so nothing can be
demonstrated end to end. Each section shows "Billing service not available yet" on `404 Route not found`. No data is
faked. Contract: `packages/contracts/src/billing.ts`. The statement file path `GET /api/billing/statements/:id/file
?format=csv|pdf` is proposed under Appendix A's `/billing/statements`. Top-ups happen in the platform console
(super-admin, D6-I4-01), not here.

## Users & stories

- As an owner I see the prepaid balance; at ₹0 a red **WALLET_EMPTY** banner explains that calls and WhatsApp have
  stopped and how to top up; below the low-balance threshold a warning shows.
- As an admin I read the ledger: top-ups (+), usage and plan fees (−), balance after, reference — newest first, paged.
- As an owner I pick a period and see usage by kind (call minutes, WhatsApp, analyses, SMS) as a split bar and a
  day-by-day table, with the amount charged.
- As an owner I see my plan: fee, included minutes/messages vs used this period, overage rates.
- As an admin I download last month's statement as CSV or PDF.

## Endpoints (proposed)

| Call                                                   | Response                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `GET /api/billing/wallet?cursor`                       | `walletResponse` (mode, balance, threshold, plan, current period, transactions page) |
| `GET /api/billing/usage?from&to`                       | `usageResponse` (`days[]` per day+kind, `totals[]` per kind)                         |
| `GET /api/billing/statements`                          | `statementsResponse`                                                                 |
| `GET /api/billing/statements/:id/file?format=csv\|pdf` | file (`apiGetBlob`)                                                                  |

Money: integer paise, formatted with `formatPaise`. Usage kinds: `USAGE_KINDS` from `enums.ts` (mirrors the
`usage_event.kind` CHECK).

## Tables touched

None by the UI. Backend: `wallet_transaction`, `usage_event`, `invoice_statement`, `plan`.

## Rules & edge cases

- Postpaid tenants: no balance/banner; "billed monthly with overage".
- Never compute charges client-side: amounts come from the server; the UI only sums the server's rows for display
  totals, which the test checks against `totals`.
- Dates are tenant-local; ranges are inclusive.

## Acceptance (once the API exists)

Handbook D6-I4-03: matches ledger. Checkpoint 6: wallet 0 → dial rejected `WALLET_EMPTY`; top-up → resumes.

## Out of scope

Online payments, invoice disputes, changing plans from the tenant side.
