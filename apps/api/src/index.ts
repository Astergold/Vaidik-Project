import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const config = loadConfig(); // fails fast with a readable message
const app = await buildServer({ config });

// 1. Only use app.listen() if NOT running in Vercel
if (!process.env.VERCEL) {
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}

// 2. Export a Serverless-compatible handler for Vercel
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await app.ready();
  app.server.emit("request", req, res);
}
