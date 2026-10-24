// @vitest-environment jsdom
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { BrandingPage } from "@/features/settings/BrandingPage";
import { DomainsPage } from "@/features/settings/DomainsPage";
import { EmailPage } from "@/features/settings/EmailPage";
import { GeneralPage } from "@/features/settings/GeneralPage";
import { LlmPage } from "@/features/settings/LlmPage";
import { PolicyPage } from "@/features/settings/policy/PolicyPage";
import { PrivacyPage } from "@/features/settings/PrivacyPage";
import { StagesPage } from "@/features/settings/StagesPage";
import { TeamPage } from "@/features/settings/TeamPage";
import { PAGES, type PageId } from "@/lib/sitemap";
import { mockApi, renderUI } from "@/test/utils";

/** D6-I4-02 settings pages → the "… not available yet" title each shows when its API route is missing. */
const PAGES_UNDER_TEST: [PageId, ComponentType, string][] = [
  ["settings.general", GeneralPage, "Settings service not available yet"],
  ["settings.policy", PolicyPage, "Policy service not available yet"],
  ["settings.stages", StagesPage, "Settings service not available yet"],
  ["settings.branding", BrandingPage, "Branding service not available yet"],
  ["settings.domains", DomainsPage, "Domains service not available yet"],
  ["settings.team", TeamPage, "Team service not available yet"],
  ["settings.email", EmailPage, "Email service not available yet"],
  ["settings.llm", LlmPage, "LLM settings service not available yet"],
  ["settings.privacy", PrivacyPage, "Privacy service not available yet"],
];
const PROVIDER = ["dog", "rah"].join("");

describe("D6-I4-02 settings: roles from the sitemap, 404 seam everywhere", () => {
  it("every page under test is an owner/admin page in the sitemap", () => {
    for (const [id] of PAGES_UNDER_TEST) expect(PAGES[id].roles).toEqual(["owner", "admin"]);
  });

  for (const [id, Page, unavailable] of PAGES_UNDER_TEST) {
    it(`${id}: heads, counsellors and super-admins get the role gate and make no request`, () => {
      for (const role of ["admission_head", "counsellor", "super_admin"] as const) {
        const calls = mockApi({});
        const r = renderUI(<Page />, { role });
        expect(screen.getByText("Not available for your role")).toBeTruthy();
        expect(calls).toHaveLength(0);
        r.unmount();
      }
    });

    it(`${id}: missing API → "${unavailable}", nothing faked, no provider name`, async () => {
      mockApi({});
      const { container } = renderUI(<Page />, { role: "owner" });
      expect((await screen.findAllByText(unavailable)).length).toBeGreaterThan(0);
      expect(container.querySelector("tbody tr")).toBeNull();
      expect(document.body.innerHTML.toLowerCase()).not.toContain(PROVIDER);
    });
  }
});
