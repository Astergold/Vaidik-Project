import { APPLICATION_STATUSES, type ApplicationStatus } from "@vernacular/contracts";
import type { QueryValue } from "@/lib/api";
import {
  optionalDate,
  optionalEnum,
  optionalList,
  optionalString,
  optionalUuidList,
} from "@/lib/search";

/**
 * /applications URL state (D5-I4-01). The URL is the source of truth, so a filtered view ("Fee paid") survives
 * reload and can be shared — that's what makes "who has paid" two clicks: Applications → Fee paid.
 */
export const PAID_FILTERS = ["yes", "no"] as const;
export type PaidFilter = (typeof PAID_FILTERS)[number];

export interface ApplicationsSearch {
  status?: ApplicationStatus[];
  programId?: string[];
  paid?: PaidFilter;
  from?: string;
  to?: string;
  q?: string;
}

export function validateApplicationsSearch(s: Record<string, unknown>): ApplicationsSearch {
  return {
    status: optionalList(s.status, APPLICATION_STATUSES),
    programId: optionalUuidList(s.programId),
    paid: optionalEnum(s.paid, PAID_FILTERS),
    from: optionalDate(s.from),
    to: optionalDate(s.to),
    q: optionalString(s.q)?.trim().slice(0, 100) || undefined,
  };
}

export const PAGE_LIMIT = 50;

/** URL state → GET /api/applications query (contract names). */
export function toApplicationsQuery(s: ApplicationsSearch): Record<string, QueryValue> {
  return {
    status: s.status,
    programId: s.programId,
    feePaid: s.paid === "yes" ? true : s.paid === "no" ? false : undefined,
    dateFrom: s.from,
    dateTo: s.to,
    q: s.q,
    limit: PAGE_LIMIT,
  };
}

export const hasApplicationFilters = (s: ApplicationsSearch) =>
  Boolean(s.status?.length || s.programId?.length || s.paid || s.from || s.to || s.q);

/** Merge a filter change; empty values drop out of the URL. */
export function applyApplicationsFilter(
  prev: ApplicationsSearch,
  patch: Partial<ApplicationsSearch>,
): ApplicationsSearch {
  const next: ApplicationsSearch = { ...prev, ...patch };
  for (const k of Object.keys(next) as (keyof ApplicationsSearch)[]) {
    const v = next[k];
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete next[k];
  }
  return next;
}
