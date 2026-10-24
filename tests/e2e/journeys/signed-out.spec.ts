import { expect, test } from "@playwright/test";
import { hydrated, requireBackend } from "../fixtures/auth";

/**
 * Runs on the no-stub dev server (:3100, project "no-stub"): the stub session would otherwise sign a dev user in.
 * No sign-in happens here, so the API's single trusted origin (PUBLIC_BASE_URL, :3000) doesn't matter.
 */
test.describe("everyone", () => {
  test("signed out → /login with the page remembered", async ({ page }) => {
    await requireBackend(page);
    await page.goto("/leads");
    await hydrated(page);
    await expect(page).toHaveURL(/\/login\?redirect=%2Fleads/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});
