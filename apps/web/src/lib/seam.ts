import { ApiCallError, isMissingRoute } from "@/lib/api";
import type { ErrorMeta } from "@/lib/errors";

/**
 * Shared bits for screens built against a PROPOSED contract (the "404 seam", docs/specs/campaigns-ui.md).
 * Errors are shown in place (only a 401 goes to the global sign-in redirect); a "Route not found" 404 means
 * the endpoint isn't deployed yet and the page says so — nothing is ever faked.
 */
export const SEAM_META: ErrorMeta = {
  handles: [0, 400, 403, 404, 409, 413, 415, 422, 500, 502, 503, 504],
};

/** The server's message when it sent one; "not available yet" for a missing route; otherwise the fallback. */
export function errText(err: unknown, fallback: string): string {
  if (isMissingRoute(err)) return "This isn't available yet.";
  if (err instanceof ApiCallError && err.message) return err.message;
  return fallback;
}

export const isForbidden = (err: unknown) => err instanceof ApiCallError && err.status === 403;
