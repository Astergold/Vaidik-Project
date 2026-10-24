import { describe, expect, it } from "vitest";
import { webhookDelivery } from "@vernacular/contracts";
import {
  deliverySummary,
  SIGNATURE_EXAMPLE,
  toggleEvent,
} from "@/features/integrations/webhook-form";

const d = (over: object) =>
  webhookDelivery.parse({
    id: "01a14679-0000-7000-8000-0000000005a1",
    event: "lead.created",
    status: "succeeded",
    attempt: 1,
    statusCode: 200,
    error: null,
    durationMs: 120,
    nextRetryAt: null,
    createdAt: "2026-10-17T05:00:00.000Z",
    ...over,
  });

describe("webhook form helpers (D5-I4-03)", () => {
  it("toggling keeps the contract's event order", () => {
    expect(toggleEvent([], "application.updated", true)).toEqual(["application.updated"]);
    expect(toggleEvent(["application.updated"], "lead.created", true)).toEqual([
      "lead.created",
      "application.updated",
    ]);
    expect(toggleEvent(["lead.created", "application.updated"], "lead.created", false)).toEqual([
      "application.updated",
    ]);
  });

  it("delivery summary per status", () => {
    expect(deliverySummary(d({}))).toBe("HTTP 200 · 120 ms");
    expect(deliverySummary(d({ status: "pending", statusCode: null, durationMs: null }))).toBe(
      "Sending…",
    );
    expect(deliverySummary(d({ status: "failed", statusCode: 500, error: null }))).toBe("HTTP 500");
    expect(
      deliverySummary(
        d({ status: "retrying", statusCode: null, error: "Timed out after 10 s", attempt: 3 }),
      ),
    ).toBe("Timed out after 10 s · retrying (attempt 3)");
  });

  it("the signature recipe matches the documented headers and HMAC input", () => {
    expect(SIGNATURE_EXAMPLE).toContain("x-vernacular-signature");
    expect(SIGNATURE_EXAMPLE).toContain("x-vernacular-timestamp");
    expect(SIGNATURE_EXAMPLE).toContain('createHmac("sha256", SECRET).update(`${ts}.${rawBody}`)');
  });
});
