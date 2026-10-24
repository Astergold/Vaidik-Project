// @vitest-environment jsdom
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { AuditLogPage } from "@/features/platform/AuditLogPage";
import { HealthPage } from "@/features/platform/HealthPage";
import { NewTenantWizard } from "@/features/platform/NewTenantWizard";
import { PlansPage } from "@/features/platform/PlansPage";
import { TenantsPage } from "@/features/platform/TenantsPage";
import { navFor, PAGES, type PageId } from "@/lib/sitemap";
import { mockApi, renderUI } from "@/test/utils";

const PLATFORM: [PageId, ComponentType][] = [
  ["platform.tenants", TenantsPage],
  ["platform.newTenant", NewTenantWizard],
  ["platform.plans", PlansPage],
  ["platform.health", HealthPage],
  ["platform.audit", AuditLogPage],
];
const PROVIDER = ["dog", "rah"].join("");

describe("platform console: super-admin only, 404 seam everywhere (D6-I4-01)", () => {
  it("covers every Platform page in the sitemap", () => {
    const sitemap = Object.entries(PAGES)
      .filter(([, p]) => p.area === "Platform")
      .map(([id]) => id)
      .sort();
    expect(PLATFORM.map(([id]) => id).sort()).toEqual(sitemap);
    expect(navFor("super_admin").map((g) => g.area)).toContain("Platform");
    expect(navFor("owner").map((g) => g.area)).not.toContain("Platform");
  });

  for (const [id, Page] of PLATFORM) {
    it(`${id}: tenant roles get the role gate and make no request`, () => {
      for (const role of ["owner", "admin", "admission_head", "counsellor"] as const) {
        const calls = mockApi({});
        const r = renderUI(<Page />, { role });
        expect(screen.getByText("Not available for your role")).toBeTruthy();
        expect(calls).toHaveLength(0);
        r.unmount();
      }
    });

    it(`${id}: missing API → "Platform service not available yet", no provider name`, async () => {
      mockApi({});
      renderUI(<Page />, { role: "super_admin" });
      expect(await screen.findByText("Platform service not available yet")).toBeTruthy();
      expect(document.body.innerHTML.toLowerCase()).not.toContain(PROVIDER);
    });
  }
});
