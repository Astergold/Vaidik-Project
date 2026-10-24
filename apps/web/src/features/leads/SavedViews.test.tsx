// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { savedViewsResponse } from "@vernacular/contracts";
import { filtersFromSearch, sameFilters } from "@/features/leads/leads-views-api";
import { SavedViews } from "@/features/leads/SavedViews";
import { mockApi, renderUI } from "@/test/utils";

const SRC = "01a14679-0000-7000-8000-000000001ca1";
const views = savedViewsResponse.parse({
  items: [
    {
      id: "01a14679-0000-7000-8000-000000001cb1",
      name: "My hot leads",
      entity: "lead",
      filters: { temperature: ["hot"] },
      isShared: false,
      owner: { id: "01a14679-1cc4-7b7a-980d-5cec851fd541", name: "Chitra" },
      isMine: true,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "01a14679-0000-7000-8000-000000001cb2",
      name: "Website interested",
      entity: "lead",
      filters: { stage: ["interested"], sourceId: [SRC] },
      isShared: true,
      owner: { id: "01a14679-0000-7000-8000-000000001cc1", name: "Head" },
      isMine: false,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  ],
});

describe("saved views on /leads (D6-I4-04b)", () => {
  it("filters: URL state → stored filters without paging; comparison ignores array order", () => {
    expect(
      filtersFromSearch({
        page: 3,
        pageSize: 50,
        q: "  asha ",
        stage: [],
        temperature: ["warm", "hot"],
      }),
    ).toEqual({
      q: "asha",
      temperature: ["warm", "hot"],
    });
    expect(sameFilters({ temperature: ["hot", "warm"] }, { temperature: ["warm", "hot"] })).toBe(
      true,
    );
    expect(sameFilters({ temperature: ["hot"] }, {})).toBe(false);
  });

  it("menu groups mine/shared, shows the active view, and applying replaces the URL filters", async () => {
    const onApply = vi.fn();
    mockApi({ "GET /api/saved-views": () => ({ body: views }) });
    renderUI(
      <SavedViews search={{ stage: ["interested"], sourceId: [SRC], page: 2 }} onApply={onApply} />,
      { role: "admission_head" },
    );
    const trigger = await screen.findByRole("button", { name: "Views: Website interested" });
    await userEvent.click(trigger);
    expect(screen.getByText("My views")).toBeTruthy();
    expect(screen.getByText("Shared with the team")).toBeTruthy();
    await userEvent.click(screen.getByRole("menuitem", { name: /My hot leads/ }));
    expect(onApply).toHaveBeenCalledWith({ temperature: ["hot"] });
  });

  it("save current filters (managers may share); delete your own view", async () => {
    const calls = mockApi({
      "GET /api/saved-views": () => ({ body: views }),
      "POST /api/saved-views": ({ body }) => ({
        status: 201,
        body: {
          ...views.items[0],
          id: "01a14679-0000-7000-8000-000000001cb3",
          ...(body as object),
          isMine: true,
        },
      }),
      [`DELETE /api/saved-views/${views.items[0]!.id}`]: () => ({ status: 200, body: {} }),
    });
    renderUI(<SavedViews search={{ temperature: ["warm"], page: 4 }} onApply={() => {}} />, {
      role: "admin",
    });
    await userEvent.click(await screen.findByRole("button", { name: "Views" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Save current filters/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Saves the 1 filter and sort you have now.")).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Warm ones");
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: /Share with the whole team/ }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save view" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        entity: "lead",
        name: "Warm ones",
        filters: { temperature: ["warm"] },
        isShared: true,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Views: Warm ones" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Views: Warm ones" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete view My hot leads" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("counsellors can save personal views but not share; missing API says so", async () => {
    mockApi({ "GET /api/saved-views": () => ({ body: { items: [] } }) });
    const a = renderUI(<SavedViews search={{}} onApply={() => {}} />, { role: "counsellor" });
    await userEvent.click(await screen.findByRole("button", { name: "Views" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Save current filters/ }));
    expect(screen.queryByRole("checkbox", { name: /Share/ })).toBeNull();
    a.unmount();

    mockApi({});
    renderUI(<SavedViews search={{}} onApply={() => {}} />, { role: "admin" });
    await userEvent.click(screen.getByRole("button", { name: "Views" }));
    expect(await screen.findByText("Saved views aren't available yet")).toBeTruthy();
  });
});
