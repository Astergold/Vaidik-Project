# Settings UI (D6-I4-02)

## Goal

Owners and admins run their institution's account themselves: name, timezone and admission cycle; calling policy and
holidays; sub-stages; branding with an instant live preview; custom domains; team invites, roles and allocation; email
sender; LLM provider and custom extraction rules; data retention, export and erasure. Everyone edits their own profile.

## Status

- **Live (real API):** `/settings/policy` — `GET/PUT /api/settings/policy`, `GET/POST /api/settings/holidays`,
  `DELETE /api/settings/holidays/:id` (Day 3, `policy-settings.ts`). `/profile` — `GET /api/me` plus Better Auth's
  `POST /api/auth/update-user` and `POST /api/auth/change-password` (mounted at `/api/auth/*`).
- **Behind the 404 seam (proposed contracts, nothing faked):** general, stages, branding, domains, team, email, LLM,
  extraction rules, privacy. Each page shows "… service not available yet" on `404 Route not found`. Contracts:
  `packages/contracts/src/{tenant-settings,branding,team,llm}.ts`. Not in Appendix A (proposed with the same naming):
  `/api/settings/{general,stages,email,privacy}`, `POST /api/settings/branding/assets`.
- Team management stays behind the seam even though Better Auth's organization endpoints exist: those don't write the
  CRM audit log or enforce plan seat limits.

## Users & stories

- As an owner I fix the institution name, timezone and the current admission cycle (e.g. 2026-27, Jun–May).
- As an admin I set calling hours, allowed days, attempt caps, minimum gap, consent/NDNC/140-series flags and the AI
  disclosure line, and add holidays — the dialler obeys them immediately.
- As an admin I add sub-stages under a core stage ("Interested → Waiting for JEE result"), rename, reorder, delete
  unused ones.
- As an owner I change the product name, colour and logo and see the whole app recolour **instantly** before saving.
- As an owner I add `admissions.college.edu`, follow the CNAME + TXT instructions, press Verify, and see verified + TLS.
- As an owner I invite a counsellor, change roles, deactivate someone, see seats used of the plan's limit, and
  allocate counsellors to AI agents.
- As an admin I set the email sender and copy the DNS records; pick the LLM provider/model and store its key
  (write-only); add extraction rules (field key, label, type, enum values, instruction, quote required).
- As an owner I choose a retention period, export one person's data, or erase a person (typed confirmation).

## Endpoints

Live: see Status. Proposed (owner/admin):

| Area     | Calls                                                                                                                                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General  | `GET/PUT /api/settings/general`                                                                                                                                                                                                           |
| Stages   | `GET /api/settings/stages`, `POST /api/settings/stages/sub-stages`, `PATCH/DELETE …/sub-stages/:id`, `PUT /api/settings/stages/:coreStage/order`                                                                                          |
| Branding | `GET /api/branding` (public), `GET/PUT /api/settings/branding`, `POST /api/settings/branding/assets` (multipart)                                                                                                                          |
| Domains  | `GET/POST /api/settings/domains`, `POST …/:id/verify`, `DELETE …/:id`                                                                                                                                                                     |
| Team     | `GET /api/settings/team`, `POST/DELETE /api/settings/team/invitations[/:id]`, `PATCH /api/settings/team/members/:userId`, `POST …/members/:userId/deactivate\|reactivate`; allocation via `PUT /api/agents/:id/counsellors` (D4 contract) |
| Email    | `GET/PUT /api/settings/email`, `POST /api/settings/email/verify`                                                                                                                                                                          |
| LLM      | `GET/PUT /api/settings/llm`, `GET/POST /api/settings/extraction-rules`, `PATCH/DELETE …/:id`                                                                                                                                              |
| Privacy  | `GET/PUT /api/settings/privacy`, `GET /api/persons/:id/export`, `DELETE /api/persons/:id`                                                                                                                                                 |

## Tables touched

None by the UI. Backend: `tenant`, `admission_cycle`, `tenant_policy`, `tenant_holiday`, `lead_sub_stage`,
`tenant_branding`, `tenant_domain`, `member`/`invitation`, `ai_agent_counsellor`, `tenant_secret`,
`llm_provider_config`, `tenant_extraction_rules`, `person*`.

## Rules & edge cases

- Live preview: the branding form writes a **preview** into `BrandingProvider` (no request); leaving the page or
  Cancel restores the saved branding; Save sends one PUT and the provider then shows the server's values.
- `BrandingProvider` reads `GET /api/branding`; a missing route (404) or error keeps the defaults.
- Policy form mirrors `policySettingsBody` (window start < end, per-day ≤ total, unique days); 422 details map to fields.
- Secrets (LLM key) are write-only: the page shows "Key stored" and never the key.
- Erasure needs the person's name typed exactly; export downloads JSON via `apiGetBlob`.
- Every page: loading, empty, error, not-available states; no horizontal scroll at 390 px.

## Acceptance

Handbook D6-I4-02: settings pages with live preview; domain add + verification status; team invite/roles/allocation;
changes reflect instantly on the tenant host (needs D6-I1-01). Policy works live today.

## Out of scope

Starting a new admission cycle, per-stage automation, email template editing, LLM spend limits.
