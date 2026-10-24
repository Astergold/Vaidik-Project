# Programs & knowledge base admin (D4-I4-03)

## Goal

An admin enters the institution's programs (fees, seat availability as a bucket, deadlines, eligibility) and writes
the knowledge-base articles the AI agents answer from — without a developer.

## Status

**Built against a proposed contract; the backend (D4-I2-01) is pending.** Contract:
`packages/contracts/src/programs.ts`. `crm.program` exists (`name`, `code`, `is_active`) and is mirrored; fees, seats,
deadlines, eligibility and `kb_document` are Day-4 tables — their shapes and enums here are proposals the migration must
match (change them here in that PR). Until then every screen says "not available yet"; nothing is faked.

## Users & stories

- As an admin I add "B.Tech Computer Science" with its tuition and hostel fees for 2026-27, mark seats as Limited, set
  the application deadline and write the eligibility rule.
- As an admin I write and edit Markdown articles (hostel, scholarships, placements), tag them, link them to a program,
  and search them to see the snippet the agent would quote.
- As an admission head I can read all of it but not change it.

## Endpoints (proposed)

| Call                                                                                  | Body → response                                                                                                          |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/programs`                                                                   | → `programsListResponse { items: programDetail[] }` (catalogues are small; one call)                                     |
| `POST /api/programs` · `PATCH /api/programs/:id` · `DELETE /api/programs/:id`         | `createProgramBody` / `patchProgramBody` → `programDetail`; DELETE → 204                                                 |
| `POST /api/programs/:id/fees` · `DELETE /api/programs/:id/fees/:feeId`                | `createFeeBody` → `programDetail`                                                                                        |
| `PUT /api/programs/:id/seat`                                                          | `putSeatBody { academicYear, bucket }` → `programDetail`                                                                 |
| `POST /api/programs/:id/deadlines` · `DELETE /api/programs/:id/deadlines/:deadlineId` | `createDeadlineBody` → `programDetail`                                                                                   |
| `PUT /api/programs/:id/eligibility`                                                   | `putEligibilityBody { summary, minimums[] }` → `programDetail`                                                           |
| `GET /api/kb?q&tag&programId`                                                         | → `kbSearchResponse { items: [{ id, title, snippet, tags, programId }] }` (Postgres `tsvector`; snippet from the server) |
| `GET /api/kb/:id` · `POST /api/kb` · `PATCH /api/kb/:id` · `DELETE /api/kb/:id`       | `kbDocument` CRUD                                                                                                        |

Roles: everyone in the sitemap's Programs area (owner/admin/admission head) reads; owner/admin write.

## Rules

- **Seats are a bucket, never a number** (`open | limited | closed`): the agent only ever says "seats are filling up",
  never a count (handbook §7.4 / `check_seat_and_deadline`). The UI has no numeric seat field anywhere.
- Fees: amount in rupees (integer), currency `INR`, academic year `YYYY-YY`, kind `tuition | hostel | application |
other`. Deadlines: kind `application | fee_payment | documents | admission_close`, date in the tenant timezone.
- Markdown preview uses a small dependency-free renderer (`features/programs/markdown.ts`): headings, bold/italic,
  inline code, links (http/https/mailto only), lists, paragraphs. It builds React elements — raw HTML in an article is
  shown as text, never executed, and there is no `dangerouslySetInnerHTML`.
- The program editor is a side sheet on `/programs` (no new route). The seat/deadline matrix is D6-I4-04.
- Mutations replace the cached program/article with the server's response.

## Acceptance

Handbook D4-I4-03: MIT-ADT data can be entered by an admin (once D4-I2-01 lands). UI: program create/edit with fee,
bucket, deadline and eligibility; KB create, preview, search with snippets, tag filter; head read-only; loading / empty
/ error / not-available; 1440 / 390 px.

## Out of scope

Extraction rules (`/api/settings/extraction-rules`, D4-I1-02): no Appendix B row or sitemap page — needs one first.
Seat/deadline matrix (D6-I4-04). Rich-text editing, images in articles, article versioning.
