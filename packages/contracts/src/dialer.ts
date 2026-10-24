/**
 * The voice provider, as seen by the CRM. Lives in contracts so the provider adapter
 * (packages/integrations/<provider>) and the API/workflow code share one definition —
 * packages must not import from apps. The provider's name never appears in messages
 * that reach tenants (error codes below are ours).
 */
export type DialErrorCode =
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED" // 4xx: bad number, bad request. Retrying will not help
  | "PROVIDER_AUTH" // credentials refused
  | "PROVIDER_NOT_CONFIGURED";

export class DialerError extends Error {
  constructor(
    public readonly code: DialErrorCode,
    message: string,
    /** true = transient (timeout / 5xx / network): the job is retried. false = permanent: the attempt is failed. */
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "DialerError";
  }
}

export interface DialRequest {
  tenantId: string;
  /** Tenant's provider API key (decrypted just-in-time, never logged). */
  apiKey: string;
  workflowId: string;
  /** E.164 */
  phoneE164: string;
  /**
   * = call_attempt.id. The provider MUST treat a repeated key as the same call and return the original run
   * (that is what makes "worker died after reserving" safe to resume). Requires the Idempotency-Key patch (D1-V-05).
   */
  idempotencyKey: string;
  /** Becomes {{initial_context.*}} inside the agent workflow. */
  initialContext: Record<string, unknown>;
}

export interface DialResult {
  /** Provider's run id. Stored on the call attempt. */
  runId: string;
}

export interface VoiceDialer {
  initiateCall(req: DialRequest): Promise<DialResult>;
}
