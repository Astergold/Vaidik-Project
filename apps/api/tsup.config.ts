import { defineConfig } from "tsup";

// Bundle workspace packages (they export raw .ts) into one runnable file for Docker.
export default defineConfig({
  entry: { index: "src/index.ts", "jobs-install": "src/jobs/install-cli.ts" },
  format: ["esm"],
  target: "node22",
  clean: true,
  noExternal: ["@vernacular/db", "@vernacular/contracts", "@vernacular/policy"],
  external: [],
  splitting: false,
  treeshake: false,
});
