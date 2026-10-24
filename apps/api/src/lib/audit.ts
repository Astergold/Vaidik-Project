import type { Tx } from "@vernacular/db";
import type { AuthContext } from "../types.js";

/** Append-only audit trail (audit_log). Call inside the request transaction so it commits with the change. */
export async function audit(
  tx: Tx,
  auth: AuthContext,
  entry: {
    action: string;
    entity: string;
    entityId?: string | null;
    diff?: unknown;
    ip?: string | null;
  },
): Promise<void> {
  await tx
    .insertInto("audit_log")
    .values({
      tenant_id: auth.tenantId,
      actor_user_id: auth.userId,
      impersonator_id: auth.impersonatedBy,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      diff: entry.diff === undefined ? null : JSON.stringify(entry.diff),
      ip: entry.ip ?? null,
    } as never)
    .execute();
}
