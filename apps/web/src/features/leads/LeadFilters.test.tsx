import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { leadsFiltersResponse } from "@vernacular/contracts";
import { EntityFilter, FILTER_OPTIONS_META, optionsStateFor } from "@/features/leads/LeadFilters";
import { ApiCallError } from "@/lib/api";
import { handledLocally } from "@/lib/errors";

/**
 * Component tests without a DOM library (no new deps): server-render the filter's states.
 * Opening the dropdown (a portal) is covered by the browser e2e.
 */
const response = leadsFiltersResponse.parse({
  sources: [{ id: "01a14679-1d11-775e-86f3-891dd1d80a60", name: "Website form", isActive: true }],
  agents: [],
  counsellors: [
    { id: "01a14679-1cc4-7b7a-980d-5cec851fd541", name: "Chitra Counsellor", isActive: true },
    { id: "01a14679-1cc4-7b7a-980d-5cec851fd542", name: "Old Counsellor", isActive: false },
  ],
});
const render = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("EntityFilter states (D2-I4-03b)", () => {
  it("options from leadsFiltersResponse render as a filter, with the selected count", () => {
    const html = render(
      <EntityFilter
        label="Counsellor"
        emptyText="No counsellors yet"
        state={optionsStateFor(
          { data: response, isError: false, refetch: () => {} },
          "counsellors",
        )}
        selected={[response.counsellors[0]!.id]}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Counsellor");
    expect(html).toMatch(/>1<\/span>/); // one selected
    expect(html).not.toContain('disabled=""');
  });

  it("an empty list renders the disabled 'No … yet' state, not a spinner", () => {
    const html = render(
      <EntityFilter
        label="AI agent"
        emptyText="No agents yet"
        state={optionsStateFor({ data: response, isError: false, refetch: () => {} }, "agents")}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("No agents yet");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("aria-busy");
  });

  it("loading renders a skeleton", () => {
    const html = render(
      <EntityFilter
        label="Source"
        emptyText="No sources yet"
        state={optionsStateFor({ isError: false, refetch: () => {} }, "sources")}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading Source options");
  });

  it("a failed query renders an inline retry that refetches", () => {
    const refetch = vi.fn();
    const state = optionsStateFor({ isError: true, refetch }, "sources");
    const html = render(
      <EntityFilter label="Source" emptyText="No sources yet" state={state} onChange={() => {}} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("couldn&#x27;t load");
    expect(html).toContain("Retry");
    if (state.kind === "error") state.retry();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("…and the global error policy skips it, so no toast", () => {
    for (const status of [0, 403, 500]) {
      expect(handledLocally(new ApiCallError(status, "X", "x"), FILTER_OPTIONS_META)).toBe(true);
    }
  });
});
