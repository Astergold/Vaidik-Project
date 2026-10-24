// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { leadMessagesResponse } from "@vernacular/contracts";
import { Conversation } from "@/features/whatsapp/Conversation";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract.
const LEAD = "01a14679-0000-7000-8000-0000000001a1";
const msg = (n: number, over: object) => ({
  id: `01a14679-0000-7000-8000-0000000002${String(n).padStart(2, "0")}`,
  direction: "outbound",
  status: "delivered",
  kind: "text",
  body: `Message ${n}`,
  template: null,
  sentBy: { kind: "user", name: "Chitra" },
  failureReason: null,
  createdAt: `2026-10-1${n}T05:00:00.000Z`,
  statusAt: null,
  ...over,
});
const page = (over: object = {}) =>
  leadMessagesResponse.parse({
    items: [
      msg(2, { direction: "inbound", body: "Is hostel available?", sentBy: null }),
      msg(3, { status: "read", body: "Yes, for first years." }),
      msg(4, { status: "failed", failureReason: "The number isn't on WhatsApp." }),
      msg(5, {
        status: "sent",
        kind: "template",
        template: { id: "01a14679-0000-7000-8000-0000000003a1", name: "visit_reminder" },
        sentBy: { kind: "ai", name: null },
        body: "Hi Asha, see you on Monday.",
      }),
    ],
    nextCursor: null,
    freeTextAllowed: true,
    freeTextWindowEndsAt: "2026-10-18T05:00:00.000Z",
    suppression: null,
    ...over,
  });

describe("Lead 360 → Conversation (D5-I4-02)", () => {
  it("bubbles oldest → newest with direction, sender, template name and ticks; failure reason shown", async () => {
    mockApi({ [`GET /api/leads/${LEAD}/messages`]: () => ({ body: page() }) });
    renderUI(<Conversation leadId={LEAD} />);
    const list = await screen.findByRole("list", { name: "Messages" });
    const bubbles = within(list).getAllByRole("article");
    expect(bubbles.map((b) => b.querySelector("p.whitespace-pre-wrap")!.textContent)).toEqual([
      "Is hostel available?",
      "Yes, for first years.",
      "Message 4",
      "Hi Asha, see you on Monday.",
    ]);
    expect(bubbles[0]!.getAttribute("aria-label")).toMatch(/^Received/);
    expect(within(bubbles[0]!).queryByRole("img")).toBeNull(); // no tick on inbound
    expect(within(bubbles[1]!).getByRole("img", { name: "Read" })).toBeTruthy();
    expect(within(bubbles[2]!).getByRole("img", { name: "Failed" })).toBeTruthy();
    expect(within(bubbles[2]!).getByText("The number isn't on WhatsApp.")).toBeTruthy();
    expect(within(bubbles[3]!).getByText("Template · visit_reminder")).toBeTruthy();
    expect(within(bubbles[3]!).getByText("AI agent ·")).toBeTruthy();
    expect(within(bubbles[3]!).getByRole("img", { name: "Sent" })).toBeTruthy();
  });

  it("STOP: opted-out leads show the badge and the explanation", async () => {
    mockApi({
      [`GET /api/leads/${LEAD}/messages`]: () => ({
        body: page({
          freeTextAllowed: false,
          suppression: { reason: "opt_out", since: "2026-10-16T05:00:00.000Z" },
        }),
      }),
    });
    renderUI(<Conversation leadId={LEAD} />);
    expect(await screen.findByText("STOP")).toBeTruthy();
    expect(screen.getByText(/Opted out \(STOP\) since 16 Oct/)).toBeTruthy();
  });

  it("load older prepends the previous page", async () => {
    const older = page({
      items: [msg(1, { direction: "inbound", body: "Hello", sentBy: null })],
      nextCursor: null,
    });
    const calls = mockApi({
      [`GET /api/leads/${LEAD}/messages`]: ({ query }) => ({
        body: query.get("cursor") === "c1" ? older : page({ nextCursor: "c1" }),
      }),
    });
    renderUI(<Conversation leadId={LEAD} />);
    await userEvent.click(await screen.findByRole("button", { name: "Load older messages" }));
    expect(await screen.findByText("Hello")).toBeTruthy();
    const texts = within(screen.getByRole("list", { name: "Messages" }))
      .getAllByRole("article")
      .map((b) => b.querySelector("p.whitespace-pre-wrap")!.textContent);
    expect(texts[0]).toBe("Hello");
    expect(calls.some((c) => c.query.get("cursor") === "c1")).toBe(true);
  });

  it("states: loading, empty, not available", async () => {
    mockApi({ [`GET /api/leads/${LEAD}/messages`]: () => new Promise(() => {}) });
    const a = renderUI(<Conversation leadId={LEAD} />);
    expect(screen.getByLabelText("Loading messages")).toBeTruthy();
    a.unmount();

    mockApi({ [`GET /api/leads/${LEAD}/messages`]: () => ({ body: page({ items: [] }) }) });
    const b = renderUI(<Conversation leadId={LEAD} />);
    expect(await screen.findByText("No WhatsApp messages yet")).toBeTruthy();
    b.unmount();

    mockApi({});
    renderUI(<Conversation leadId={LEAD} />);
    expect(await screen.findByText("WhatsApp service not available yet")).toBeTruthy();
  });
});
