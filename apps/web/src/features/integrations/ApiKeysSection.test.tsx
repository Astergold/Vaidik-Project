// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiKey, apiKeysResponse } from "@vernacular/contracts";
import { IntegrationsPage } from "@/features/integrations/IntegrationsPage";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract. The "secret" is a made-up test string.
const KEY_ID = "01a14679-0000-7000-8000-0000000004a1";
const existing = apiKey.parse({
  id: KEY_ID,
  name: "ERP sync",
  prefix: "vk_live_3fA9",
  scopes: ["leads:read", "applications:write"],
  createdAt: "2026-10-01T05:00:00.000Z",
  createdBy: "Owner One",
  lastUsedAt: "2026-10-16T08:30:00.000Z",
  revokedAt: null,
});
const SECRET = "vk_live_TESTONLY_not_a_real_key_000000";
const base = { "GET /api/settings/webhooks": () => ({ body: { items: [] } }) };

describe("Integrations → API keys (D5-I4-03)", () => {
  it("lists name, prefix (never the full key), scopes and last use in tenant tz", async () => {
    mockApi({
      ...base,
      "GET /api/settings/api-keys": () => ({ body: apiKeysResponse.parse({ items: [existing] }) }),
    });
    const { container } = renderUI(<IntegrationsPage />, { role: "admin" });
    const row = (await screen.findByText("ERP sync")).closest("tr")!;
    expect(within(row).getByText("vk_live_3fA9…")).toBeTruthy();
    expect(within(row).getByText("leads:read")).toBeTruthy();
    expect(within(row).getByText("16 Oct, 2:00 pm")).toBeTruthy();
    expectSmallScreenSafe(container);
  });

  it("create: validates, shows the key ONCE, caches only metadata; after Done the secret is gone from the page", async () => {
    const calls = mockApi({
      ...base,
      "GET /api/settings/api-keys": () => ({ body: { items: [] } }),
      "POST /api/settings/api-keys": () => ({
        status: 201,
        body: {
          key: { ...existing, id: "01a14679-0000-7000-8000-0000000004a2", lastUsedAt: null },
          secret: SECRET,
        },
      }),
    });
    const { queryClient } = renderUI(<IntegrationsPage />, { role: "owner" });
    await userEvent.click(await screen.findByRole("button", { name: /New key/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    expect(within(dialog).getByText("Give the key a name")).toBeTruthy();
    expect(within(dialog).getByText("Pick at least one scope")).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    await userEvent.type(within(dialog).getByLabelText("Name"), "ERP sync");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /applications:write/ }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /leads:read/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        name: "ERP sync",
        scopes: ["leads:read", "applications:write"], // contract order, not click order
      }),
    );
    expect(
      (
        (await screen.findByLabelText(
          "API key (send as Authorization: Bearer …)",
        )) as HTMLInputElement
      ).value,
    ).toBe(SECRET);
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain(SECRET);

    const done = screen.getByRole("button", { name: "Done" }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    await userEvent.click(screen.getByRole("checkbox", { name: /copied the API key/ }));
    await userEvent.click(done);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(screen.getByText("ERP sync")).toBeTruthy();
  });

  it("revoke asks first, then shows the server's revoked state", async () => {
    const calls = mockApi({
      ...base,
      "GET /api/settings/api-keys": () => ({ body: { items: [existing] } }),
      [`POST /api/settings/api-keys/${KEY_ID}/revoke`]: () => ({
        body: { ...existing, revokedAt: "2026-10-17T05:00:00.000Z" },
      }),
    });
    renderUI(<IntegrationsPage />, { role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(screen.getByText("Stops working immediately.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Revoke key" }));
    expect(await screen.findByText("Revoked 17 Oct")).toBeTruthy();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("states: not available, empty, role gate", async () => {
    mockApi({});
    const a = renderUI(<IntegrationsPage />, { role: "admin" });
    expect(await screen.findByText("API key service not available yet")).toBeTruthy();
    a.unmount();

    mockApi({ ...base, "GET /api/settings/api-keys": () => ({ body: { items: [] } }) });
    const b = renderUI(<IntegrationsPage />, { role: "admin" });
    expect(await screen.findByText("No API keys yet")).toBeTruthy();
    b.unmount();

    const calls = mockApi({});
    renderUI(<IntegrationsPage />, { role: "admission_head" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});

describe("Integrations page layout (D5-I4-03)", () => {
  it("links to Lead sources (live) and the API docs; sections in order; no provider name", async () => {
    mockApi({ ...base, "GET /api/settings/api-keys": () => ({ body: { items: [existing] } }) });
    const { container } = renderUI(<IntegrationsPage />, { role: "owner" });
    await screen.findByText("ERP sync");
    expect(screen.getByRole("link", { name: /Lead sources/ }).getAttribute("href")).toBe(
      "/settings/lead-sources",
    );
    const docs = screen.getByRole("link", { name: /API documentation/ });
    expect(docs.getAttribute("href")).toBe("/v1/docs");
    expect(docs.getAttribute("rel")).toContain("noreferrer");
    expect(
      [...container.querySelectorAll("section > div h2[id], section > h2[id]")].map(
        (h) => h.textContent,
      ),
    ).toEqual(["API keys", "Webhooks", "Other connections"]);
    expect(document.body.innerHTML.toLowerCase()).not.toContain(["dog", "rah"].join(""));
    expectSmallScreenSafe(container);
  });
});
