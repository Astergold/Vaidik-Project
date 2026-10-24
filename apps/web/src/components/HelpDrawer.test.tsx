// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpDrawer } from "@/components/HelpDrawer";
import { HELP, pageForPath } from "@/lib/help";
import { PAGES } from "@/lib/sitemap";
import { mockApi, renderUI } from "@/test/utils";

describe("in-app help (D7-I4-03)", () => {
  it("every signed-in page has at least one tip, and no provider name", () => {
    for (const id of Object.keys(PAGES).filter((k) => !k.startsWith("auth."))) {
      const tips = HELP[id as keyof typeof HELP];
      expect(tips?.length, id).toBeGreaterThan(0);
      expect(tips.join(" ").toLowerCase()).not.toContain(["dog", "rah"].join(""));
    }
  });

  it("maps paths to pages: static paths beat parameter paths; unknown and auth → null", () => {
    expect(pageForPath("/leads/duplicates")).toBe("leads.duplicates");
    expect(pageForPath("/leads/01a14679-0000-7000-8000-000000000001")).toBe("leads.detail");
    expect(pageForPath("/campaigns/new")).toBe("campaigns.new");
    expect(pageForPath("/campaigns/abc/edit")).toBe("campaigns.edit");
    expect(pageForPath("/settings")).toBe("settings.general");
    expect(pageForPath("/settings/")).toBe("settings.general");
    expect(pageForPath("/login")).toBeNull();
    expect(pageForPath("/nope")).toBeNull();
  });

  it("the ? button opens tips for the current route", async () => {
    mockApi({});
    renderUI(<HelpDrawer />, { path: "/settings/policy", role: "admin" });
    await userEvent.click(screen.getByRole("button", { name: "Help for this page" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Policy & holidays")).toBeTruthy();
    expect(within(sheet).getByText(/last call starts at 20:59/)).toBeTruthy();
  });

  it("unknown routes get a generic panel", async () => {
    mockApi({});
    renderUI(<HelpDrawer />, { path: "/somewhere-else" });
    await userEvent.click(screen.getByRole("button", { name: "Help for this page" }));
    expect(await screen.findByText("No tips for this page yet.")).toBeTruthy();
  });
});
