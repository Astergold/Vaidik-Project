/**
 * Resolves the calling-platform client for a tenant, just in time: the tenant's own key from tenant_secret
 * (kind dograh_api_key) first, the global key only outside production (config enforces that). Shared by the
 * API routes and the worker jobs so both talk to the platform the same way.
 */
import type { Tx } from "@vernacular/db";
import {
  PlatformClient,
  type CallPlatform,
  type CampaignPlatform,
} from "@vernacular/integration-dograh";
import { AppError } from "../../errors.js";
import type { SecretsService } from "../secrets/service.js";

/** Campaign + single-call surface of the platform for one tenant. */
export type TenantPlatform = CampaignPlatform & CallPlatform;
export type PlatformResolver = (tenantId: string, tx?: Tx) => Promise<TenantPlatform>;

export const platformNotConfigured = () =>
  new AppError(
    503,
    "PLATFORM_NOT_CONFIGURED",
    "The calling platform is not connected for your institution yet. An owner or admin can connect it in Settings → Integrations.",
  );

export function createPlatformResolver(deps: {
  secrets: SecretsService;
  baseUrl: string;
  globalApiKey: string | null;
}): PlatformResolver {
  return async (tenantId, tx) => {
    const key = (await deps.secrets.getSecret(tenantId, "dograh_api_key", tx)) ?? deps.globalApiKey;
    if (!key) throw platformNotConfigured();
    return new PlatformClient({ baseUrl: deps.baseUrl, apiKey: key });
  };
}
