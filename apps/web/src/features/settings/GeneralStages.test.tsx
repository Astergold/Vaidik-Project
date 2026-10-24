// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CORE_STAGES, generalSettings, stagesResponse } from "@vernacular/contracts";
import { GeneralPage } from "@/features/settings/GeneralPage";
import { StagesPage } from "@/features/settings/StagesPage";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract.
const general = generalSettings.parse({
  name: "MIT-ADT University",
  slug: "mit-adt",
  timezone: "Asia/Kolkata",
  currentCycle: {
    id: "01a14679-0000-7000-8000-000000000aa1",
    name: "2026-27",
    startsOn: "2026-06-01",
    endsOn: "2027-05-31",
  },
});
const SUB = "01a14679-0000-7000-8000-000000000ab1";
const SUB2 = "01a14679-0000-7000-8000-000000000ab2";
const stages = stagesResponse.parse({
  stages: CORE_STAGES.map((stage) => ({
    stage,
    subStages:
      stage === "interested"
        ? [
            {
              id: SUB,
              coreStage: stage,
              name: "Waiting for JEE result",
              sortOrder: 1,
              leadCount: 12,
            },
            { id: SUB2, coreStage: stage, name: "Comparing colleges", sortOrder: 2, leadCount: 0 },
          ]
        : [],
  })),
});

describe("/settings general (D6-I4-02)", () => {
  it("shows name, read-only address, timezone and cycle; saves the PUT body", async () => {
    const calls = mockApi({
      "GET /api/settings/general": () => ({ body: general }),
      "PUT /api/settings/general": ({ body }) => ({
        body: {
          ...general,
          ...(body as object),
          currentCycle: {
            ...general.currentCycle,
            ...(body as { currentCycle: object }).currentCycle,
          },
        },
      }),
    });
    const { container } = renderUI(<GeneralPage />, { role: "owner" });
    expect(((await screen.findByLabelText("Institution name")) as HTMLInputElement).value).toBe(
      "MIT-ADT University",
    );
    expect(screen.getByText("mit-adt.laveric.com")).toBeTruthy();
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "2027-28");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
      name: "MIT-ADT University",
      timezone: "Asia/Kolkata",
      currentCycle: { name: "2027-28", startsOn: "2026-06-01", endsOn: "2027-05-31" },
    });
    expect(await screen.findByText("Saved")).toBeTruthy();
    expectSmallScreenSafe(container);
  });

  it("validates cycle name and order before saving", async () => {
    const calls = mockApi({ "GET /api/settings/general": () => ({ body: general }) });
    renderUI(<GeneralPage />, { role: "admin" });
    await userEvent.clear(await screen.findByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "2027");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Use the form 2026-27")).toBeTruthy();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });
});

describe("/settings/stages (D6-I4-02)", () => {
  it("all 11 core stages in order; sub-stages with lead counts; in-use ones can't be deleted", async () => {
    mockApi({ "GET /api/settings/stages": () => ({ body: stages }) });
    renderUI(<StagesPage />, { role: "admin" });
    const list = await screen.findByRole("list", { name: "Core stages" });
    expect(within(list).getAllByRole("region")).toHaveLength(11);
    const interested = screen.getByRole("region", { name: "Interested" });
    expect(within(interested).getByText("12 leads")).toBeTruthy();
    expect(
      (
        within(interested).getByRole("button", {
          name: /in use and can't be deleted/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        within(interested).getByRole("button", {
          name: "Delete Comparing colleges",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("add, rename, reorder and delete send the right calls and show the server's result", async () => {
    const calls = mockApi({
      "GET /api/settings/stages": () => ({ body: stages }),
      "POST /api/settings/stages/sub-stages": ({ body }) => ({
        body: {
          id: "01a14679-0000-7000-8000-000000000ab3",
          coreStage: "interested",
          name: (body as { name: string }).name,
          sortOrder: 3,
          leadCount: 0,
        },
      }),
      [`PATCH /api/settings/stages/sub-stages/${SUB2}`]: () => ({
        body: {
          id: SUB2,
          coreStage: "interested",
          name: "Comparing options",
          sortOrder: 2,
          leadCount: 0,
        },
      }),
      "PUT /api/settings/stages/interested/order": () => ({ body: stages }),
      [`DELETE /api/settings/stages/sub-stages/${SUB2}`]: () => ({ status: 200, body: {} }),
    });
    renderUI(<StagesPage />, { role: "owner" });
    const card = await screen.findByRole("region", { name: "Interested" });
    await userEvent.type(
      within(card).getByLabelText("New sub-stage under Interested"),
      "Visit planned",
    );
    await userEvent.click(within(card).getByRole("button", { name: "Add" }));
    expect(await within(card).findByText("Visit planned")).toBeTruthy();
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      coreStage: "interested",
      name: "Visit planned",
    });

    await userEvent.click(within(card).getByRole("button", { name: "Move Comparing colleges up" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        ids: [SUB2, SUB, "01a14679-0000-7000-8000-000000000ab3"],
      }),
    );

    await userEvent.click(within(card).getByRole("button", { name: "Rename Comparing colleges" }));
    const box = within(card).getByLabelText("Rename Comparing colleges", { selector: "input" });
    await userEvent.clear(box);
    await userEvent.type(box, "Comparing options{Enter}");
    expect(await within(card).findByText("Comparing options")).toBeTruthy();

    await userEvent.click(within(card).getByRole("button", { name: "Delete Comparing options" }));
    await waitFor(() => expect(within(card).queryByText("Comparing options")).toBeNull());
  });

  it("not available; heads gated", async () => {
    mockApi({});
    const a = renderUI(<StagesPage />, { role: "admin" });
    expect(await screen.findByText("Settings service not available yet")).toBeTruthy();
    a.unmount();
    const calls = mockApi({});
    renderUI(<StagesPage />, { role: "admission_head" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});
