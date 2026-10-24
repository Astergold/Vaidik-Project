import { describe, expect, it } from "vitest";
import { leadsListQuery } from "@vernacular/contracts";
import { toQueryString } from "@/lib/api";
import {
  applyFilter,
  hasLeadFilters,
  nextSort,
  pageRange,
  toLeadsApiQuery,
  validateLeadsSearch,
} from "@/features/leads/leads-search";

describe("leads URL state (D2-I4-03)", () => {
  it("drops invalid values instead of breaking the page", () => {
    expect(
      validateLeadsSearch({
        page: -3,
        pageSize: 33,
        sort: "password",
        order: "sideways",
        stage: ["new", "bogus"],
        temperature: "hot",
        createdFrom: "2026-13-01",
        q: "  asha ",
      }),
    ).toEqual({
      page: undefined,
      pageSize: undefined,
      sort: undefined,
      order: undefined,
      q: "  asha ",
      stage: ["new"],
      temperature: ["hot"],
      createdFrom: undefined,
      createdTo: undefined,
    });
  });

  it("builds a query the API's own contract accepts", () => {
    const query = toLeadsApiQuery({
      q: " 98765 ",
      stage: ["new", "attempting"],
      temperature: ["hot"],
      createdFrom: "2026-10-01",
      createdTo: "2026-10-17",
      sort: "full_name",
      order: "asc",
    });
    expect(toQueryString(query)).toBe(
      "?page=1&pageSize=25&sort=full_name&order=asc&q=98765&stage=new&stage=attempting&temperature=hot&createdFrom=2026-10-01&createdTo=2026-10-17",
    );
    const parsed = leadsListQuery.safeParse(query);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("an empty search is not sent", () => {
    expect(toLeadsApiQuery({ q: "   " }).q).toBeUndefined();
    expect(hasLeadFilters({ q: "   " })).toBe(false);
    expect(hasLeadFilters({ stage: ["lost"] })).toBe(true);
  });

  it("sorting toggles on the same column and resets the page", () => {
    expect(nextSort({}, "created_at")).toEqual({
      sort: "created_at",
      order: "asc",
      page: undefined,
    });
    expect(nextSort({ sort: "created_at", order: "asc", page: 4 }, "full_name")).toEqual({
      sort: "full_name",
      order: "asc",
      page: undefined,
    });
  });

  it("page range", () => {
    expect(pageRange(2, 25, 60)).toEqual({ from: 26, to: 50, lastPage: 3 });
    expect(pageRange(3, 25, 60)).toEqual({ from: 51, to: 60, lastPage: 3 });
    expect(pageRange(1, 25, 0)).toEqual({ from: 0, to: 0, lastPage: 1 });
  });
});

describe("source / AI agent / counsellor filters (D2-I4-03b)", () => {
  const S1 = "01a14679-1d11-775e-86f3-891dd1d80a60";
  const S2 = "01a14679-1d11-775e-86f3-891dd1d80a61";
  const AG = "01a14679-1d0e-7a18-bf77-11f3cd23feba";
  const C1 = "01a14679-1cc4-7b7a-980d-5cec851fd541";

  /** What the API receives: the query string, with repeated keys back as arrays. */
  const overTheWire = (qs: string): Record<string, string | string[]> => {
    const out: Record<string, string | string[]> = {};
    for (const [k, v] of new URLSearchParams(qs)) {
      const cur = out[k];
      out[k] = cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v];
    }
    return out;
  };
  const asList = (v: unknown) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

  it("round-trips through the URL → API query → leadsListQuery unchanged", () => {
    const search = validateLeadsSearch({ sourceId: [S1, S2], agentId: AG, counsellorId: [C1] });
    expect(search).toMatchObject({ sourceId: [S1, S2], agentId: [AG], counsellorId: [C1] });
    const qs = toQueryString(toLeadsApiQuery(search));
    expect(qs).toContain(`sourceId=${S1}&sourceId=${S2}`); // several values = repeated params
    const parsed = leadsListQuery.parse(overTheWire(qs.slice(1)));
    expect(asList(parsed.sourceId)).toEqual([S1, S2]);
    expect(asList(parsed.agentId)).toEqual([AG]);
    expect(asList(parsed.counsellorId)).toEqual([C1]);
    expect(parsed).toMatchObject({ page: 1, pageSize: 25, sort: "created_at", order: "desc" });
  });

  it("drops non-uuid and duplicated values, never throws", () => {
    expect(
      validateLeadsSearch({ sourceId: [S1, "1 or 1=1", S1.toUpperCase(), S1] }).sourceId,
    ).toEqual([S1]);
    expect(validateLeadsSearch({ agentId: "nope" }).agentId).toBeUndefined();
    expect(validateLeadsSearch({ counsellorId: [null, 42, {}] }).counsellorId).toBeUndefined();
  });

  it("counts as a filter (enables Clear / no-match state)", () => {
    expect(hasLeadFilters({ agentId: [AG] })).toBe(true);
    expect(hasLeadFilters({ counsellorId: [] })).toBe(false);
  });

  it("changing any filter clears page and keeps the rest", () => {
    const prev = { page: 4, sort: "full_name" as const, stage: ["new" as const] };
    expect(applyFilter(prev, { sourceId: [S1] })).toEqual({
      page: undefined,
      sort: "full_name",
      stage: ["new"],
      sourceId: [S1],
    });
  });
});
