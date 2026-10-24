import { expect, test } from "@playwright/test";
import { PAGES, type PageDef, type PageId, type ViewerRole } from "../../apps/web/src/lib/sitemap";
import { overflow, retryOnNavigation, settle, STATES, stubApi, useDevRole } from "./fixtures/stub";

/**
 * D7-I4-02 screenshot sweep, driven by the sitemap so it can never drift: every page × 1440/390 px × the three
 * backend-less states (see fixtures/stub.ts). Asserts no horizontal overflow and no provider name in the DOM, and
 * saves screenshots to artifacts/screenshots/D7-I4-02/ (gitignored; attach to the PR / sign-off).
 */
const WIDTHS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;
const PROVIDER = ["dog", "rah"].join("");
const OUT = "artifacts/screenshots/D7-I4-02";

/** A role that may see the page: tenant pages as owner/admin when allowed, else the first listed role. */
function roleFor(def: PageDef): ViewerRole {
  for (const r of ["owner", "admin", "admission_head", "counsellor", "super_admin"] as const)
    if (def.roles.includes(r)) return r;
  return def.roles[0]!;
}
const urlFor = (def: PageDef) => def.sampleHref ?? def.path.replace(/\$[^/]+/g, "sample");

const pages = Object.entries(PAGES) as [PageId, PageDef][];

pages.forEach(([id, def], index) => {
  const n = String(index + 1).padStart(2, "0");
  for (const w of WIDTHS) {
    for (const state of STATES) {
      test(`${n} ${id} · ${w.name}px · ${state}`, async ({ page }) => {
        await page.setViewportSize({ width: w.width, height: w.height });
        await useDevRole(page, roleFor(def));
        await stubApi(page, state);
        await page.goto(urlFor(def));
        await settle(page);
        // Let queries settle into their state (loading never settles by design).
        await page.waitForTimeout(state === "loading" ? 600 : 900);

        const o = await overflow(page);
        expect(o.page, "page scrolls sideways").toBeLessThanOrEqual(1);
        expect(o.main, "<main> scrolls sideways").toBeLessThanOrEqual(1);
        const html = await retryOnNavigation(page, () => page.content());
        expect(html.toLowerCase()).not.toContain(PROVIDER);
        await expect(page.getByText("Nothing here yet")).toHaveCount(0); // no placeholder pages left

        await page.screenshot({ path: `${OUT}/${n}-${id}-${state}-${w.name}.png`, fullPage: true });
      });
    }
  }
});
