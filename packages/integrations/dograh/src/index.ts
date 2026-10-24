/**
 * VoiceDialer adapter for single calls (intake, call-now, callbacks, retries) on the calling platform.
 * Campaign calls go through the platform's campaign feature instead (see platform.ts / docs/specs/campaigns.md).
 * The provider's name never appears in tenant-visible strings.
 */
import { DialerError } from "@vernacular/contracts";
import type { DialRequest, DialResult, VoiceDialer } from "@vernacular/contracts";
import { PlatformClient, PlatformError, resolveWorkflow, type CallPlatform } from "./platform.js";

/** How many of the workflow's newest runs are searched for an earlier call with the same idempotency key. */
const DEDUPE_WINDOW = 50;

export interface DograhDialerConfig {
  baseUrl: string;
  /** Test seam: build the client for a tenant key. */
  clientFor?: (apiKey: string) => CallPlatform;
}

function toDialerError(e: unknown): DialerError {
  if (e instanceof DialerError) return e;
  if (e instanceof PlatformError) {
    if (e.code === "AUTH") return new DialerError("PROVIDER_AUTH", e.message, false);
    if (e.code === "UNAVAILABLE")
      return new DialerError("PROVIDER_UNAVAILABLE", e.message, e.retryable);
    return new DialerError("PROVIDER_REJECTED", e.message, false);
  }
  return new DialerError(
    "PROVIDER_UNAVAILABLE",
    "Unexpected error calling the voice platform",
    true,
  );
}

/**
 * The platform has no Idempotency-Key, so the key travels in initial_context.call_attempt_id and, before placing a
 * call, the workflow's newest runs are checked for it: a resumed dial (worker died after the platform accepted the
 * call) returns the earlier run instead of ringing the lead twice.
 */
export class DograhDialer implements VoiceDialer {
  private readonly clientFor: (apiKey: string) => CallPlatform;

  constructor(config: DograhDialerConfig) {
    this.clientFor =
      config.clientFor ?? ((apiKey) => new PlatformClient({ baseUrl: config.baseUrl, apiKey }));
  }

  async initiateCall(req: DialRequest): Promise<DialResult> {
    if (!req.apiKey)
      throw new DialerError(
        "PROVIDER_NOT_CONFIGURED",
        "The voice platform is not connected",
        false,
      );
    try {
      const platform = this.clientFor(req.apiKey);
      const wf = await resolveWorkflow(platform, req.workflowId);
      if (!wf)
        throw new DialerError(
          "PROVIDER_REJECTED",
          "The AI agent's workflow is not available on the voice platform",
          false,
        );
      const earlier = (await platform.listWorkflowRuns(wf.id, DEDUPE_WINDOW)).find(
        (r) => r.initial_context?.call_attempt_id === req.idempotencyKey,
      );
      if (earlier) return { runId: `${wf.id}:${earlier.id}` };
      const placed = await platform.triggerCall({
        workflowUuid: wf.uuid,
        phoneE164: req.phoneE164,
        initialContext: { ...req.initialContext, call_attempt_id: req.idempotencyKey },
      });
      return { runId: `${wf.id}:${placed.runId}` };
    } catch (e) {
      throw toDialerError(e);
    }
  }
}

/** "<workflowId>:<runId>" as stored in call_attempt.dograh_run_id for single calls. */
export function parseRunRef(ref: string): { workflowId: number; runId: number } | null {
  const m = /^(\d+):(\d+)$/.exec(ref);
  return m ? { workflowId: Number(m[1]), runId: Number(m[2]) } : null;
}

export * from "./platform.js";
