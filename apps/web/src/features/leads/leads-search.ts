import {
  CORE_STAGES,
  LEAD_SORT_FIELDS,
  TEMPERATURES,
  type CoreStage,
  type Temperature,
} from "@vernacular/contracts";
import type { QueryValue } from "@/lib/api";
import {
  optionalDate,
  optionalEnum,
  optionalInt,
  optionalList,
  optionalString,
  optionalUuidList,
} from "@/lib/search";

/**
 * /leads URL state (D2-I4-03). The URL is the single source of truth for page, sort, search and
 * filters, so a filtered view can be shared or reloaded. Everything optional; defaults below.
 */
export type LeadSort = (typeof LEAD_SORT_FIELDS)[number];
export const PAGE_SIZES = [10, 25, 50, 100] as const;

export interface LeadsSearch {
  page?: number;
  pageSize?: number;
  sort?: LeadSort;
  order?: "asc" | "desc";
  q?: string;
  stage?: CoreStage[];
  temperature?: Temperature[];
  createdFrom?: string;
  createdTo?: string;
  /** D2-I4-03b: ids from GET /api/leads/filters. */
  sourceId?: string[];
  agentId?: string[];
  counsellorId?: string[];
}

export const LEADS_DEFAULTS = { page: 1, pageSize: 25, sort: "created_at", order: "desc" } as const;

export function validateLeadsSearch(s: Record<string, unknown>): LeadsSearch {
  const pageSize = optionalInt(s.pageSize, 1, 100);
  return {
    page: optionalInt(s.page, 1, 100_000),
    pageSize: PAGE_SIZES.find((p) => p === pageSize),
    sort: optionalEnum(s.sort, LEAD_SORT_FIELDS),
    order: optionalEnum(s.order, ["asc", "desc"] as const),
    q: optionalString(s.q)?.slice(0, 100),
    stage: optionalList(s.stage, CORE_STAGES),
    temperature: optionalList(s.temperature, TEMPERATURES),
    createdFrom: optionalDate(s.createdFrom),
    createdTo: optionalDate(s.createdTo),
    sourceId: optionalUuidList(s.sourceId),
    agentId: optionalUuidList(s.agentId),
    counsellorId: optionalUuidList(s.counsellorId),
  };
}

/** URL state → `GET /api/leads` query (matches `leadsListQuery` in contracts). */
export function toLeadsApiQuery(s: LeadsSearch): Record<string, QueryValue> {
  const q = s.q?.trim();
  return {
    page: s.page ?? LEADS_DEFAULTS.page,
    pageSize: s.pageSize ?? LEADS_DEFAULTS.pageSize,
    sort: s.sort ?? LEADS_DEFAULTS.sort,
    order: s.order ?? LEADS_DEFAULTS.order,
    q: q ? q : undefined,
    stage: s.stage,
    temperature: s.temperature,
    createdFrom: s.createdFrom,
    createdTo: s.createdTo,
    sourceId: s.sourceId,
    agentId: s.agentId,
    counsellorId: s.counsellorId,
  };
}

/** Any filter change goes back to page 1 (the old page may not exist under the new filter). */
export const applyFilter = (prev: LeadsSearch, patch: Partial<LeadsSearch>): LeadsSearch => ({
  ...prev,
  page: undefined,
  ...patch,
});

export const hasLeadFilters = (s: LeadsSearch) =>
  Boolean(
    s.q?.trim() ||
    s.stage?.length ||
    s.temperature?.length ||
    s.createdFrom ||
    s.createdTo ||
    s.sourceId?.length ||
    s.agentId?.length ||
    s.counsellorId?.length,
  );

/** Clicking a header: same column flips the order; a new column starts at its natural order. */
export function nextSort(
  s: LeadsSearch,
  field: LeadSort,
): Pick<LeadsSearch, "sort" | "order" | "page"> {
  const current = s.sort ?? LEADS_DEFAULTS.sort;
  const order = s.order ?? LEADS_DEFAULTS.order;
  if (current === field)
    return { sort: field, order: order === "asc" ? "desc" : "asc", page: undefined };
  return { sort: field, order: field === "full_name" ? "asc" : "desc", page: undefined };
}

/** "Showing 26–50 of 140" numbers. */
export function pageRange(page: number, pageSize: number, total: number) {
  if (total === 0) return { from: 0, to: 0, lastPage: 1 };
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  return { from: Math.min(from, total), to: Math.min(page * pageSize, total), lastPage };
}
