// @vitest-environment jsdom
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { CallsPage } from "@/features/calls/CallsPage";
import { DuplicatesPage } from "@/features/duplicates/DuplicatesPage";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";
import { CompliancePage } from "@/features/planner/CompliancePage";
import { PlannerPage } from "@/features/planner/PlannerPage";
import { MatrixPage } from "@/features/programs/MatrixPage";
import { ExportsPage } from "@/features/reports/ExportsPage";
import { PerformancePage } from "@/features/reports/PerformancePage";
import { canView, PAGES, VIEWER_ROLES, type PageId } from "@/lib/sitemap";
import { mockApi, renderUI } from "@/test/utils";

/** D6-I4-04 pages → the "… not available yet" title each shows when its API route is missing. */
const PAGES_UNDER_TEST: [PageId, ComponentType, string][] = [
  ["calls.list", CallsPage, "Calls service not available yet"],
  ["leads.duplicates", DuplicatesPage, "Duplicates service not available yet"],
  ["system.notifications", NotificationsPage, "Notifications service not available yet"],
  ["ai.planner", PlannerPage, "Planner service not available yet"],
  ["ai.compliance", CompliancePage, "Compliance report service not available yet"],
  ["programs.matrix", MatrixPage, "Programs service not available yet"],
  ["reports.performance", PerformancePage, "Reports service not available yet"],
  ["reports.exports", ExportsPage, "Reports service not available yet"],
];
const PROVIDER = ["dog", "rah"].join("");

describe("D6-I4-04 daily-use pages: sitemap roles + 404 seam", () => {
  for (const [id, Page, unavailable] of PAGES_UNDER_TEST) {
    it(`${id}: roles exactly as the sitemap says (others make no request)`, () => {
      for (const role of VIEWER_ROLES) {
        const calls = mockApi({});
        const r = renderUI(<Page />, { role });
        const gated = screen.queryByText("Not available for your role") !== null;
        expect(gated, `${id} as ${role}`).toBe(!canView(PAGES[id], role));
        if (gated) expect(calls).toHaveLength(0);
        r.unmount();
      }
    });

    it(`${id}: missing API → "${unavailable}", no rows, no provider name`, async () => {
      const role = PAGES[id].roles.find((r) => r !== "super_admin")!;
      mockApi({});
      const { container } = renderUI(<Page />, { role });
      expect((await screen.findAllByText(unavailable)).length).toBeGreaterThan(0);
      expect(container.querySelector("tbody tr")).toBeNull();
      expect(document.body.innerHTML.toLowerCase()).not.toContain(PROVIDER);
    });
  }
});
