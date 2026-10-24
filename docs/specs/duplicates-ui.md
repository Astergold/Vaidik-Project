# Duplicates review (D6-I4-04c)

## Goal

The nightly detector flags people who are probably the same student (same phone, shared email, same application no.,
similar name + phone). A manager compares them side by side and merges — keeping every call — or dismisses the pair.

## Status

**Built against a proposed contract; the duplicate list and merge (D6-I3-05) don't exist yet.** The page shows
"Duplicates service not available yet" on `404 Route not found`. Nothing is faked. Contract:
`packages/contracts/src/duplicates.ts`. `POST /api/persons/merge` is in Appendix A; `GET /api/duplicates` and
`POST /api/duplicates/:id/dismiss` are **not** (proposed).

## Users & stories

- As an admission head I see "Asha Rao" and "Asha R." flagged for the same phone, compare their identifiers, leads,
  calls and last activity, keep the one with the application, and merge.
- As an admin I dismiss a pair that are siblings sharing a parent's number.
- As a counsellor I can see suspected duplicates among my leads but merging is left to managers.

## Endpoints (proposed)

| Call                               | Body / response                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /api/duplicates?cursor`       | → `duplicatesResponse` (open candidates: reason, score, both people with identifiers, leads, call count) |
| `POST /api/duplicates/:id/dismiss` | `{ reason? }` → `{ id, status: "dismissed" }`                                                            |
| `POST /api/persons/merge`          | `{ candidateId, survivorId, mergedId }` → `mergeResult` (`moved.{leads,calls,identifiers,notes}`)        |

## Rules & edge cases

- Never merged client-side: the UI only sends which person survives; the server moves everything (§6.1) and logs both
  ids. The confirm dialog states that calls are kept and the other record is folded in.
- The pair leaves the list only after the server confirms; the merge result counts are shown.
- Default survivor: the person with more leads, then more calls (a suggestion; the user can switch).
- Phones as received (masked for counsellors by the server).

## Acceptance (once the API exists)

Handbook D6-I3-05: merge keeps all calls and logs both IDs. D6-I4-04: duplicate review queue with an e2e smoke test.

## Out of scope

Merging more than two people at once, un-merge.
