// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { callsResponse } from "@vernacular/contracts";
import { CallsPage } from "@/features/calls/CallsPage";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

const CALL = "01a14679-0000-7000-8000-000000004ca1";
const PROVIDER = ["dog", "rah"].join("");
const list = callsResponse.parse({
  nextCursor: null,
  total: 2,
  dispositions: ["interested", "wrong_number"],
  items: [
    {
      id: CALL,
      lead: {
        id: "01a14679-0000-7000-8000-000000004cb1",
        name: "Asha Rao",
        phone: "+91******4321",
      },
      agent: { id: "01a14679-0000-7000-8000-000000004cc1", displayName: "Asha (English)" },
      campaign: { id: "01a14679-0000-7000-8000-000000004cd1", name: "October push" },
      direction: "outbound",
      status: "completed",
      disposition: "interested",
      rejectCode: null,
      startedAt: "2026-10-16T05:00:00.000Z",
      durationS: 95,
      hasRecording: true,
      temperature: "hot",
      createdAt: "2026-10-16T04:59:00.000Z",
    },
    {
      id: "01a14679-0000-7000-8000-000000004ca2",
      lead: {
        id: "01a14679-0000-7000-8000-000000004cb2",
        name: "Ravi Kumar",
        phone: "+91******1111",
      },
      agent: null,
      campaign: null,
      direction: "outbound",
      status: "rejected",
      disposition: null,
      rejectCode: "OUTSIDE_WINDOW",
      startedAt: null,
      durationS: null,
      hasRecording: false,
      temperature: null,
      createdAt: "2026-10-16T16:00:00.000Z",
    },
  ],
});

describe("/calls (D6-I4-04e)", () => {
  it("rows: lead + phone as received, agent + campaign, status (+ reject code), outcome, length, AI temperature", async () => {
    mockApi({ "GET /api/calls": () => ({ body: list }) });
    const { container } = renderUI(<CallsPage />, { role: "counsellor" });
    const row = (await screen.findByRole("link", { name: "Asha Rao" })).closest("tr")!;
    for (const t of [
      "+91******4321",
      "Asha (English)",
      "October push",
      "Completed",
      "Interested",
      "1:35",
      "Hot",
    ])
      expect(within(row).getByText(t)).toBeTruthy();
    const blocked = screen.getByRole("link", { name: "Ravi Kumar" }).closest("tr")!;
    expect(within(blocked).getByText("Blocked")).toBeTruthy();
    expect(within(blocked).getByText("OUTSIDE_WINDOW")).toBeTruthy();
    expect(document.body.innerHTML.toLowerCase()).not.toContain(PROVIDER);
    expectSmallScreenSafe(container);
  });

  it("recording plays through <audio src=/api/calls/:id/recording> (the browser follows the 302; no fetch)", async () => {
    const calls = mockApi({ "GET /api/calls": () => ({ body: list }) });
    renderUI(<CallsPage />, { role: "admin" });
    await userEvent.click(
      await screen.findByRole("button", { name: "Play recording of the call with Asha Rao" }),
    );
    const audio = screen.getByLabelText("Recording of the call with Asha Rao") as HTMLAudioElement;
    expect(audio.tagName).toBe("AUDIO");
    expect(audio.getAttribute("src")).toBe(`/api/calls/${CALL}/recording`);
    expect(calls.some((c) => c.path.endsWith("/recording"))).toBe(false);
  });

  it("filters go to the server (status, outcome from the server's list, search)", async () => {
    const calls = mockApi({ "GET /api/calls": () => ({ body: list }) });
    renderUI(<CallsPage />, { role: "admin" });
    await screen.findByRole("link", { name: "Asha Rao" });
    await userEvent.click(screen.getByRole("button", { name: /Outcome/ }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Wrong number" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(calls.at(-1)!.query.getAll("disposition")).toEqual(["wrong_number"]),
    );
    await userEvent.type(screen.getByLabelText("Search calls"), "4321");
    await waitFor(() => expect(calls.at(-1)!.query.get("q")).toBe("4321"));
  });

  it("states: empty, not available; every tenant role can open it, super-admin can't", async () => {
    mockApi({
      "GET /api/calls": () => ({
        body: { items: [], nextCursor: null, total: 0, dispositions: [] },
      }),
    });
    const a = renderUI(<CallsPage />, { role: "counsellor" });
    expect(await screen.findByText("No calls yet")).toBeTruthy();
    a.unmount();
    mockApi({});
    const b = renderUI(<CallsPage />, { role: "owner" });
    expect(await screen.findByText("Calls service not available yet")).toBeTruthy();
    b.unmount();
    const none = mockApi({});
    renderUI(<CallsPage />, { role: "super_admin" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(none).toHaveLength(0);
  });
});
