// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { whatsappSettings } from "@vernacular/contracts";
import { WhatsAppSettingsPage } from "@/features/whatsapp/WhatsAppSettingsPage";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract.
const TPL = "01a14679-0000-7000-8000-0000000003a1";
const settings = whatsappSettings.parse({
  status: "connected",
  senderName: "MIT-ADT Admissions",
  senderNumber: "+91 20 0000 0000",
  hasApiKey: true,
  lastSyncedAt: "2026-10-17T03:30:00.000Z",
  templates: [
    {
      id: TPL,
      name: "visit_reminder",
      language: "en",
      category: "utility",
      body: "Hi {{1}}, your visit is on {{2}}.",
      status: "approved",
      variables: [
        { key: "1", label: "Student name", field: "first_name", defaultValue: null },
        { key: "2", label: "Visit date", field: null, defaultValue: null },
      ],
    },
  ],
});
const PROVIDER = ["dog", "rah"].join("");

describe("Settings → WhatsApp (D5-I4-02)", () => {
  it("shows status, sender, stored-key badge (never the key), templates and current mappings", async () => {
    mockApi({ "GET /api/settings/whatsapp": () => ({ body: settings }) });
    const { container } = renderUI(<WhatsAppSettingsPage />, { role: "admin" });
    expect(await screen.findByText("Connected")).toBeTruthy();
    expect((screen.getByLabelText("Sender name") as HTMLInputElement).value).toBe(
      "MIT-ADT Admissions",
    );
    expect(screen.getByText("Stored")).toBeTruthy();
    expect((screen.getByLabelText(/API key/) as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Synced 17 Oct, 9:00 am")).toBeTruthy();
    expect((screen.getByLabelText("{{1}} Student name") as HTMLSelectElement).value).toBe(
      "first_name",
    );
    expect((screen.getByLabelText("{{2}} Visit date") as HTMLSelectElement).value).toBe("");
    expect(document.body.innerHTML.toLowerCase()).not.toContain(PROVIDER);
    expectSmallScreenSafe(container);
  });

  it("save: one PUT with sender, every mapping, and the key only when typed; shows the server's reply", async () => {
    const bodies: unknown[] = [];
    mockApi({
      "GET /api/settings/whatsapp": () => ({ body: settings }),
      "PUT /api/settings/whatsapp": ({ body }) => {
        bodies.push(body);
        return { body: { ...settings, senderName: "MIT-ADT" } };
      },
    });
    renderUI(<WhatsAppSettingsPage />, { role: "owner" });
    const sender = await screen.findByLabelText("Sender name");
    await userEvent.clear(sender);
    await userEvent.type(sender, "MIT-ADT");
    await userEvent.selectOptions(screen.getByLabelText("{{2}} Visit date"), "visit_date");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      senderName: "MIT-ADT",
      variableMappings: [
        { templateId: TPL, key: "1", field: "first_name" },
        { templateId: TPL, key: "2", field: "visit_date" },
      ],
    });
    expect(await screen.findByText("Saved")).toBeTruthy();

    await userEvent.type(screen.getByLabelText(/API key/), "wa_live_key_123456");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect((bodies[1] as { apiKey: string }).apiKey).toBe("wa_live_key_123456");
  });

  it("validation mirrors the API: sender name required", async () => {
    const calls = mockApi({ "GET /api/settings/whatsapp": () => ({ body: settings }) });
    renderUI(<WhatsAppSettingsPage />, { role: "admin" });
    await userEvent.clear(await screen.findByLabelText("Sender name"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a sender name")).toBeTruthy();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("states and roles: not available, error, admission head gated", async () => {
    mockApi({});
    const a = renderUI(<WhatsAppSettingsPage />, { role: "admin" });
    expect(await screen.findByText("WhatsApp service not available yet")).toBeTruthy();
    a.unmount();

    mockApi({
      "GET /api/settings/whatsapp": () => ({
        status: 500,
        body: { error: { code: "INTERNAL", message: "Down" } },
      }),
    });
    const b = renderUI(<WhatsAppSettingsPage />, { role: "admin" });
    expect(await screen.findByText("Couldn't load WhatsApp settings")).toBeTruthy();
    b.unmount();

    const calls = mockApi({});
    renderUI(<WhatsAppSettingsPage />, { role: "admission_head" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});
