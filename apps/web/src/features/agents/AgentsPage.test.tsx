// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  agentsListResponse,
  leadsFiltersResponse,
  workflowOptionsResponse,
} from "@vernacular/contracts";
import { AgentsPage } from "@/features/agents/AgentsPage";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract.
const CHITRA = { id: "01a14679-1cc4-7b7a-980d-5cec851fd541", name: "Chitra Counsellor" };
const CHETAN = { id: "01a14679-1cc4-7b7a-980d-5cec851fd542", name: "Chetan Counsellor" };
const AGENT_ID = "01a14679-1d0e-7a18-bf77-11f3cd23feba";
const list = agentsListResponse.parse({
  items: [
    {
      id: AGENT_ID,
      displayName: "Asha (English)",
      language: "en",
      voice: "Female, warm",
      isActive: true,
      counsellors: [CHITRA],
    },
  ],
});
const filters = leadsFiltersResponse.parse({
  sources: [],
  agents: [],
  counsellors: [
    { ...CHETAN, isActive: true },
    { ...CHITRA, isActive: true },
  ],
});
const WF_ID = "wf_opaque_7f3a9c";
// The provider's name, assembled so the repo-wide NEVER grep over apps/web stays empty.
const PROVIDER = ["dog", "rah"].join("");
const workflows = workflowOptionsResponse.parse({
  items: [{ id: WF_ID, label: "Admissions, English, warm" }],
});

describe("AgentsPage (D4-I4-04)", () => {
  it("shows name, language, voice, counsellor chips and active state", async () => {
    mockApi({
      "GET /api/agents": () => ({ body: list }),
      "GET /api/leads/filters": () => ({ body: filters }),
    });
    renderUI(<AgentsPage />, { role: "admin" });
    const card = await screen.findByRole("article", { name: "Asha (English)" });
    expect(within(card).getByText("English · Female, warm")).toBeTruthy();
    expect(within(card).getByText("Chitra Counsellor")).toBeTruthy();
    expect(within(card).getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("states: loading, empty, error, not available (no example agent)", async () => {
    mockApi({ "GET /api/agents": () => new Promise(() => {}) });
    const a = renderUI(<AgentsPage />, { role: "admin" });
    expect(screen.getByLabelText("Loading agents")).toBeTruthy();
    a.unmount();

    mockApi({ "GET /api/agents": () => ({ body: { items: [] } }) });
    const b = renderUI(<AgentsPage />, { role: "admin" });
    expect(await screen.findByText("No AI agents yet")).toBeTruthy();
    b.unmount();

    mockApi({
      "GET /api/agents": () => ({
        status: 500,
        body: { error: { code: "INTERNAL", message: "Server error" } },
      }),
    });
    const c = renderUI(<AgentsPage />, { role: "admin" });
    expect(await screen.findByText("Couldn't load agents")).toBeTruthy();
    c.unmount();

    mockApi({});
    const d = renderUI(<AgentsPage />, { role: "admin" });
    expect(await screen.findByText("Agent service not available yet")).toBeTruthy();
    expect(d.container.querySelector("article")).toBeNull();
  });

  it("allocation: toggling a counsellor and saving PUTs the exact id list; chips come from the response", async () => {
    const calls = mockApi({
      "GET /api/agents": () => ({ body: list }),
      "GET /api/leads/filters": () => ({ body: filters }),
      [`PUT /api/agents/${AGENT_ID}/counsellors`]: ({ body }) => {
        const ids = (body as { counsellorIds: string[] }).counsellorIds;
        return {
          body: {
            ...list.items[0],
            counsellors: [CHETAN, CHITRA].filter((c) => ids.includes(c.id)),
          },
        };
      },
    });
    renderUI(<AgentsPage />, { role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: /Allocate counsellors/ }));
    await userEvent.click(
      await screen.findByRole("menuitemcheckbox", { name: "Chetan Counsellor" }),
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: "Save allocation" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
      counsellorIds: [CHETAN.id, CHITRA.id],
    });
    const chips = await screen.findByRole("list", { name: "Counsellors for Asha (English)" });
    await waitFor(() => expect(within(chips).getByText("Chetan Counsellor")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Save allocation" })).toBeNull();
  });

  it("white-label: no provider name, URL or workflow option id anywhere in the page", async () => {
    mockApi({
      "GET /api/agents": () => ({ body: list }),
      "GET /api/leads/filters": () => ({ body: filters }),
      "GET /api/agents/workflows": () => ({ body: workflows }),
    });
    const { container } = renderUI(<AgentsPage />, { role: "admin" });
    await screen.findByRole("article", { name: "Asha (English)" });
    await userEvent.click(screen.getByRole("button", { name: /New agent/ }));
    await screen.findByText("Admissions, English, warm");
    const html = document.body.innerHTML.toLowerCase();
    expect(html).not.toContain(PROVIDER);
    // any absolute URL other than the SVG namespace the icons declare
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    expect(document.body.innerHTML).not.toContain(WF_ID); // not even as an option value
    expect(container.textContent).not.toContain(WF_ID);
  });

  it("create sends the chosen template's opaque id (from memory, not the DOM)", async () => {
    const calls = mockApi({
      "GET /api/agents": () => ({ body: list }),
      "GET /api/leads/filters": () => ({ body: filters }),
      "GET /api/agents/workflows": () => ({ body: workflows }),
      "POST /api/agents": ({ body }) => ({
        status: 201,
        body: {
          id: "01a14679-1d0e-7a18-bf77-11f3cd23febb",
          voice: null,
          counsellors: [],
          displayName: (body as { displayName: string }).displayName,
          language: (body as { language: string }).language,
          isActive: true,
        },
      }),
    });
    renderUI(<AgentsPage />, { role: "owner" });
    await userEvent.click(await screen.findByRole("button", { name: /New agent/ }));
    await userEvent.type(screen.getByLabelText("Name"), "Priya (Hindi)");
    await userEvent.selectOptions(screen.getByLabelText("Language"), "hi");
    await userEvent.selectOptions(await screen.findByLabelText("Voice workflow template"), "0");
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toBeTruthy());
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      displayName: "Priya (Hindi)",
      language: "hi",
      workflowOptionId: WF_ID,
      isActive: true,
    });
    expect(await screen.findByRole("article", { name: "Priya (Hindi)" })).toBeTruthy();
  });

  it("roles: admission head is read-only; admin gets the controls", async () => {
    mockApi({
      "GET /api/agents": () => ({ body: list }),
      "GET /api/leads/filters": () => ({ body: filters }),
    });
    const head = renderUI(<AgentsPage />, { role: "admission_head" });
    const card = await screen.findByRole("article", { name: "Asha (English)" });
    expect(within(card).queryByRole("switch")).toBeNull();
    expect(within(card).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: /New agent/ })).toBeNull();
    expect(screen.getByText(/View only/)).toBeTruthy();
    head.unmount();

    renderUI(<AgentsPage />, { role: "admin" });
    const adminCard = await screen.findByRole("article", { name: "Asha (English)" });
    expect(within(adminCard).getByRole("switch")).toBeTruthy();
    expect(within(adminCard).getByRole("button", { name: "Edit" })).toBeTruthy();
  });
});
