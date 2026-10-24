import type { FastifyInstance, FastifyRequest } from "fastify";

export function toWebHeaders(raw: FastifyRequest["headers"]): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => h.append(k, x));
    else h.set(k, String(v));
  }
  return h;
}

/** Mounts Better Auth at /api/auth/*. Public by definition (login, reset, callbacks). */
export function registerAuthRoute(app: FastifyInstance) {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: {
      public: true,
      // Brute-force protection on credentials endpoints.
      rateLimit: app.config.rateLimitEnabled ? { max: 20, timeWindow: "1 minute" } : false,
    },
    schema: { hide: true },
    handler: async (req, reply) => {
      const headers = toWebHeaders(req.headers);
      headers.delete("content-length");
      const url = new URL(req.url, app.config.publicBaseUrl);
      const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.rawBody !== undefined;
      const res = await app.auth.handler(
        new Request(url, {
          method: req.method,
          headers,
          body: hasBody ? new Uint8Array(req.rawBody!) : undefined,
        }),
      );
      reply.status(res.status);
      res.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "set-cookie") reply.header(key, value);
      });
      const cookies = res.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      return reply.send(res.body ? Buffer.from(await res.arrayBuffer()) : null);
    },
  });
}
