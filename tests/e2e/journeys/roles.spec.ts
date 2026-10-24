import { expect, test } from "@playwright/test";
import { loginAs, sidebarAreas } from "../fixtures/auth";

/**
 * D7-I4-01 role journeys, against the real API + seeded DB. Only steps whose endpoints exist are real tests; steps that
 * need an API that isn't built yet are `test.fixme` with the module they wait for — a visible checklist, never a
 * green tick for a "not available yet" screen.
 */
test.use({ viewport: { width: 1440, height: 900 } });

test.describe("admin journey (owner)", () => {
  test("lands on the dashboard; sees Settings, not Platform", async ({ page }) => {
    await loginAs(page, "owner");
    await expect(page).toHaveURL(/\/dashboard/);
    const areas = await sidebarAreas(page);
    expect(areas).toContain("Settings");
    expect(areas).not.toContain("Platform");
  });

  test("changes the calling policy, sees it persist, and restores it", async ({ page }) => {
    await loginAs(page, "owner");
    await page.goto("/settings/policy");
    const perDay = page.getByLabel("Max calls per day");
    await expect(perDay).toBeVisible();
    const original = await perDay.inputValue();
    const changed = original === "3" ? "2" : "3";
    await perDay.fill(changed);
    await page.getByRole("button", { name: "Save policy" }).click();
    await expect(page.getByText(/Saved — applies to the next dial/)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Max calls per day")).toHaveValue(changed);
    await page.getByLabel("Max calls per day").fill(original);
    await page.getByRole("button", { name: "Save policy" }).click();
    await expect(page.getByText(/Saved — applies to the next dial/)).toBeVisible();
  });

  test("reads lead sources", async ({ page }) => {
    await loginAs(page, "owner");
    await page.goto("/settings/lead-sources");
    await expect(page.getByRole("heading", { name: "Lead sources" })).toBeVisible();
    await expect(page.getByText(/Couldn't load lead sources/)).toHaveCount(0);
  });

  test.fixme("creates an AI agent — needs apps/api/src/modules/agents (D4-I2)", async () => {});
  test.fixme("creates and starts a campaign — needs apps/api/src/modules/campaigns (D3-I3-04)", async () => {});
});

test.describe("admission-head journey", () => {
  test("dashboard funnel, then the leads list with a stage filter", async ({ page }) => {
    await loginAs(page, "head");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/Couldn't load the dashboard/)).toHaveCount(0);
    await page.goto("/leads");
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
    await expect(page.getByText(/in total/)).toBeVisible();
    await page.getByRole("button", { name: /^Stage/ }).click();
    await page.getByRole("menuitemcheckbox", { name: "New" }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/stage=/);
  });

  test.fixme("bulk-assigns leads — needs POST /api/leads/bulk (D6-I2-05)", async () => {});
  test.fixme("approves a planner proposal — needs apps/api/src/modules/planner (D6-I2-03/04)", async () => {});
  test.fixme("sees who has paid — needs apps/api/src/modules/applications (D5-I1-01)", async () => {});
});

test.describe("counsellor journey", () => {
  test("lands on My workspace; phones are masked by the server", async ({ page }) => {
    await loginAs(page, "counsellor");
    await expect(page).toHaveURL(/\/workspace/);
    await page.goto("/leads");
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
    await expect(page.getByText(/in total|matching/)).toBeVisible();
    const body = await page.locator("main").innerText();
    expect(body).not.toMatch(/\+91\s?\d{10}/);
    expect(body).toMatch(/•{6}\d{4}/); // the server's mask, rendered as received
  });

  test("opens a lead and logs a note on its timeline", async ({ page }) => {
    await loginAs(page, "counsellor");
    await page.goto("/leads");
    await expect(page.getByText(/in total|matching/)).toBeVisible(); // the list has loaded
    const first = page.locator("main table a[href^='/leads/']").first();
    test.skip((await first.count()) === 0, "This counsellor has no leads in the seed");
    await first.click();
    await expect(
      page.getByRole("heading", { name: "Activity" }).or(page.locator("#timeline-h")),
    ).toBeVisible();
    const text = `e2e note ${Date.now()}`;
    await page.getByLabel("Add a note").fill(text);
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText(text)).toBeVisible();
  });

  test.fixme("works the needs-counsellor queue — needs apps/api/src/modules/queue (D4-I2)", async () => {});
  test.fixme("reviews an AI call (verify / override) — needs GET/POST /api/calls/:id/review (D4-I2-03)", async () => {});
  test.fixme("books a campus visit and logs the outcome — needs apps/api/src/modules/visits (D4-I2)", async () => {});
});

test.describe("super-admin journey", () => {
  // Found by this journey: GET /api/me answers 403 NO_TENANT_CONTEXT for the platform admin (no tenant membership),
  // so the web has no session for a real super-admin. Needs a platform-level "me" from I2 before this can run.
  test.fixme("lands on Platform → Tenants — needs a platform session (GET /api/me → 403 NO_TENANT_CONTEXT today)", async ({
    page,
  }) => {
    await loginAs(page, "super_admin");
    await expect(page).toHaveURL(/\/platform\/tenants/);
    const areas = await sidebarAreas(page);
    expect(areas).toContain("Platform");
    expect(areas).not.toContain("Leads");
  });

  test.fixme("creates 'Demo College' — needs apps/api/src/modules/platform (D6-I3-01)", async () => {});
  test.fixme("impersonates the owner (banner + audit log) — needs /api/platform/impersonate (D6-I3-02)", async () => {});
  test.fixme("tops up a wallet — needs /api/platform/tenants/:id/top-up (D6-I2-01)", async () => {});
});
