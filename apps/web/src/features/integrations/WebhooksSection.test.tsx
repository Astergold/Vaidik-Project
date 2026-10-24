// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deliveriesResponse, webhook, webhookDelivery } from "@vernacular/contracts";
import { WebhooksSection } from "@/features/integrations/WebhooksSection";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract. The secret is a made-up test string.
const WH = "01a14679-0000-7000-8000-0000000006a1";
const URL_ = "https://erp.example.edu/hooks/vernacular";
const hook = (over: object = {}) =>
  webhook.parse({
    id: WH,
    url: URL_,
    events: ["lead.created", "application.updated"],
    isActive: true,
    disabledReason: null,
    disabledAt: null,
    failingSince: null,
    lastDeliveryAt: "2026-10-17T04:00:00.000Z",
    lastStatusCode: 200,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...over,
  });
const delivery = (over: object = {}) =>
  webhookDelivery.parse({
    id: "01a14679-0000-7000-8000-0000000006b1",
    event: "lead.created",
    status: "failed",
    attempt: 5,
    statusCode: 500,
    error: null,
    durationMs: 80,
    nextRetryAt: null,
    createdAt: "2026-10-16T04:00:00.000Z",
    ...over,
  });
const SECRET = "whsec_TESTONLY_not_real_0000000000";

describe("Integrations → Webhooks (D5-I4-03)", () => {
  it("add: https URL + ≥ 1 event required; events sent in contract order; signing secret revealed once with the recipe", async () => {
    const calls = mockApi({
      "GET /api/settings/webhooks": () => ({ body: { items: [] } }),
      "POST /api/settings/webhooks": () => ({
        status: 201,
        body: { webhook: hook(), secret: SECRET },
      }),
    });
    renderUI(<WebhooksSection />, { role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: /Add webhook/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByLabelText("Endpoint URL"),
      "http://insecure.example.edu",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Add webhook" }));
    expect(within(dialog).getByText("Use an https:// URL")).toBeTruthy();
    expect(within(dialog).getByText("Pick at least one event")).toBeTruthy();

    await userEvent.clear(within(dialog).getByLabelText("Endpoint URL"));
    await userEvent.type(within(dialog).getByLabelText("Endpoint URL"), URL_);
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /application\.updated/ }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /lead\.created/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Add webhook" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        url: URL_,
        events: ["lead.created", "application.updated"],
      }),
    );
    expect(((await screen.findByLabelText("Signing secret")) as HTMLInputElement).value).toBe(
      SECRET,
    );
    expect(screen.getByText("How to verify a delivery")).toBeTruthy();
    await userEvent.click(screen.getByRole("checkbox", { name: /copied the signing secret/ }));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(document.body.innerHTML).not.toContain(SECRET));
    expect(screen.getByRole("article", { name: URL_ })).toBeTruthy();
  });

  it("send test shows the server's result", async () => {
    mockApi({
      "GET /api/settings/webhooks": () => ({ body: { items: [hook()] } }),
      [`POST /api/settings/webhooks/${WH}/test`]: () => ({
        body: delivery({
          event: "test.ping",
          status: "succeeded",
          statusCode: 200,
          attempt: 1,
          durationMs: 95,
        }),
      }),
    });
    renderUI(<WebhooksSection />, { role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: /Send test/ }));
    expect(await screen.findByText("Test delivered: HTTP 200 · 95 ms")).toBeTruthy();
  });

  it("auto-disabled: banner explains and Re-enable PATCHes isActive=true; the server's state replaces it", async () => {
    const calls = mockApi({
      "GET /api/settings/webhooks": () => ({
        body: {
          items: [
            hook({
              isActive: false,
              disabledReason: "auto_failing",
              disabledAt: "2026-10-16T10:00:00.000Z",
              failingSince: "2026-10-15T10:00:00.000Z",
              lastStatusCode: 500,
            }),
          ],
        },
      }),
      [`PATCH /api/settings/webhooks/${WH}`]: () => ({ body: hook() }),
    });
    renderUI(<WebhooksSection />, { role: "admin" });
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain(
      "Turned off automatically after 24 hours of failed deliveries",
    );
    await userEvent.click(within(banner).getByRole("button", { name: "Re-enable" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ isActive: true }),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("switch", { name: `Webhook ${URL_} active` })).toBeTruthy();
  });

  it("delivery log lists attempts and Replay posts to the delivery", async () => {
    const d = delivery({
      status: "retrying",
      attempt: 3,
      error: "Timed out after 10 s",
      statusCode: null,
      nextRetryAt: "2026-10-17T06:30:00.000Z",
    });
    const calls = mockApi({
      "GET /api/settings/webhooks": () => ({ body: { items: [hook()] } }),
      [`GET /api/settings/webhooks/${WH}/deliveries`]: () => ({
        body: deliveriesResponse.parse({ items: [d], nextCursor: null }),
      }),
      [`POST /api/settings/webhooks/${WH}/deliveries/${d.id}/replay`]: () => ({
        body: delivery({
          id: "01a14679-0000-7000-8000-0000000006b2",
          status: "pending",
          attempt: 1,
          statusCode: null,
          durationMs: null,
        }),
      }),
    });
    renderUI(<WebhooksSection />, { role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: /Delivery log/ }));
    const sheet = await screen.findByRole("dialog");
    expect(
      await within(sheet).findByText("Timed out after 10 s · retrying (attempt 3)"),
    ).toBeTruthy();
    expect(within(sheet).getByText("17 Oct, 12:00 pm")).toBeTruthy(); // next retry, tenant tz
    await userEvent.click(within(sheet).getByRole("button", { name: /^Replay lead\.created/ }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/replay"))).toBe(true));
  });

  it("delete asks first and removes the card after the server confirms", async () => {
    mockApi({
      "GET /api/settings/webhooks": () => ({ body: { items: [hook()] } }),
      [`DELETE /api/settings/webhooks/${WH}`]: () => ({ status: 200, body: {} }),
    });
    renderUI(<WebhooksSection />, { role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: /Delete/ }));
    expect(screen.getByText("Delete this webhook?")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("No webhooks yet")).toBeTruthy();
  });

  it("not available yet", async () => {
    mockApi({});
    renderUI(<WebhooksSection />, { role: "admin" });
    expect(await screen.findByText("Webhook service not available yet")).toBeTruthy();
  });
});
