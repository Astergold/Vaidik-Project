import { defineConfig } from "tsup";

// Bundle workspace packages (they export raw .ts) into one runnable file for Docker.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  noExternal: [/^@vernacular\//],
});
