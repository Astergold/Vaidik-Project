# Reserve-then-dial (`call.dial`) — D3-I2-03

## State machine

```
              ┌────────────── policy rejects ──────────────┐
 job runs ──► │ phase 1 (one short tx, lead row locked)    │ ─► lead.last_reject_code set; retry job scheduled at retryAt
              │  load facts → evaluate                      │    for OUTSIDE_WINDOW / TOO_SOON / CAP_REACHED(daily)
              │  allowed → INSERT call_attempt 'reserved'   │
              │            (partial unique index)           │
              │  lead new → attempting; clear reject code   │
              └──────────────── COMMIT ─────────────────────┘
 phase 2 (NO tx):  voice provider initiate-call, Idempotency-Key = call_attempt.id, initial_context
 phase 3 (short tx): call_attempt → 'dialing', dograh_run_id, started_at
```

`call_attempt` statuses used here: `reserved → dialing` (then I3's finalize: `in_progress → completed | failed | no_answer | busy`),
or `reserved → failed` with `reject_code`.

## Why a crash can never cause a second call

- At most **one active attempt per lead** (`reserved`/`dialing`/`in_progress`) — a partial unique index, plus the lead row is locked in phase 1.
- The reservation commits **before** the provider is called. If the worker dies after that, pg-boss re-delivers the **same job
  (same job id)**. The attempt stores `dial_job_id`, so the retry knows "this reservation is mine", **re-runs the policy**, and
  resumes with the **same idempotency key**. (Dial jobs are configured to expire after 60 s so a dead worker's job comes back quickly. **Not covered by an automated test**, because it needs a >60 s wait; the crash tests simulate the re-delivery by calling the job again with the same job id. Verify once on staging by killing the worker mid-dial: that is the D7 chaos test.)
- A reservation made by a **different** job and younger than 45 s means someone is dialling → `skipped ALREADY_ACTIVE`.
  Older than 45 s → resumed. Older than 6 h → marked `failed ABANDONED` and a fresh attempt is made (never resumed: provider
  idempotency keys may have expired).
- If the policy now says no (e.g. the window closed meanwhile) the reservation is failed with that code, not dialled.

Tested: 8 concurrent jobs → one attempt/one call; crash after reserve; provider placed the call but the response was lost; fresh vs
stale reservations; abandoned reservations; resume re-checking policy; end-to-end through the real worker (~0.5 s from submit to `dialing`).

## Outcomes and what happens next

| Outcome                                                      | Meaning                                                          | Retried?                                                                                                                                                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dialed`                                                     | provider accepted; attempt is `dialing`                          | –                                                                                                                                                                                                               |
| `rejected` + code                                            | policy said no; recorded on the lead (visible on Lead 360)       | `OUTSIDE_WINDOW`, `TOO_SOON`, daily `CAP_REACHED`: a `retry` job is enqueued at `retryAt`. Not for `call_now` clicks. Never for SUPPRESSED / NO_CONSENT / NDNC_* / WALLET_EMPTY / total cap / TENANT_SUSPENDED. |
| `failed` `NO_AGENT` / `NO_PHONE` / `PROVIDER_NOT_CONFIGURED` | configuration problem; no reservation made                       | no                                                                                                                                                                                                              |
| `failed` `PROVIDER_REJECTED` / `PROVIDER_AUTH`               | permanent provider error; attempt failed, lead freed             | no                                                                                                                                                                                                              |
| _(throws)_ transient provider error (timeout / 5xx)          | job retried by pg-boss (5×, backoff), reservation resumed        | yes                                                                                                                                                                                                             |
| `skipped`                                                    | lead missing / closed (enrolled, lost, invalid) / already active | no                                                                                                                                                                                                              |

## The contract with I3 (please read)

1. **Implement `VoiceDialer`** (`apps/api/src/modules/calls/dialer.ts`) in `packages/integrations/dograh` and replace
   `UnconfiguredDialer` in `apps/worker/src/index.ts` (one line). Throw `DialerError(code, msg, retryable)`: `retryable=true` for
   timeouts/5xx/network, `false` for 4xx/auth. Never put provider names in messages that can reach a tenant.
2. **Idempotency-Key must be honoured by the provider** (the D1-V-05 fork patch, due on Day 3/4). Without it, "provider placed the
   call but the response was lost" followed by a resume **can place a second call**. This is the one thing the CRM cannot guarantee alone.
3. `initial_context` is built by `buildInitialContext` (`modules/calls/context.ts`): `lead_id, person_name, program, language, stage,
last_call_summary, ai_disclosure, is_new_caller, call_attempt_id`. Use the **same function** for the inbound pre-call webhook
   (D3-I3-05) so inbound and outbound greet identically. It contains no phone/email.
4. **Linking runs to attempts:** `call_attempt_id` is in `initial_context`. Your webhook/derive/sync must look up by
   `dograh_run_id` first, then by `initial_context.call_attempt_id`, and **adopt** the reserved/dialing attempt (set `dograh_run_id`,
   status) — never insert a second attempt for the same lead while ours is active (the unique index will refuse it).
5. A stuck `dialing` attempt blocks the lead (`ALREADY_ACTIVE`). Your finalize/sync is what moves it to a final status.
6. Move stages with `moveStage(tx, { …, mode: "auto" })` (`modules/leads/stage.ts`): forward-only, never out of lost/invalid,
   writes history, idempotent. **Do not write `lead.stage` directly.**

## Seams left for later days

- Wallet/plan reservation (`loadWalletState`, "SEAM" comment in `runDial`) → D6-I2-01.
- A sweeper for attempts left `reserved` whose job dead-lettered, and recurring jobs generally → needs a schedule registry (not built).
