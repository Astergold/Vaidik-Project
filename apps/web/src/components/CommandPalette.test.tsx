// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { searchResponse } from "@vernacular/contracts";
import { CommandPalette } from "@/components/CommandPalette";
import { isPaletteShortcut, moveActive, pageItems } from "@/components/palette";
import { Topbar } from "@/components/Topbar";
import { mockApi, renderUI } from "@/test/utils";

const LEAD = "01a14679-0000-7000-8000-000000001aa1";
const results = searchResponse.parse({
  results: [
    {
      leadId: LEAD,
      name: "Asha Rao",
      phone: "+91******4321",
      email: null,
      applicationNo: "APP-12",
      stage: "interested",
      program: "B.Des",
      matched: "phone",
    },
  ],
});

describe("palette model (D6-I4-04a)", () => {
  it("page shortcuts come from the sitemap for the role", () => {
    expect(pageItems("counsellor", "campaign")).toEqual([]); // counsellors have no Campaigns page
    expect(pageItems("admin", "camp").map((i) => i.kind === "page" && i.path)).toContain(
      "/campaigns",
    );
    expect(
      pageItems("super_admin", "").every(
        (i) => i.kind === "page" && (i.area === "Platform" || i.area === "System"),
      ),
    ).toBe(true);
  });
  it("keys", () => {
    expect(moveActive("ArrowDown", 2, 3)).toBe(0);
    expect(moveActive("ArrowUp", 0, 3)).toBe(2);
    expect(moveActive("End", 0, 3)).toBe(2);
    expect(moveActive("x", 0, 3)).toBeNull();
    expect(isPaletteShortcut({ key: "k", ctrlKey: true, metaKey: false })).toBe(true);
    expect(isPaletteShortcut({ key: "K", ctrlKey: false, metaKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: "k", ctrlKey: false, metaKey: false })).toBe(false);
  });
});

describe("CommandPalette (D6-I4-04a)", () => {
  it("searches the server from 2 characters; ↓/Enter opens the lead (phone shown as received)", async () => {
    const calls = mockApi({ "GET /api/search": () => ({ body: results }) });
    const { router } = renderUI(<CommandPalette open onOpenChange={() => {}} role="counsellor" />);
    const input = screen.getByRole("combobox", { name: "Search leads and pages" });
    await userEvent.type(input, "4");
    expect(calls.some((c) => c.path === "/api/search")).toBe(false);
    await userEvent.type(input, "321");
    const option = await screen.findByRole("option", { name: /Asha Rao/ });
    expect(within(option).getByText(/\+91\*{6}4321/)).toBeTruthy();
    expect(within(option).getByText("by phone")).toBeTruthy();
    expect(calls.find((c) => c.path === "/api/search")!.query.get("q")).toBe("4321");
    expect(option.getAttribute("aria-selected")).toBe("true");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe(`/leads/${LEAD}`));
  });

  it("search API missing → says so, pages still work with the keyboard", async () => {
    mockApi({});
    const { router } = renderUI(<CommandPalette open onOpenChange={() => {}} role="admin" />);
    await userEvent.type(screen.getByRole("combobox"), "camp");
    expect(await screen.findByText(/Lead search isn't available yet/)).toBeTruthy();
    const opt = screen.getByRole("option", { name: /Campaigns/ });
    expect(opt.getAttribute("aria-selected")).toBe("true");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/campaigns"));
  });

  it("super-admins only jump to pages (no lead search request)", async () => {
    const calls = mockApi({});
    renderUI(<CommandPalette open onOpenChange={() => {}} role="super_admin" />);
    await userEvent.type(screen.getByRole("combobox"), "ten");
    expect(screen.getByRole("option", { name: /Tenants/ })).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("Ctrl+K anywhere opens it from the top bar; the search button too", async () => {
    mockApi({});
    renderUI(<Topbar onOpenNav={() => {}} />, { role: "admin" });
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("combobox")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Search (Ctrl+K)" }));
    expect(await screen.findByRole("combobox")).toBeTruthy();
  });
});
