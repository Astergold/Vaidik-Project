// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  meetingsListResponse,
  visitSlotsResponse,
  visitsListResponse,
} from "@vernacular/contracts";
import { BookVisitDialog } from "@/features/visits/VisitParts";
import {
  CalendarPage,
  LeadVisitsPanel,
  MeetingsPage,
  VisitsPage,
} from "@/features/visits/VisitPages";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract.
const LEAD = {
  id: "01a14679-1d15-784c-bf57-ba49718c66bc",
  name: "Aarav Patil",
  phone: "••••••0001",
};
const visitFx = (id: string, over: object = {}) => ({
  id,
  lead: LEAD,
  campus: "Pune campus",
  scheduledAt: "2026-10-20T05:00:00.000Z",
  status: "booked",
  bookedBy: "ai",
  createdBy: null,
  outcomeNote: null,
  createdAt: "2026-10-17T05:00:00.000Z",
  ...over,
});
const V1 = "01a14679-0000-7000-8000-000000000401";
const visits = visitsListResponse.parse({
  items: [
    visitFx(V1),
    visitFx("01a14679-0000-7000-8000-000000000402", {
      bookedBy: "user",
      createdBy: { id: "01a14679-1cc4-7b7a-980d-5cec851fd541", name: "Chitra Counsellor" },
      status: "attended",
    }),
  ],
});
const meetings = meetingsListResponse.parse({
  items: [
    {
      id: "01a14679-0000-7000-8000-000000000501",
      lead: LEAD,
      scheduledAt: "2026-10-20T08:30:00.000Z",
      durationMin: 30,
      mode: "video",
      status: "scheduled",
      counsellor: null,
      note: null,
      createdAt: "2026-10-17T05:00:00.000Z",
    },
  ],
});
const slots = visitSlotsResponse.parse({
  slots: ["2026-10-20T04:30:00.000Z", "2026-10-20T06:30:00.000Z"],
});

describe("/visits (D4-I4-02)", () => {
  it("states: loading, empty, error, not available", async () => {
    mockApi({ "GET /api/visits": () => new Promise(() => {}) });
    const a = renderUI(<VisitsPage search={{}} onSearch={() => {}} />);
    expect(screen.getByLabelText("Loading visits")).toBeTruthy();
    a.unmount();
    mockApi({ "GET /api/visits": () => ({ body: { items: [] } }) });
    const b = renderUI(<VisitsPage search={{}} onSearch={() => {}} />);
    expect(await screen.findByText("No visits")).toBeTruthy();
    b.unmount();
    mockApi({
      "GET /api/visits": () => ({
        status: 500,
        body: { error: { code: "INTERNAL", message: "Server error" } },
      }),
    });
    const c = renderUI(<VisitsPage search={{}} onSearch={() => {}} />);
    expect(await screen.findByText("Couldn't load visits")).toBeTruthy();
    c.unmount();
    mockApi({});
    renderUI(<VisitsPage search={{}} onSearch={() => {}} />);
    expect(await screen.findByText("Scheduling not available yet")).toBeTruthy();
  });

  it("filters go to the URL state and into the API query string; AI bookings carry an AI badge", async () => {
    const calls = mockApi({ "GET /api/visits": () => ({ body: visits }) });
    const onSearch = vi.fn();
    renderUI(
      <VisitsPage
        search={{
          status: ["booked"],
          campus: "Pune campus",
          from: "2026-10-01",
          to: "2026-10-31",
          bookedBy: "ai",
        }}
        onSearch={onSearch}
      />,
    );
    const cards = await screen.findAllByRole("article");
    expect(within(cards[0]!).getByText("AI")).toBeTruthy();
    expect(within(cards[1]!).getByText("Chitra Counsellor")).toBeTruthy();
    const qs = calls[0]!.query;
    expect([
      qs.getAll("status"),
      qs.get("campus"),
      qs.get("from"),
      qs.get("to"),
      qs.get("bookedBy"),
    ]).toEqual([["booked"], "Pune campus", "2026-10-01", "2026-10-31", "ai"]);
    await userEvent.selectOptions(screen.getByLabelText("Booked by"), "user");
    expect(onSearch).toHaveBeenLastCalledWith({ bookedBy: "user" });
    await userEvent.clear(screen.getByLabelText("Campus"));
    await userEvent.type(screen.getByLabelText("Campus"), "Main{Tab}");
    expect(onSearch).toHaveBeenLastCalledWith({ campus: "Main" });
  });

  it("only open visits offer actions (per-status matrix)", async () => {
    mockApi({ "GET /api/visits": () => ({ body: visits }) });
    renderUI(<VisitsPage search={{}} onSearch={() => {}} />);
    const [booked, attended] = await screen.findAllByRole("article");
    expect(
      within(booked!)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Reschedule", "Mark attended", "No-show", "Cancel"]);
    expect(within(attended!).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("booking", () => {
  it("books one of the API's slots", async () => {
    const calls = mockApi({
      "GET /api/visits/slots": () => ({ body: slots }),
      "GET /api/visits": () => ({ body: visits }),
      "POST /api/visits": ({ body }) => ({
        status: 201,
        body: visitFx("01a14679-0000-7000-8000-000000000409", body as object),
      }),
    });
    const onClose = vi.fn();
    const { queryClient } = renderUI(<BookVisitDialog lead={LEAD} onClose={onClose} />);
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await userEvent.click(await screen.findByRole("radio", { name: "12:00 pm" })); // 06:30Z = 12:00 IST
    await userEvent.click(screen.getByRole("button", { name: "Book visit" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      leadId: LEAD.id,
      campus: "Main campus",
      scheduledAt: "2026-10-20T06:30:00.000Z",
    });
    expect(spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey))).toEqual(
      expect.arrayContaining(['["visits"]', `["lead","${LEAD.id}"]`]),
    );
  });

  it("without the slots endpoint, booking is disabled and explained — no invented slots", async () => {
    mockApi({});
    renderUI(<BookVisitDialog lead={LEAD} onClose={() => {}} />);
    expect(await screen.findByRole("note")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toMatch(/Booking isn.t available yet/);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect((screen.getByRole("button", { name: "Book visit" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe("outcomes", () => {
  it("no-show needs a note, then PATCHes and refreshes the lead (Lead 360 panel)", async () => {
    const calls = mockApi({
      "GET /api/visits": () => ({ body: { items: [visits.items[0]] } }),
      "GET /api/meetings": () => ({ body: { items: [] } }),
      [`PATCH /api/visits/${V1}`]: ({ body }) => ({
        body: { ...visits.items[0], ...(body as object) },
      }),
    });
    const { queryClient } = renderUI(<LeadVisitsPanel lead={{ id: LEAD.id, name: LEAD.name }} />);
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await userEvent.click(await screen.findByRole("button", { name: "No-show" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "No-show" }));
    expect(within(dialog).getByText("Add a short note (at least 3 characters)")).toBeTruthy();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await userEvent.type(within(dialog).getByLabelText("Note"), "Didn't come, phone off");
    await userEvent.click(within(dialog).getByRole("button", { name: "No-show" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toBeTruthy());
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({
      status: "no_show",
      outcomeNote: "Didn't come, phone off",
    });
    await waitFor(() =>
      expect(spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey))).toContain(
        `["lead","${LEAD.id}"]`,
      ),
    );
  });
});

describe("/meetings mirrors visits", () => {
  it("lists meetings with actions; states", async () => {
    mockApi({ "GET /api/meetings": () => ({ body: meetings }) });
    const a = renderUI(<MeetingsPage search={{}} onSearch={() => {}} />);
    const card = await screen.findByRole("article");
    expect(within(card).getByText(/30 min · Video/)).toBeTruthy();
    expect(
      within(card)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Reschedule", "Mark attended", "No-show", "Cancel"]);
    a.unmount();
    mockApi({});
    renderUI(<MeetingsPage search={{}} onSearch={() => {}} />);
    expect(await screen.findByText("Scheduling not available yet")).toBeTruthy();
  });

  it("marking a meeting attended PATCHes its status", async () => {
    const id = meetings.items[0]!.id;
    const calls = mockApi({
      "GET /api/meetings": () => ({ body: meetings }),
      [`PATCH /api/meetings/${id}`]: ({ body }) => ({
        body: { ...meetings.items[0], ...(body as object) },
      }),
    });
    renderUI(<MeetingsPage search={{}} onSearch={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Mark attended" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Mark attended" }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ status: "attended" }),
    );
  });
});

describe("/calendar", () => {
  it("asks for the visible range, shows events on the tenant-local day, and lists the selected day", async () => {
    const calls = mockApi({
      "GET /api/visits": () => ({ body: visits }),
      "GET /api/meetings": () => ({ body: meetings }),
    });
    renderUI(<CalendarPage search={{ view: "month", date: "2026-10-20" }} onSearch={() => {}} />);
    const agenda = await screen.findByRole("region", { name: /Agenda/ });
    await waitFor(() => expect(within(agenda).getAllByRole("article")).toHaveLength(3));
    const q = calls.find((c) => c.path === "/api/visits")!.query;
    expect([q.get("from"), q.get("to")]).toEqual(["2026-09-28", "2026-11-01"]); // whole Monday-first weeks
    expect(screen.getByRole("button", { name: /Tue, 20 Oct: 3 events/ })).toBeTruthy();
  });

  it("small-screen structure: the month table scrolls in its own box and is hidden below md", async () => {
    mockApi({
      "GET /api/visits": () => ({ body: visits }),
      "GET /api/meetings": () => ({ body: meetings }),
    });
    const { container } = renderUI(<CalendarPage search={{}} onSearch={() => {}} />);
    await screen.findByRole("table", { name: "Month" });
    const box = container.querySelector('table[aria-label="Month"]')!.parentElement!;
    expect(box.className).toMatch(/overflow-x-auto/);
    expect(box.classList.contains("hidden") && box.classList.contains("md:block")).toBe(true);
    expect(container.innerHTML).not.toMatch(/\bw-\[\d{3,}px\]|min-w-\[\d{3,}px\]/);
  });
});
