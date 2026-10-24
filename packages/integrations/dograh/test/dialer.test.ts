import { describe, expect, it } from "vitest";
import { DialerError } from "@vernacular/contracts";
import { DograhDialer, parseRunRef } from "../src/index.js";
import { PlatformClient } from "../src/platform.js";

const UUID = "4e215136-047c-475c-8043-c20cd43c7492";
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function platform(
  runs: unknown[] = [],
  trigger: { status: number; body: unknown } = {
    status: 200,
    body: { status: "initiated", workflow_run_id: 77, workflow_run_name: "x" },
  },
) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const u = new URL(url);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (u.pathname === "/api/v1/workflow/fetch")
      return json(200, [
        { id: 3, name: "W", status: "active", total_runs: 1, workflow_uuid: UUID },
      ]);
    if (u.pathname === "/api/v1/workflow/3/runs")
      return json(200, { runs, total_count: runs.length, page: 1, limit: 50, total_pages: 1 });
    if (u.pathname === `/api/v1/public/agent/workflow/${UUID}`)
      return json(trigger.status, trigger.body);
    return json(404, { detail: "not found" });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const make = (fetchFn: typeof fetch) =>
  new DograhDialer({
    baseUrl: "https://platform.test",
    clientFor: (apiKey) =>
      new PlatformClient({ baseUrl: "https://platform.test", apiKey, fetch: fetchFn }),
  });

const req = (over: Partial<Parameters<DograhDialer["initiateCall"]>[0]> = {}) => ({
  tenantId: "t1",
  apiKey: "secret-key-123",
  workflowId: UUID,
  phoneE164: "+919000000001",
  idempotencyKey: "0190aaaa-0000-7000-8000-000000000001",
  initialContext: { lead_id: "L1", person_name: "Ravi" },
  ...over,
});

describe("DograhDialer (single calls)", () => {
  it("triggers the published workflow with phone + initial_context carrying the idempotency key", async () => {
    const p = platform();
    const res = await make(p.fetchFn).initiateCall(req());
    expect(res).toEqual({ runId: "3:77" });
    const trigger = p.calls.find((c) => c.method === "POST")!;
    expect(trigger.url).toBe(`https://platform.test/api/v1/public/agent/workflow/${UUID}`);
    expect(trigger.headers["X-API-Key"]).toBe("secret-key-123");
    expect(trigger.body).toEqual({
      phone_number: "+919000000001",
      initial_context: {
        lead_id: "L1",
        person_name: "Ravi",
        call_attempt_id: req().idempotencyKey,
      },
      telephony_configuration_id: null,
    });
  });

  it("accepts the numeric workflow id too", async () => {
    const p = platform();
    expect(await make(p.fetchFn).initiateCall(req({ workflowId: "3" }))).toEqual({ runId: "3:77" });
  });

  it("resumed dial: an earlier run with the same key is returned and no second call is placed", async () => {
    const p = platform([
      {
        id: 41,
        created_at: "2026-10-24T10:00:00Z",
        initial_context: { call_attempt_id: req().idempotencyKey },
      },
    ]);
    expect(await make(p.fetchFn).initiateCall(req())).toEqual({ runId: "3:41" });
    expect(p.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("unknown workflow → permanent PROVIDER_REJECTED", async () => {
    const p = platform();
    await expect(make(p.fetchFn).initiateCall(req({ workflowId: "999" }))).rejects.toMatchObject({
      code: "PROVIDER_REJECTED",
      retryable: false,
    });
  });

  it.each([
    [401, "PROVIDER_AUTH", false],
    [422, "PROVIDER_REJECTED", false],
    [503, "PROVIDER_UNAVAILABLE", true],
  ])(
    "trigger HTTP %i → %s (retryable %s), no key or provider name in the message",
    async (status, code, retryable) => {
      const p = platform([], { status, body: { detail: "Dograh error" } });
      const e = (await make(p.fetchFn)
        .initiateCall(req())
        .catch((x: unknown) => x)) as DialerError;
      expect(e).toBeInstanceOf(DialerError);
      expect(e).toMatchObject({ code, retryable });
      expect(e.message).not.toContain("secret-key-123");
      expect(e.message.toLowerCase()).not.toMatch(/dograh|godrah/);
    },
  );

  it("no key → PROVIDER_NOT_CONFIGURED without any request", async () => {
    const p = platform();
    await expect(make(p.fetchFn).initiateCall(req({ apiKey: "" }))).rejects.toMatchObject({
      code: "PROVIDER_NOT_CONFIGURED",
    });
    expect(p.calls).toHaveLength(0);
  });

  it("parseRunRef", () => {
    expect(parseRunRef("3:77")).toEqual({ workflowId: 3, runId: 77 });
    expect(parseRunRef("fake-run-1")).toBeNull();
  });
});
