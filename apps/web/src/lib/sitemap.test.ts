import { describe, expect, it } from "vitest";
import { getRouter } from "@/router";
import {
  AREAS,
  canView,
  homeFor,
  isAuthPath,
  navFor,
  PAGES,
  VIEWER_ROLES,
  type Area,
  type ViewerRole,
} from "@/lib/sitemap";

const areasFor = (role: ViewerRole): Area[] => navFor(role).map((g) => g.area);
const navPaths = (role: ViewerRole): string[] =>
  navFor(role).flatMap((g) => g.items.map((i) => i.path));

describe("sitemap (Appendix B)", () => {
  it("has a route for every page, plus /", () => {
    const routed = new Set(Object.keys(getRouter().routesByPath));
    for (const page of Object.values(PAGES)) expect(routed, page.path).toContain(page.path);
    expect(routed).toContain("/");
  });

  it("covers every area", () => {
    const used = new Set(Object.values(PAGES).map((p) => p.area));
    expect([...used].sort()).toEqual([...AREAS].sort());
  });

  it("counsellor sees only their scoped areas", () => {
    expect(areasFor("counsellor")).toEqual([
      "Home",
      "Leads",
      "Calls",
      "Visits & calendar",
      "System",
    ]);
    expect(navPaths("counsellor")).toContain("/workspace");
    expect(navPaths("counsellor")).not.toContain("/dashboard");
  });

  it("admission head gets management areas; in Settings only Lead sources (read-only, like the API)", () => {
    expect(areasFor("admission_head")).toContain("Campaigns");
    const settings = navFor("admission_head").find((g) => g.area === "Settings");
    expect(settings?.items.map((p) => p.path)).toEqual(["/settings/lead-sources"]);
    expect(areasFor("admission_head")).not.toContain("Platform");
  });

  it("settings are owner/admin only, except Lead sources which heads may view", () => {
    for (const page of Object.values(PAGES).filter((p) => p.area === "Settings")) {
      const expected =
        page.path === "/settings/lead-sources"
          ? ["admin", "admission_head", "owner"]
          : ["admin", "owner"];
      expect([...page.roles].sort(), page.path).toEqual(expected);
    }
    expect(navFor("counsellor").some((g) => g.area === "Settings")).toBe(false);
  });

  it("super-admin sees Platform and System only", () => {
    expect(areasFor("super_admin")).toEqual(["Platform", "System"]);
    for (const role of VIEWER_ROLES.filter((r) => r !== "super_admin")) {
      expect(areasFor(role), role).not.toContain("Platform");
    }
  });

  it("auth pages never appear in the sidebar", () => {
    for (const role of VIEWER_ROLES) expect(areasFor(role)).not.toContain("Auth");
  });

  it("every role's home page is one it can view", () => {
    for (const role of VIEWER_ROLES) {
      const home = Object.values(PAGES).find((p) => p.path === homeFor(role));
      expect(home && canView(home, role), role).toBe(true);
    }
  });
});

describe("isAuthPath", () => {
  it("matches auth pages, including the invite link with its id", () => {
    for (const p of [
      "/login",
      "/forgot-password",
      "/reset-password",
      "/accept-invitation/abc-123",
    ]) {
      expect(isAuthPath(p), p).toBe(true);
    }
    for (const p of [
      "/",
      "/leads",
      "/accept-invitation",
      "/accept-invitation/a/b",
      "/login-help",
    ]) {
      expect(isAuthPath(p), p).toBe(false);
    }
  });
});
