import { describe, expect, it } from "vitest";
import { PlatformClient, PlatformError } from "../src/platform.js";

type Call = { url: string; init: RequestInit };

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 500, body: null };
    return new Response(r.body === null ? null : JSON.stringify(r.body), {
      status: r.status,
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const client = (f: typeof fetch) =>
  new PlatformClient({
    baseUrl: "https://platform.test/",
    apiKey: "k-123",
    fetch: f,
  });

describe("PlatformClient", () => {
  it("sends X-API-Key to the verified paths and parses workflows", async () => {
    const m = mockFetch([
      {
        status: 200,
        body: [{ id: 2, name: "W", status: "active", total_runs: 0 }],
      },
    ]);
    const wf = await client(m.fn).listWorkflows();
    expect(wf).toEqual([{ id: 2, name: "W", status: "active" }]);
    expect(m.calls[0]!.url).toBe("https://platform.test/api/v1/workflow/fetch?status=active");
    expect((m.calls[0]!.init.headers as Record<string, string>)["X-API-Key"]).toBe("k-123");
  });

  it("uploads a CSV via presigned URL and returns the file key", async () => {
    const m = mockFetch([
      {
        status: 200,
        body: {
          upload_url: "https://bucket.test/put?sig=1",
          file_key: "campaigns/x.csv",
          expires_in: 900,
        },
      },
      { status: 200, body: null },
    ]);
    const key = await client(m.fn).uploadCsv("wave-1", "phone_number\n+911\n");
    expect(key).toBe("campaigns/x.csv");
    expect(JSON.parse(m.calls[0]!.init.body as string)).toEqual({
      file_name: "wave-1.csv",
      file_size: 18,
      content_type: "text/csv",
    });
    expect(m.calls[1]!.url).toBe("https://bucket.test/put?sig=1");
    expect(m.calls[1]!.init.method).toBe("PUT");
  });

  it("createCampaign sends the platform's field names", async () => {
    const m = mockFetch([
      {
        status: 200,
        body: {
          id: 7,
          name: "n",
          workflow_id: 2,
          state: "created",
          total_rows: 1,
          processed_rows: 0,
          failed_rows: 0,
          started_at: null,
          completed_at: null,
        },
      },
    ]);
    await client(m.fn).createCampaign({
      name: "n",
      workflowId: 2,
      sourceFileKey: "k",
      telephonyConfigId: 1,
      maxConcurrency: null,
      retry: null,
      schedule: null,
      circuitBreaker: null,
    });
    expect(m.calls[0]!.url).toBe("https://platform.test/api/v1/campaign/create");
    expect(JSON.parse(m.calls[0]!.init.body as string)).toMatchObject({
      workflow_id: 2,
      source_type: "csv",
      source_id: "k",
      telephony_configuration_id: 1,
    });
  });

  it("maps errors: 401 AUTH, 422 REJECTED with the detail, 503 retryable; never names the provider", async () => {
    const m = mockFetch([
      {
        status: 401,
        body: { error: { message: "Authorization header required" } },
      },
      {
        status: 422,
        body: { detail: [{ msg: "Dograh says workflow archived" }] },
      },
      { status: 503, body: null },
    ]);
    const c = client(m.fn);
    await expect(c.listCampaigns()).rejects.toMatchObject({
      code: "AUTH",
      retryable: false,
    });
    const e = await c.listCampaigns().catch((x: PlatformError) => x);
    expect(e).toMatchObject({
      code: "REJECTED",
      message: "calling platform says workflow archived",
    });
    await expect(c.listCampaigns()).rejects.toMatchObject({
      code: "UNAVAILABLE",
      retryable: true,
    });
  });

  it("follows run pagination", async () => {
    const page = (p: number, total: number) => ({
      status: 200,
      body: {
        runs: [{ id: p, created_at: "2026-10-24T00:00:00Z" }],
        total_count: total,
        page: p,
        limit: 100,
        total_pages: total,
      },
    });
    const m = mockFetch([page(1, 2), page(2, 2)]);
    const runs = await client(m.fn).listAllRuns(5);
    expect(runs.map((r) => r.id)).toEqual([1, 2]);
    expect(m.calls[1]!.url).toContain("/api/v1/campaign/5/runs?page=2&limit=100");
  });

  it("refuses to build without a key", () => {
    expect(() => new PlatformClient({ baseUrl: "https://x", apiKey: "" })).toThrow(PlatformError);
  });
});
