import type { FastifyRequest } from "fastify";
import type { ControlledTx } from "@vernacular/db";
import { unauthenticated } from "./errors.js";
import type { AuthContext } from "./types.js";

/** Handlers get the tenant transaction + caller identity from here. Throws if used on a public route. */
export function tenantCtx(req: FastifyRequest): { tx: ControlledTx; auth: AuthContext } {
  if (!req.tx || !req.authCtx) throw unauthenticated();
  return { tx: req.tx, auth: req.authCtx };
}
