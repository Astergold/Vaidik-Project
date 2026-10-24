// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { leadsListResponse } from "@vernacular/contracts";
import { makeCall, makeQueueItem } from "@/test/fixtures/review";
import { WorkspacePage } from "@/features/workspace/WorkspacePage";
import { mockApi, renderUI } from "@/test/utils";

const queue = (items: unknown[]) => ({ body: { items, nextCursor: null } });

describe("WorkspacePage tabs (D4-I4-01)", () => {
  it("renders four ARIA tabs with the current one selected", () => {
    mockApi({ "GET /api/queue": () => queue([]) });
    renderUI(<WorkspacePage tab="review" />, { path: "/workspace" });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Needs counsellor",
      "Review calls",
      "My leads",
      "Today",
    ]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
      "false",
    ]);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("tab-review");
  });

  it("queue tab states: loading, empty, error, not available", async () => {
    mockApi({ "GET /api/queue": () => new Promise(() => {}) });
    const a = renderUI(<WorkspacePage tab="needs" />);
    expect(screen.getByLabelText("Loading Needs counsellor").getAttribute("aria-busy")).toBe(
      "true",
    );
    a.unmount();

    mockApi({ "GET /api/queue": () => queue([]) });
    const b = renderUI(<WorkspacePage tab="needs" />);
    expect(await screen.findByText("Nothing needs you right now.")).toBeTruthy();
    b.unmount();

    mockApi({
      "GET /api/queue": () => ({
        status: 500,
        body: { error: { code: "INTERNAL", message: "x" } },
      }),
    });
    const c = renderUI(<WorkspacePage tab="needs" />);
    expect(await screen.findByText("Couldn't load needs counsellor")).toBeTruthy();
    c.unmount();

    mockApi({}); // GET /api/queue → 404 Route not found
    renderUI(<WorkspacePage tab="needs" />);
    expect(await screen.findByText("Queues not available yet")).toBeTruthy();
  });

  it("My leads: real GET /api/leads for self; the phone is rendered exactly as the API sent it", async () => {
    const leads = leadsListResponse.parse({
      page: 1,
      pageSize: 50,
      total: 1,
      items: [
        {
          id: "01a14679-1d15-784c-bf57-ba49718c66bc",
          person: {
            id: "01a14679-1d13-7337-96e5-6b2b10492140",
            fullName: "Aarav Patil",
            phone: "••••••0001",
            city: "Pune",
          },
          stage: "interested",
          subStage: null,
          temperature: "hot",
          nextStep: "book_visit",
          nextStepDueAt: "2026-10-17T20:48:24.831Z",
          owner: null,
          aiAgent: null,
          source: null,
          program: null,
          callCount: 2,
          lastCallAt: null,
          lastRejectCode: null,
          createdAt: "2026-10-15T20:48:24.830Z",
          updatedAt: "2026-10-16T20:48:24.838Z",
        },
      ],
    });
    const calls = mockApi({ "GET /api/leads": () => ({ body: leads }) });
    const { container } = renderUI(<WorkspacePage tab="leads" />);
    expect(await screen.findByText("Aarav Patil")).toBeTruthy();
    expect(screen.getByText("••••••0001")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\+?91\d{6,}|\d{10}/); // no raw number anywhere
    expect(calls[0]!.query.get("counsellorId")).toBe("01a14679-1cc4-7b7a-980d-5cec851fd541"); // self
  });

  it("clears 10 review items in a row: the panel stays mounted and the route doesn't change", async () => {
    const items = Array.from({ length: 10 }, (_, i) => makeQueueItem(i + 1));
    const remaining = new Set(items.map((i) => i.id));
    const routes: Parameters<typeof mockApi>[0] = {
      "GET /api/queue": () => queue(items.filter((i) => remaining.has(i.id))),
    };
    for (const it of items) {
      const call = makeCall(it.callId!, it.lead.id);
      routes[`GET /api/calls/${it.callId}`] = () => ({ body: call });
      routes[`POST /api/calls/${it.callId}/review/verify`] = () => {
        remaining.delete(it.id); // server resolves the review_call item
        return {
          body: {
            ...call,
            review: {
              state: "verified",
              temperature: "warm",
              byName: "Chitra",
              at: "2026-10-17T06:00:00.000Z",
              reason: null,
            },
          },
        };
      };
    }
    const calls = mockApi(routes);
    const { router } = renderUI(<WorkspacePage tab="review" />, { path: "/workspace?tab=review" });
    await userEvent.click(await screen.findByRole("button", { name: /Lead 1\b/ }));
    const panel = await screen.findByRole("dialog");

    for (let n = 1; n <= 10; n++) {
      const dialog = await screen.findByRole("dialog");
      if (n < 10) expect(dialog).toBe(panel); // same mounted panel, not reopened
      await waitFor(() =>
        expect(
          within(dialog).getByRole("heading", { level: 2, name: /^Lead \d+$/ }).textContent,
        ).toBe(`Lead ${n}`),
      );
      await userEvent.click(await within(dialog).findByRole("button", { name: /Verify/ }));
      if (n < 10)
        await waitFor(() =>
          expect(within(dialog).getByRole("status").textContent).toContain(`Lead ${n}: Verified`),
        );
    }
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("All done")).toBeTruthy();
    expect(
      calls.filter((c) => c.method === "POST" && c.path.endsWith("/review/verify")),
    ).toHaveLength(10);
    expect(router.state.location.pathname).toBe("/workspace");
  }, 30_000);

  it("structure for small screens: no fixed widths, scrollable tab strip, min-w-0 column", () => {
    mockApi({ "GET /api/queue": () => queue([]) });
    const { container } = renderUI(<WorkspacePage tab="needs" />);
    expect(screen.getByRole("tablist").className).toContain("overflow-x-auto");
    expect(container.querySelector('[role="tabpanel"]')!.className).toContain("min-w-0");
    expect(container.innerHTML).not.toMatch(/\bw-\[\d{3,}px\]|min-w-\[\d{3,}px\]/);
  });
});
