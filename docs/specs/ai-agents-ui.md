# AI agents UI (D4-I4-04)

## Goal

Owners and admins manage their institution's AI calling agents under tenant-facing names — display name, language,
voice, active — and allocate counsellors to each agent (a counsellor sees the leads of the agents allocated to them).
Nothing about the voice provider is ever shown.

## Status

**Built against a proposed contract; the agents API (D4-I2-02) is pending.** Contract:
`packages/contracts/src/agents.ts`. Until it exists `GET /api/agents` answers `404 Route not found` and the page says
"Agent service not available yet" — no example agent is ever shown. Counsellor options already come from the real
`GET /api/leads/filters`.

## Users & stories

- As an admin I see each agent's name, language, voice, whether it's active and which counsellors it feeds.
- As an admin I create an agent from a voice workflow template, rename it, switch it off, and allocate counsellors.
- As an admission head I can see all of this but not change it.

## Endpoints (proposed)

| Call                              | Body → response                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /api/agents`                 | → `agentsListResponse { items: agent[] }` (owner/admin/head)                                           |
| `POST /api/agents`                | `createAgentBody` → 201 `agent` (owner/admin)                                                          |
| `PATCH /api/agents/:id`           | `patchAgentBody` → `agent` (owner/admin)                                                               |
| `PUT /api/agents/:id/counsellors` | `putAgentCounsellorsBody { counsellorIds }` (replaces the list) → `agent`                              |
| `GET /api/agents/workflows`       | → `{ items: workflowOption[] }` — the tenant's voice workflow templates, `label` sanitised server-side |

## Tables touched (by the backend)

`ai_agent` (`display_name`, `language`, `voice`, `is_active`, the provider workflow column), `ai_agent_counsellor`.
The migration says of the provider workflow column: _"internal only, never returned by any API"_
(`20261006000400_catalog_sources_agents.sql`). The contract therefore has no such field: `agent` is exactly
`{ id, displayName, language, voice, isActive, counsellors[{ id, name }] }`, and a workflow is chosen through an opaque
`workflowOption.id` that the server maps to its internal id.

## Rules & edge cases

- White-label: no provider name, id or URL in the UI source or the rendered page. The workflow selector is labelled
  "Voice workflow template" and shows `label` only; its option values in the DOM are list positions, so even the opaque
  option id never reaches the page.
- Roles: owner/admin create, edit, toggle and allocate; admission head gets a read-only view (no buttons that would
  403). The API enforces it regardless.
- Mutations replace the cached agent with the server's response (never optimistic).
- Counsellor options: `GET /api/leads/filters` `counsellors[]`. Allocation saves the full selected id list.

## Acceptance tests

Handbook D4-I4-04: agents listed with tenant-facing names (never provider names/ids), language, allocated counsellors,
active toggle; grep: no "dograh" in rendered HTML. Own: `AgentsPage.test.tsx` (fields; loading/empty/error/not
available; allocation PUT body + chips from the response; white-label DOM checks; head vs admin), 1440/390 screenshots.

## Out of scope

Workflow editing (done in the voice platform by Laveric), per-agent analytics, deleting agents (deactivate instead).
