import type { Page, Route } from "@playwright/test";

/**
 * Test-only network stubs for pages whose API doesn't exist yet (D7-I4-02). These never feed the app fake data:
 * they reproduce the three things a real browser can see without a backend —
 *   "missing": every API route answers 404 "Route not found" (the 404 seam → "… not available yet");
 *   "loading": API requests never answer (skeletons);
 *   "error":   API requests answer 500 (error cards with "Try again").
 * /api/me always answers 401, so the dev server's stub session (role from localStorage) is used.
 */
export const STATES = ["missing", "loading", "error"] as const;
export type StubState = (typeof STATES)[number];

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

export async function stubApi(page: Page, state: StubState) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return json(route, 401, { error: { code: "UNAUTHORIZED", message: "Sign in" } });
    if (state === "loading") return; // leave it pending
    if (state === "error") return json(route, 500, { error: { code: "INTERNAL", message: "Something went wrong" } });
    return json(route, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
  });
}

/** The dev stub session reads its role from localStorage (see apps/web/src/lib/session.tsx). */
export async function useDevRole(page: Page, role: string) {
  await page.addInitScript((r) => window.localStorage.setItem("vernacular.devRole", r), role);
}

/**
 * Wait for the document load and a stable URL (client redirects such as / → /dashboard happen after load).
 * Measuring earlier raced navigations: "Execution context was destroyed" (~1 in 50 in the audit's run).
 */
export async function settle(page: Page) {
  await page.waitForLoadState("load");
  let last = "";
  for (let i = 0; i < 10 && page.url() !== last; i++) {
    last = page.url();
    await page.waitForTimeout(150);
  }
}

/** Re-run a DOM read when a navigation (redirect, dev-server reload) replaced the page underneath it. */
export async function retryOnNavigation<T>(page: Page, read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (e) {
      if (attempt >= 4 || !/Execution context was destroyed|navigat/i.test(String(e))) throw e;
      await settle(page);
    }
  }
}

/** Horizontal overflow of the page and of the scrolling <main> (the shell keeps <body> fixed). */
export async function overflow(page: Page) {
  return retryOnNavigation(page, () => page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector("main");
    return {
      page: doc.scrollWidth - doc.clientWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  }));
}
