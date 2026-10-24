import type { FastifyInstance } from "fastify";

/**
 * Keeps the exact bytes of every JSON body on request.rawBody (HMAC verification for agent tools and
 * webhooks signs the raw body, not re-serialised JSON). Must be registered BEFORE any route.
 */
export function registerRawBody(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, buf, done) => {
    req.rawBody = buf as Buffer;
    if ((buf as Buffer).length === 0) return done(null, undefined);
    try {
      done(null, JSON.parse((buf as Buffer).toString("utf8")));
    } catch {
      const err = new Error("Body is not valid JSON") as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });
}
