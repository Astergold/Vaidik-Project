import type { preHandlerAsyncHookHandler } from "fastify";
import type { Role } from "@vernacular/contracts";
import type { Tx } from "@vernacular/db";
import { forbidden, notFound } from "./errors.js";
import type { AuthContext } from "./types.js";

/** Roles that see every lead in the tenant. Counsellors only see "their" leads (handbook §7.5). */
const FULL_ACCESS: ReadonlySet<Role> = new Set(["owner", "admin", "admission_head"]);

export function hasFullLeadAccess(a: AuthContext): boolean {
  return a.isPlatformAdmin || FULL_ACCESS.has(a.role);
}

/**
 * Route guard: `preHandler: requireRole("owner", "admin")`. Super-admin always passes.
 * Runs after the tenant scope, so request.authCtx is always set.
 */
export function requireRole(...allowed: Role[]): preHandlerAsyncHookHandler {
  return async (req) => {
    const a = req.authCtx;
    if (!a) throw forbidden(); // misuse: guard used on a public route
    if (a.isPlatformAdmin || allowed.includes(a.role)) return;
    throw forbidden(`Requires one of: ${allowed.join(", ")}`, "INSUFFICIENT_ROLE");
  };
}

/**
 * SQL scope for "which leads can this user see". Returns null when everything is visible.
 * Counsellor "own" = leads assigned to them OR leads of AI agents they're allocated to.
 * Always applied IN ADDITION to RLS (RLS = tenant wall, this = role wall).
 */
export function leadScope(a: AuthContext): { ownerId: string } | null {
  return hasFullLeadAccess(a) ? null : { ownerId: a.userId };
}

/**
 * Asserts the caller may touch this lead. 404 when the lead doesn't exist in the tenant (RLS makes
 * other tenants' leads indistinguishable from missing), 403 when it exists but isn't theirs.
 */
export async function assertLeadAccess(tx: Tx, a: AuthContext, leadId: string): Promise<void> {
  const lead = await tx
    .selectFrom("lead")
    .select(["id", "owner_counsellor_id", "ai_agent_id"])
    .where("id", "=", leadId)
    .executeTakeFirst();
  if (!lead) throw notFound("Lead");
  if (hasFullLeadAccess(a)) return;
  if (lead.owner_counsellor_id === a.userId) return;
  if (lead.ai_agent_id) {
    const allocated = await tx
      .selectFrom("ai_agent_counsellor")
      .select("user_id")
      .where("ai_agent_id", "=", lead.ai_agent_id)
      .where("user_id", "=", a.userId)
      .executeTakeFirst();
    if (allocated) return;
  }
  throw forbidden("This lead is not assigned to you", "LEAD_NOT_ASSIGNED");
}

/** Phone masking for counsellors: keep last 4 digits. Server-side so the UI can never leak more. */
export function maskPhone(phone: string | null, a: AuthContext): string | null {
  if (!phone) return null;
  if (hasFullLeadAccess(a)) return phone;
  const digits = phone.replace(/\D/g, "");
  return `••••••${digits.slice(-4)}`;
}

/**
 * Masks an identifier for counsellors (server-side, so the UI can never show more than it receives).
 * phone: last 4 digits. email: first letter + domain. Other kinds are not personal contact data.
 */
export function maskIdentifier(kind: string, value: string, a: AuthContext): string {
  if (hasFullLeadAccess(a)) return value;
  if (kind === "phone") return maskPhone(value, a) ?? "";
  if (kind === "email") {
    const [local = "", domain = ""] = value.split("@");
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  return value;
}
