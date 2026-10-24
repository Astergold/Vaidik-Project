/** crm.campaign JSON settings ⇄ contract values. Stored rows written by older code fall back to defaults. */
import {
  campaignCircuitBreaker,
  campaignRetry,
  DEFAULT_CAMPAIGN_CIRCUIT_BREAKER,
  DEFAULT_CAMPAIGN_RETRY,
  type CampaignCircuitBreaker,
  type CampaignRetry,
} from "@vernacular/contracts";

export function readRetry(v: unknown): CampaignRetry {
  const r = campaignRetry.safeParse(v);
  return r.success ? r.data : DEFAULT_CAMPAIGN_RETRY;
}

export function readCircuitBreaker(v: unknown): CampaignCircuitBreaker {
  const r = campaignCircuitBreaker.safeParse(v);
  return r.success ? r.data : DEFAULT_CAMPAIGN_CIRCUIT_BREAKER;
}
