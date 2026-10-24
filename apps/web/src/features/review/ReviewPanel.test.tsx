// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LEAD_ID, makeCall, makeQueueItem } from "@/test/fixtures/review";
import { ReviewPanel } from "@/features/review/ReviewPanel";
import { mockApi, renderUI } from "@/test/utils";

const item = makeQueueItem(1, { lead: { ...makeQueueItem(1).lead, id: LEAD_ID } });
const callId = item.callId!;
const call = makeCall(callId, LEAD_ID);

describe("ReviewPanel (D4-I4-01)", () => {
  it("renders the player, the transcript and highlights the temperature + objection quotes", async () => {
    mockApi({ [`GET /api/calls/${callId}`]: () => ({ body: call }) });
    renderUI(<ReviewPanel item={item} onDone={() => {}} />);
    const audio = await screen.findByLabelText("Call recording");
    expect(audio.getAttribute("src")).toBe(`/api/calls/${callId}/recording`);
    expect(audio.getAttribute("preload")).toBe("none");
    const marks = [...screen.getByTestId("transcript").querySelectorAll("mark")];
    expect(marks.map((m) => [m.textContent, m.dataset.labels])).toEqual([
      ["I am really keen on B.Tech CS", "temperature"],
      ["the fees are too high for us", "objection"],
    ]);
    expect(screen.getByTestId("transcript").textContent).toBe(call.transcriptText); // shown exactly as stored
  });

  it("no recording → says so; a quote missing from the transcript is reported, not thrown", async () => {
    mockApi({
      [`GET /api/calls/${callId}`]: () => ({
        body: { ...call, hasRecording: false, temperatureQuote: "I will pay today" },
      }),
    });
    renderUI(<ReviewPanel item={item} onDone={() => {}} />);
    expect(await screen.findByText("Recording not available yet.")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("I will pay today");
  });

  it("Verify posts to the verify endpoint, invalidates queue/call/lead and reports the saved value", async () => {
    const calls = mockApi({
      [`GET /api/calls/${callId}`]: () => ({ body: call }),
      [`POST /api/calls/${callId}/review/verify`]: () => ({
        body: {
          ...call,
          review: {
            state: "verified",
            temperature: "warm",
            byName: "Chitra",
            at: "2026-10-17T05:10:00.000Z",
            reason: null,
          },
        },
      }),
    });
    const onDone = vi.fn();
    const { queryClient } = renderUI(<ReviewPanel item={item} onDone={onDone} />);
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await userEvent.click(await screen.findByRole("button", { name: /Verify: Warm is right/ }));
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith({ leadName: "Lead 1", text: "Verified: Warm" }),
    );
    expect(calls.find((c) => c.method === "POST")?.path).toBe(`/api/calls/${callId}/review/verify`);
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toEqual(
      expect.arrayContaining(['["queue"]', `["call","${callId}"]`, `["lead","${LEAD_ID}"]`]),
    );
  });

  it("Override warm → hot needs a reason, then posts it and reports the new value", async () => {
    const calls = mockApi({
      [`GET /api/calls/${callId}`]: () => ({ body: call }),
      [`POST /api/calls/${callId}/review/override`]: ({ body }) => ({
        body: {
          ...call,
          review: {
            state: "overridden",
            temperature: (body as { temperature: string }).temperature,
            byName: "Chitra",
            at: "2026-10-17T05:10:00.000Z",
            reason: "x",
          },
        },
      }),
    });
    const onDone = vi.fn();
    renderUI(<ReviewPanel item={item} onDone={onDone} />);
    await userEvent.click(await screen.findByRole("button", { name: "Override" }));
    await userEvent.selectOptions(screen.getByLabelText("Correct temperature"), "hot");
    await userEvent.click(screen.getByRole("button", { name: "Save override" }));
    expect(screen.getByText("Say why (at least 3 characters)")).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    await userEvent.type(
      screen.getByLabelText("Reason"),
      "Asked about hostel and fees, ready to apply",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save override" }));
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith({ leadName: "Lead 1", text: "Overridden to Hot" }),
    );
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      temperature: "hot",
      reason: "Asked about hostel and fees, ready to apply",
    });
  });

  it("a needs-counsellor item: book a callback with a note and resolve it", async () => {
    const needs = makeQueueItem(2, {
      kind: "needs_counsellor",
      callId: null,
      reason: "Parent wants to talk to a human",
    });
    const calls = mockApi({
      [`POST /api/queue/${needs.id}/resolve`]: () => ({ body: { ...needs, status: "resolved" } }),
    });
    const onDone = vi.fn();
    renderUI(<ReviewPanel item={needs} onDone={onDone} />);
    await userEvent.selectOptions(screen.getByLabelText("What did you do?"), "callback_scheduled");
    await userEvent.click(screen.getByRole("button", { name: "Resolve" }));
    expect(screen.getByText("Pick a date and time")).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/When/), "2026-10-18T10:00");
    await userEvent.type(screen.getByLabelText("Note"), "Father prefers a call after 10");
    await userEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith({ leadName: "Lead 2", text: "Callback scheduled" }),
    );
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      outcome: "callback_scheduled",
      note: "Father prefers a call after 10",
      followUpAt: "2026-10-18T04:30:00.000Z", // 10:00 in Asia/Kolkata
    });
  });

  it("call endpoint missing → 'not available yet', no crash", async () => {
    mockApi({});
    renderUI(<ReviewPanel item={item} onDone={() => {}} />);
    expect(await screen.findByText(/Call review isn.t available yet/)).toBeTruthy();
  });
});
