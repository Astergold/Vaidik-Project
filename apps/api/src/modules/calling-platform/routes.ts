/**
 * Settings → Integrations → Calling platform: the tenant's own platform API key (tenant_secret kind dograh_api_key).
 * Owner/admin only. The key is write-only: validated against the platform before it is saved, never returned (only the
 * last four characters), never logged. Every change is audit-logged without the key.
 */
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  apiError,
  callingPlatformStatus,
  putCallingPlatformBody,
  type CallingPlatformStatus,
} from "@vernacular/contracts";
import type { Tx } from "@vernacular/db";
import { PlatformError } from "@vernacular/integration-dograh";
import { tenantCtx } from "../../context.js";
import { AppError, validation } from "../../errors.js";
import { requireRole } from "../../guards.js";
import { audit } from "../../lib/audit.js";

const KIND = "dograh_api_key";
const admins = requireRole("owner", "admin");
const last4 = (k: string) => k.slice(-4);

export const callingPlatformRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ["settings"];

  async function status(tx: Tx, tenantId: string, workflowCount: number | null) {
    const row = await tx
      .selectFrom("tenant_secret")
      .select("updated_at")
      .where("kind", "=", KIND)
      .executeTakeFirst();
    const key = row ? await app.secrets.getSecret(tenantId, KIND, tx) : null;
    const s: CallingPlatformStatus = {
      connected: key !== null,
      keyLast4: key ? last4(key) : null,
      updatedAt: row?.updated_at.toISOString() ?? null,
      workflowCount,
    };
    return s;
  }

  /** Checks a key really works (lists workflows). Tenant-safe errors; the key never appears in them. */
  async function check(apiKey: string): Promise<number> {
    try {
      return (await app.platformForKey(apiKey).listWorkflows()).length;
    } catch (e) {
      if (e instanceof PlatformError && e.code === "AUTH")
        throw validation("The calling platform rejected this API key. Copy it again and retry.", {
          field: "apiKey",
        });
      throw new AppError(
        502,
        "PLATFORM_UNAVAILABLE",
        "The calling platform could not be reached to check the key. Try again in a minute.",
      );
    }
  }

  app.get(
    "/api/settings/calling-platform",
    {
      preHandler: admins,
      schema: {
        tags,
        summary: "Calling platform connection",
        response: { 200: callingPlatformStatus },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      const s = await status(tx, auth.tenantId, null);
      if (!s.connected) return s;
      // best effort: a reachable platform shows how many workflows the key sees
      const key = (await app.secrets.getSecret(auth.tenantId, KIND, tx))!;
      const count = await check(key).catch(() => null);
      return { ...s, workflowCount: count };
    },
  );

  app.put(
    "/api/settings/calling-platform",
    {
      preHandler: admins,
      schema: {
        tags,
        summary: "Connect (or replace) the calling platform API key",
        body: putCallingPlatformBody,
        response: { 200: callingPlatformStatus, 422: apiError, 502: apiError },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      const key = req.body.apiKey;
      const count = await check(key);
      const before = await status(tx, auth.tenantId, null);
      await app.secrets.setSecret(auth.tenantId, KIND, key, tx);
      await audit(tx, auth, {
        action: before.connected ? "calling_platform.key_replaced" : "calling_platform.connected",
        entity: "tenant_secret",
        diff: { keyLast4: last4(key), previousKeyLast4: before.keyLast4 },
      });
      return status(tx, auth.tenantId, count);
    },
  );

  app.delete(
    "/api/settings/calling-platform",
    {
      preHandler: admins,
      schema: {
        tags,
        summary: "Disconnect the calling platform",
        response: { 200: callingPlatformStatus },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      const before = await status(tx, auth.tenantId, null);
      if (before.connected) {
        await tx.deleteFrom("tenant_secret").where("kind", "=", KIND).execute();
        await audit(tx, auth, {
          action: "calling_platform.disconnected",
          entity: "tenant_secret",
          diff: { previousKeyLast4: before.keyLast4 },
        });
      }
      return status(tx, auth.tenantId, null);
    },
  );
};
