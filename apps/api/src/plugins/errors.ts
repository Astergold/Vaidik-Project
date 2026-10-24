import type { FastifyError, FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";
import { AppError } from "../errors.js";

export function body(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

const STATUS_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "VALIDATION_ERROR",
  429: "RATE_LIMITED",
};

export function registerErrorHandling(app: FastifyInstance) {
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send(body("NOT_FOUND", "Route not found"));
  });

  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send(body(err.code, err.message, err.details));
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      const details = err.validation.map((v) => ({
        path: (v.instancePath || "").replace(/^\//, "").replaceAll("/", ".") || undefined,
        message: v.message,
      }));
      return reply.status(422).send(body("VALIDATION_ERROR", "Request validation failed", details));
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ err }, "response failed schema validation");
      return reply.status(500).send(body("INTERNAL", "Internal server error"));
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.status(status).send(body(STATUS_CODES[status] ?? "BAD_REQUEST", err.message));
    }
    req.log.error({ err }, "unhandled error");
    // Never leak internals (and never provider names) to clients.
    return reply.status(500).send(body("INTERNAL", "Internal server error"));
  });
}
