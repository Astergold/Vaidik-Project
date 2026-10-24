import { defineConfig } from "@playwright/test";

/**
 * Browser tests for apps/web (D7-I4-01 journeys, D7-I4-02 screenshot sweep).
 * TODO(D3-I1-02): superseded by I1's e2e harness (compose stack + CI job) when it lands — this file and the root
 * `test:e2e` script are the only merge points. Not part of `pnpm test`/CI yet: run `pnpm test:e2e` locally.
 *
 * Uses the installed Google Chrome (channel "chrome"), so no browser download is needed.
 *  - sweep    → the dev server on :3000 with the stub session (role from localStorage, no backend needed).
 *  - journeys → :3000 too (the API's only trusted origin), signing in for real against the API on :3001; every
 *               journey skips with the reason when the API/seed isn't running.
 *  - no-stub  → a second dev server on :3100 with VITE_STUB_SESSION=false, for the signed-out redirect only.
 */
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { channel: "chrome", headless: true, trace: "retain-on-failure" },
  projects: [
    {
      // Screenshots are this project's artifact; traces only produced teardown noise across 300 tests.
      name: "sweep",
      testMatch: /sweep\.spec\.ts/,
      outputDir: "test-results/sweep",
      use: { baseURL: "http://localhost:3000", trace: "off" },
    },
    {
      // Sign-in needs the API's trusted origin (PUBLIC_BASE_URL = :3000); a real session replaces the stub one.
      name: "journeys",
      outputDir: "test-results/journeys",
      testMatch: /journeys\/roles\.spec\.ts/,
      use: { baseURL: "http://localhost:3000" },
    },
    {
      name: "no-stub",
      outputDir: "test-results/no-stub",
      testMatch: /journeys\/signed-out\.spec\.ts/,
      use: { baseURL: "http://localhost:3100" },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @vernacular/web dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @vernacular/web exec vite dev --port 3100 --strictPort",
      url: "http://localhost:3100",
      env: { VITE_STUB_SESSION: "false" },
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
