import { describe, expect, it } from "vitest";
import {
  applyApplicationsFilter,
  hasApplicationFilters,
  toApplicationsQuery,
  validateApplicationsSearch,
} from "@/features/applications/applications-search";

const PROGRAM = "01a14679-1cc4-7b7a-980d-5cec851fd5aa";

describe("applications URL state (D5-I4-01)", () => {
  it("keeps only valid values from the URL", () => {
    expect(
      validateApplicationsSearch({
        status: ["fee_paid", "bogus"],
        programId: [PROGRAM, "nope"],
        paid: "yes",
        from: "2026-02-30",
        to: "2026-10-01",
        q: "  APP-12 ",
      }),
    ).toEqual({
      status: ["fee_paid"],
      programId: [PROGRAM],
      paid: "yes",
      from: undefined,
      to: "2026-10-01",
      q: "APP-12",
    });
    expect(validateApplicationsSearch({ paid: "maybe", q: "   " })).toMatchObject({
      paid: undefined,
      q: undefined,
    });
  });

  it("maps the Fee paid chip to feePaid=true (and Not paid to false) in the API query", () => {
    expect(toApplicationsQuery({ paid: "yes" })).toMatchObject({ feePaid: true, limit: 50 });
    expect(toApplicationsQuery({ paid: "no" })).toMatchObject({ feePaid: false });
    expect(toApplicationsQuery({}).feePaid).toBeUndefined();
    expect(toApplicationsQuery({ from: "2026-10-01", to: "2026-10-31" })).toMatchObject({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });
  });

  it("empty values drop out; filters detected", () => {
    expect(applyApplicationsFilter({ paid: "yes", status: ["fee_paid"] }, { status: [] })).toEqual({
      paid: "yes",
    });
    expect(applyApplicationsFilter({ paid: "yes" }, { paid: undefined })).toEqual({});
    expect(hasApplicationFilters({})).toBe(false);
    expect(hasApplicationFilters({ paid: "no" })).toBe(true);
  });
});
