import type {
  LeadListItem,
  LeadsFiltersResponse,
  LeadsListQuery,
  LeadsListResponse,
} from "@vernacular/contracts";
import type { Tx } from "@vernacular/db";
import { leadScope, maskPhone } from "../../guards.js";
import type { AuthContext } from "../../types.js";
import {
  countLeads,
  findFilterAgents,
  findFilterCounsellors,
  findFilterSources,
  findLeadRows,
  type LeadFilter,
} from "./repo.js";

export async function listLeads(
  tx: Tx,
  auth: AuthContext,
  query: LeadsListQuery,
): Promise<LeadsListResponse> {
  const { page, pageSize, sort, order, ...rest } = query;
  const scope = leadScope(auth);
  const filter: LeadFilter = { ...rest, scopeToUser: scope?.ownerId ?? null };

  const [total, rows] = await Promise.all([
    countLeads(tx, filter),
    findLeadRows(tx, filter, { sort, order, limit: pageSize, offset: (page - 1) * pageSize }),
  ]);

  const items: LeadListItem[] = rows.map((r) => ({
    id: r.id,
    person: {
      id: r.person_id,
      fullName: r.full_name,
      phone: maskPhone(r.phone, auth),
      city: r.city,
    },
    stage: r.stage as LeadListItem["stage"],
    subStage: r.sub_stage,
    temperature: r.temperature as LeadListItem["temperature"],
    nextStep: r.next_step as LeadListItem["nextStep"],
    nextStepDueAt: r.next_step_due_at ? r.next_step_due_at.toISOString() : null,
    owner: r.owner_id ? { id: r.owner_id, name: r.owner_name ?? "" } : null,
    aiAgent: r.agent_id ? { id: r.agent_id, displayName: r.agent_name ?? "" } : null,
    source: r.source_id ? { id: r.source_id, name: r.source_name ?? "" } : null,
    program: r.program_id ? { id: r.program_id, name: r.program_name ?? "" } : null,
    callCount: r.call_count,
    lastCallAt: r.last_call_at ? new Date(r.last_call_at).toISOString() : null,
    lastRejectCode: r.last_reject_code,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));

  return { items, page, pageSize, total };
}

/**
 * Dropdown options for the Leads list (D2-I4-03a). Mirrors leadScope(): a counsellor sees the leads they
 * own or that an AI agent allocated to them handles, so they get [self] and those agents; managers get all.
 */
export async function getLeadFilters(tx: Tx, auth: AuthContext): Promise<LeadsFiltersResponse> {
  const self = leadScope(auth)?.ownerId ?? null;
  const [sources, agents, counsellors] = await Promise.all([
    findFilterSources(tx),
    findFilterAgents(tx, self),
    findFilterCounsellors(tx, auth.tenantId, self),
  ]);
  return {
    sources: sources.map((s) => ({ id: s.id, name: s.name, isActive: s.is_active })),
    agents: agents.map((a) => ({ id: a.id, name: a.name, isActive: a.is_active })),
    counsellors: counsellors.map((c) => ({ id: c.id, name: c.name, isActive: c.banned !== true })),
  };
}
