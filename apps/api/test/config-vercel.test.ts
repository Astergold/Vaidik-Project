import { describe, expect, it } from "vitest";
import { testConfig } from "./helpers.js";

describe("PUBLIC_BASE_URL on Vercel", () => {
  it("defaults to the preview deployment URL", () => {
    expect(
      testConfig({
        PUBLIC_BASE_URL: undefined,
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_URL: "crm-abc.vercel.app",
      }).publicBaseUrl,
    ).toBe("https://crm-abc.vercel.app");
  });
  it("uses the production domain in production", () => {
    expect(
      testConfig({
        PUBLIC_BASE_URL: undefined,
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_URL: "crm-abc.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "crm.example.com",
      }).publicBaseUrl,
    ).toBe("https://crm.example.com");
  });
  it("an explicit PUBLIC_BASE_URL always wins", () => {
    expect(
      testConfig({
        PUBLIC_BASE_URL: "https://app.example.com",
        VERCEL: "1",
        VERCEL_URL: "x.vercel.app",
      }).publicBaseUrl,
    ).toBe("https://app.example.com");
  });
  it("outside Vercel nothing changes", () => {
    expect(testConfig({ PUBLIC_BASE_URL: undefined, VERCEL: undefined }).publicBaseUrl).toBe(
      "http://localhost:3000",
    );
  });
});
