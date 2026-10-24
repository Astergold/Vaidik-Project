import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // DOM tests opt in per file with `// @vitest-environment jsdom`; the rest stay in node.
    setupFiles: ["src/test/setup.ts"],
  },
});
