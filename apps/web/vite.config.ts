import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// The browser only ever talks to its own origin. In dev, /api is proxied to crm-api; on servers Caddy does it.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3001";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { port: 3000, proxy: { "/api": { target: apiTarget, changeOrigin: false } } },
  // nitro() builds the server output for the host (Vercel detects it; locally it is a plain Node server).
  plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
});
