import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      // Handbook D3-I2-01: 100% branch coverage on this package. CI fails below it.
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
