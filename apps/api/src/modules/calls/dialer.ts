/**
 * The voice provider contract has moved to @vernacular/contracts (so the adapter package can
 * implement it without importing from this app). This file re-exports it under the same path and
 * keeps the API-side test fakes.
 */
export {
  DialerError,
  type DialErrorCode,
  type DialRequest,
  type DialResult,
  type VoiceDialer,
} from "@vernacular/contracts";

import {
  DialerError,
  type DialRequest,
  type DialResult,
  type VoiceDialer,
} from "@vernacular/contracts";

/** Fails every call with a clear, permanent error. Used until the real adapter is wired in the worker. */
export class UnconfiguredDialer implements VoiceDialer {
  async initiateCall(): Promise<DialResult> {
    throw new DialerError(
      "PROVIDER_NOT_CONFIGURED",
      "No voice provider adapter is configured for this worker",
      false,
    );
  }
}

/**
 * In-memory provider for tests / staging (DIAL_MODE=fake). Honours Idempotency-Key like the real thing should:
 * `realCalls` counts DISTINCT calls actually "placed", `requests` records every invocation.
 */
export class FakeDialer implements VoiceDialer {
  readonly requests: DialRequest[] = [];
  realCalls = 0;
  honourIdempotency = true;
  /** Errors thrown (in order) by the next calls, then normal behaviour resumes. */
  failures: Error[] = [];
  /**
   * true = the provider ACCEPTS the call and then the response is lost (timeout after the call was placed).
   * This is the failure that causes double dials unless the idempotency key is honoured.
   */
  placeBeforeFailing = false;
  private readonly byKey = new Map<string, DialResult>();

  async initiateCall(req: DialRequest): Promise<DialResult> {
    this.requests.push(req);
    const failure = this.failures.shift();
    if (failure && !this.placeBeforeFailing) throw failure;
    const existing = this.honourIdempotency ? this.byKey.get(req.idempotencyKey) : undefined;
    const result = existing ?? this.place(req);
    if (failure) throw failure; // placed, but the caller never learns about it
    return result;
  }

  private place(req: DialRequest): DialResult {
    this.realCalls += 1;
    const result = { runId: `fake-run-${this.realCalls}-${req.idempotencyKey.slice(0, 8)}` };
    this.byKey.set(req.idempotencyKey, result);
    return result;
  }
}
