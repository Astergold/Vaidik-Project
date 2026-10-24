// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CallingPlatformStatus } from "@vernacular/contracts";
import { CallingPlatformSection } from "@/features/integrations/CallingPlatformSection";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

const KEY = "test_only_key_not_real_9876"; // made-up test string
const OFF: CallingPlatformStatus = {
  connected: false,
  keyLast4: null,
  updatedAt: null,
  workflowCount: null,
};
const ON: CallingPlatformStatus = {
  connected: true,
  keyLast4: "9876",
  updatedAt: "2026-10-24T05:00:00.000Z",
  workflowCount: 3,
};

describe("Integrations → Calling platform", () => {
  it("not connected → connect sends the key once, then shows only its last 4 characters", async () => {
    const calls = mockApi({
      "GET /api/settings/calling-platform": () => ({ body: OFF }),
      "PUT /api/settings/calling-platform": () => ({ body: ON }),
    });
    const { container } = renderUI(<CallingPlatformSection />, { role: "owner" });
    expect(await screen.findByText(/Not connected/)).toBeTruthy();
    const input = screen.getByLabelText("API key") as HTMLInputElement;
    expect(input.type).toBe("password");
    await userEvent.type(input, KEY);
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText("Connected")).toBeTruthy();
    expect(screen.getByText("…9876")).toBeTruthy();
    expect(screen.getByText(/3 workflows available/)).toBeTruthy();
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({ apiKey: KEY });
    expect(container.innerHTML).not.toContain(KEY);
    expect(screen.queryByLabelText(/API key/)).toBeNull();
    expectSmallScreenSafe(container);
  });

  it("too short a key is caught before sending; a refused key shows the server's message", async () => {
    const calls = mockApi({
      "GET /api/settings/calling-platform": () => ({ body: OFF }),
      "PUT /api/settings/calling-platform": () => ({
        status: 422,
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: "The calling platform rejected this API key. Copy it again and retry.",
          },
        },
      }),
    });
    renderUI(<CallingPlatformSection />, { role: "owner" });
    const input = await screen.findByLabelText("API key");
    await userEvent.type(input, "short");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByText("Paste the full API key")).toBeTruthy();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    await userEvent.clear(input);
    await userEvent.type(input, KEY);
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText(/rejected this API key/)).toBeTruthy();
  });

  it("connected → replace key, and disconnect after confirming", async () => {
    let state = ON;
    const calls = mockApi({
      "GET /api/settings/calling-platform": () => ({ body: state }),
      "DELETE /api/settings/calling-platform": () => {
        state = OFF;
        return { status: 200, body: OFF };
      },
    });
    renderUI(<CallingPlatformSection />, { role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: "Replace key" }));
    expect(screen.getByLabelText("New API key")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: "Disconnect" })[0]!);
    await waitFor(() => expect(screen.getByText(/Not connected/)).toBeTruthy());
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("load error offers a retry", async () => {
    mockApi({
      "GET /api/settings/calling-platform": () => ({
        status: 500,
        body: { error: { code: "X", message: "Server hiccup" } },
      }),
    });
    renderUI(<CallingPlatformSection />, { role: "owner" });
    expect(await screen.findByText("Couldn't load the connection")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
