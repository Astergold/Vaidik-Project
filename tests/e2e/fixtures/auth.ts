import { expect, test, type Page } from "@playwright/test";

/**
 * Real sign-in for the role journeys (D7-I4-01) with the seeded accounts (`pnpm db:seed`). The password comes from
 * SEED_PASSWORD (read from .env when not exported). Journeys run on the no-stub dev server (:3100), so a missing
 * session really redirects to /login.
 */
export type SeedRole = "owner" | "head" | "counsellor" | "super_admin";

const EMAIL: Record<SeedRole, string> = {
  owner: "owner@mit-adt.local",
  head: "head@mit-adt.local",
  counsellor: "c1@mit-adt.local",
  super_admin: process.env.SEED_PLATFORM_ADMIN_EMAIL ?? "admin@laveric.local",
};

function seedPassword(): string | undefined {
  if (!process.env.SEED_PASSWORD) {
    try {
      process.loadEnvFile(".env");
    } catch {
      // no .env: the journeys skip below
    }
  }
  return process.env.SEED_PASSWORD;
}

/**
 * Skips the test (with the reason) unless the API answers through the web proxy and a seed password is known.
 * A 401 from /api/me means "API up, not signed in" — exactly what a fresh browser should see.
 */
export async function requireBackend(page: Page) {
  const res = await page.request.get("/api/me").catch(() => null);
  const up = res !== null && [200, 401].includes(res.status());
  test.skip(!up, "Needs the API + seeded DB: pnpm db:up && pnpm db:migrate && pnpm jobs:install && pnpm db:seed && pnpm dev");
  test.skip(!seedPassword(), "Set SEED_PASSWORD (see .env.example)");
}

/**
 * Wait until the app has taken over the server-rendered HTML. Interacting earlier submits forms natively — the bug
 * this harness found on its first cold run (credentials in the URL; fixed with method="post").
 */
export async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
}

export async function loginAs(page: Page, role: SeedRole) {
  await requireBackend(page);
  await page.goto("/login");
  await hydrated(page);
  await page.getByLabel("Email").fill(EMAIL[role]);
  await page.getByLabel("Password").fill(seedPassword()!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Sidebar area headings for the signed-in role. */
export async function sidebarAreas(page: Page): Promise<string[]> {
  const nav = page.getByRole("navigation", { name: "Main" }).first();
  // textContent, not innerText: the labels are CSS-uppercased.
  return (await nav.locator("p.uppercase").allTextContents()).map((t) => t.trim());
}
