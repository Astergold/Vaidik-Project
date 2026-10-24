# Policy engine (packages/policy) — D3-I2-01

Pure function, no I/O, no clock, no randomness: `evaluate(action, facts, now) -> { allow: true } | { allow: false, code, retryAt? }`.
The caller loads `facts` (see `apps/api/src/modules/policy/facts.ts → loadPolicyFacts`). **Every dial, WhatsApp send and
planner action goes through it.** 58 unit tests, 100% statements / branches / functions / lines (CI fails below 100%).

## Rules, in order (first failure wins, so the reject code is deterministic)

| #   | Rule                                                                         | Code                          | `retryAt`                                                   | Applies to                           |
| --- | ---------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| 1   | tenant is active                                                             | `TENANT_SUSPENDED`            | no                                                          | all                                  |
| 2   | prepaid wallet balance > 0 (`unmetered` never blocks)                        | `WALLET_EMPTY`                | no                                                          | all                                  |
| 3   | not on the suppression list (dnd / opt_out / invalid; **not** `ndnc`)        | `SUPPRESSED`                  | no                                                          | all                                  |
| 4   | NDNC status is `clear` (if `ndnc_check`)                                     | `NDNC_LISTED`, `NDNC_UNKNOWN` | no                                                          | voice                                |
| 5   | latest consent for the channel is `granted` (if `require_consent`)           | `NO_CONSENT`                  | no                                                          | all                                  |
| 6   | local time inside window, allowed weekday, not a holiday                     | `OUTSIDE_WINDOW`              | next window opening                                         | voice; WhatsApp unless transactional |
| 7   | attempts: total < `max_attempts_total` and today < `max_attempts_per_day`    | `CAP_REACHED`                 | tomorrow's opening (daily cap only; total cap is permanent) | voice                                |
| 8   | `min_gap_minutes` since the last attempt                                     | `TOO_SOON`                    | last attempt + gap                                          | voice                                |
| 9   | promotional call needs a 140-series caller id (only if `promo_requires_140`) | `PROMO_NUMBER_REQUIRED`       | no                                                          | voice                                |
| 10  | no call already active                                                       | `CALL_IN_PROGRESS`            | no                                                          | voice                                |

Details that are easy to get wrong:

- **Window end is exclusive.** `09:00:00` is allowed, `20:59:59` is allowed, `21:00:00` is rejected.
- **Everything is judged in the tenant's timezone**, including holidays (a holiday is a _local date_) and "attempts today"
  (since local midnight). IST has no DST; other zones are handled (ambiguous and non-existent local times are tested).
- `retryAt` is the first instant strictly after `now` at which the window opens on an allowed, non-holiday day. It is
  `undefined` when no such day exists in the next 370 days, or when the window is misconfigured (start ≥ end).
- Rejections 2–5 and 9–10 never carry `retryAt`: they need a human or a state change, not time.
- A prepaid wallet check is wired but returns `unmetered` until the billing ledger exists (D6-I2-01).

## Decisions I made that need a yes from Vaidik

1. **NDNC defaults to ON, and a number that was never scrubbed is `NDNC_UNKNOWN`, which blocks the call.** That is the handbook
   default, but it means a brand-new lead from a form can **never** be called until its number is in an NDNC scrub file
   (D3-I1-04) — or the tenant sets `ndnc_check = false`. For MIT-ADT go-live this must be decided explicitly. I have not changed the default.
2. **WhatsApp:** NDNC, caps, gap, caller-id and active-call rules are voice-only. The calling window applies to marketing
   WhatsApp but not to `transactional` messages (visit reminders). The handbook table doesn't distinguish; this is my reading.
3. **Planner actions** are judged as the channel they would use (`plannerChannel`, default voice), so "planner proposal outside
   window → `OUTSIDE_WINDOW`" (checkpoint 6) works.
4. **Promotional / 140-series** is a flag only (default off). No caller-id classification exists yet, so with the flag on, every
   call would be rejected. Legal open item #1 decides this.

## Facts (what the loader provides)

`tenant{status,timezone}`, `policy`, `wallet`, `suppressed`, `ndnc`, `consent`, `holidays[]` (local dates), `attempts{today,total,lastAttemptAt}`
(excludes `reserved` rows; includes everything else, backfilled history too), `activeCall`, `promotional` (always true for
admission outreach), `callerId140` (false), optional `transactional`, `plannerChannel`.

An NDNC _suppression row_ (from the scrub-file import) counts as `listed` — it does not surface as `SUPPRESSED`.
