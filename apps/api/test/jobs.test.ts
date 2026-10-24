import { randomUUID } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { withTenant } from "@vernacular/db";
import {
  createJobQueue,
  defineJob,
  installJobs,
  startWorker,
  DEAD_LETTER_QUEUE,
  systemPing,
  type JobQueue,
} from "../src/jobs/index.js";
import { FakeDialer } from "../src/modules/calls/dialer.js";
import { createSecretsService } from "../src/modules/secrets/service.js";
import { buildTestEnv, createTenant, type TestEnv, type TestTenant } from "./helpers.js";

const payload = z.object({ tenantId: z.uuid(), id: z.string() });
const seen: { id: string; tenantInDb: string | null; attempt: number }[] = [];
const attempts = new Map<string, number>();

const record = defineJob({
  name: "test.record",
  schema: payload,
  work: { pollingIntervalSeconds: 0.5 },
  async handler(ctx, d) {
    const t = await ctx.withTx(
      async (tx) =>
        (await sql<{ t: string }>`select current_setting('app.tenant_id', true) as t`.execute(tx))
          .rows[0]!.t,
    );
    seen.push({ id: d.id, tenantInDb: t, attempt: 1 });
  },
});
const flaky = defineJob({
  name: "test.flaky",
  schema: payload,
  queue: { retryLimit: 3, retryDelay: 1, retryBackoff: false },
  work: { pollingIntervalSeconds: 0.5 },
  async handler(_ctx, d) {
    const n = (attempts.get(d.id) ?? 0) + 1;
    attempts.set(d.id, n);
    if (n < 2) throw new Error("transient failure");
    seen.push({ id: d.id, tenantInDb: null, attempt: n });
  },
});
const doomed = defineJob({
  name: "test.doomed",
  schema: payload,
  queue: { retryLimit: 1, retryDelay: 1, retryBackoff: false },
  work: { pollingIntervalSeconds: 0.5 },
  async handler() {
    throw new Error("always fails");
  },
});

const secretReader = defineJob({
  name: "test.secret",
  schema: payload,
  work: { pollingIntervalSeconds: 0.5 },
  async handler(ctx, d) {
    const v = await ctx.secrets.getSecret(ctx.tenantId, "dograh_api_key");
    seen.push({ id: d.id, tenantInDb: v, attempt: 1 });
  },
});

let env: TestEnv;
let A: TestTenant;
let B: TestTenant;
let queue: JobQueue;
let stop: () => Promise<void>;
let owner: pg.Pool;
const workerErrors: unknown[] = [];

async function waitFor<T>(
  fn: () => T | undefined | Promise<T | undefined>,
  ms = 15_000,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined && v !== false) return v as T;
    if (Date.now() > end) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 150));
  }
}

beforeAll(async () => {
  env = await buildTestEnv();
  A = await createTenant(env, "jobs-a");
  B = await createTenant(env, "jobs-b");
  owner = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 2 });
  await installJobs(process.env.DATABASE_MIGRATION_URL!, [
    record,
    flaky,
    doomed,
    systemPing,
    secretReader,
  ]);
  queue = createJobQueue(env.config.databaseUrl); // app role (crm_app)
  const w = await startWorker({
    databaseUrl: env.config.databaseUrl, // app role: proves DML-only grants are enough
    db: env.db,
    jobs: [record, flaky, doomed, systemPing, secretReader],
    secrets: createSecretsService({ db: env.db, keyring: env.config.masterKeys }),
    deps: { dialer: new FakeDialer() },
    log: { info: () => undefined, warn: () => undefined, error: (o) => workerErrors.push(o) },
  });
  stop = w.stop;
});
afterAll(async () => {
  await stop?.();
  await queue?.stop();
  await owner?.end();
  await env?.close();
});

describe("enqueueInTx", () => {
  it("a job enqueued in a committed transaction runs, with the tenant's RLS context set", async () => {
    const id = randomUUID();
    await withTenant(env.db, A.id, (tx) => queue.enqueueInTx(tx, record, { tenantId: A.id, id }));
    const hit = await waitFor(() => seen.find((s) => s.id === id));
    expect(hit.tenantInDb).toBe(A.id);
  });

  it("a job enqueued in a ROLLED-BACK transaction never exists and never runs", async () => {
    const id = randomUUID();
    await expect(
      withTenant(env.db, A.id, async (tx) => {
        await tx
          .insertInto("person")
          .values({ tenant_id: A.id, full_name: `rolled-back-${id}` })
          .execute();
        await queue.enqueueInTx(tx, record, { tenantId: A.id, id });
        throw new Error("simulated failure after enqueue");
      }),
    ).rejects.toThrow(/simulated failure/);

    await new Promise((r) => setTimeout(r, 2500)); // > 4 polling cycles
    expect(seen.find((s) => s.id === id)).toBeUndefined();
    const rows = await owner.query(
      `select count(*)::int as n from pgboss.job where name = 'test.record' and data->>'id' = $1`,
      [id],
    );
    expect(rows.rows[0].n).toBe(0);
    // and the business write rolled back with it
    const p = await withTenant(env.db, A.id, (t) =>
      t.selectFrom("person").select("id").where("full_name", "=", `rolled-back-${id}`).execute(),
    );
    expect(p).toEqual([]);
  });

  it("the job row and the data row commit atomically", async () => {
    const id = randomUUID();
    await withTenant(env.db, A.id, async (tx) => {
      await tx
        .insertInto("person")
        .values({ tenant_id: A.id, full_name: `atomic-${id}` })
        .execute();
      await queue.enqueueInTx(tx, record, { tenantId: A.id, id });
    });
    await waitFor(() => seen.find((s) => s.id === id));
    const p = await withTenant(env.db, A.id, (t) =>
      t.selectFrom("person").select("id").where("full_name", "=", `atomic-${id}`).execute(),
    );
    expect(p).toHaveLength(1);
  });

  it("rejects a payload for a different tenant than the transaction's (can't enqueue into B from A's context)", async () => {
    await expect(
      withTenant(env.db, A.id, (tx) => queue.enqueueInTx(tx, record, { tenantId: B.id, id: "x" })),
    ).rejects.toThrow(/does not match/);
  });

  it("rejects payloads that fail the schema (no tenantId, bad uuid)", async () => {
    await expect(
      withTenant(env.db, A.id, (tx) => queue.enqueueInTx(tx, record, { id: "x" } as never)),
    ).rejects.toThrow();
    await expect(
      withTenant(env.db, A.id, (tx) =>
        queue.enqueueInTx(tx, record, { tenantId: "nope", id: "x" } as never),
      ),
    ).rejects.toThrow();
  });

  it("singletonKey + singletonSeconds de-duplicates identical enqueues (a bare singletonKey does NOT)", async () => {
    const id = randomUUID();
    const key = `once-${id}`;
    await withTenant(env.db, A.id, async (tx) => {
      await queue.enqueueInTx(
        tx,
        record,
        { tenantId: A.id, id },
        { singletonKey: key, singletonSeconds: 60 },
      );
      await queue.enqueueInTx(
        tx,
        record,
        { tenantId: A.id, id },
        { singletonKey: key, singletonSeconds: 60 },
      );
    });
    await waitFor(() => seen.find((s) => s.id === id));
    await new Promise((r) => setTimeout(r, 1500));
    expect(seen.filter((s) => s.id === id)).toHaveLength(1);
  });
});

describe("job context", () => {
  it("ctx.secrets decrypts the job's own tenant secret, and a tenant without one gets null", async () => {
    const secrets = createSecretsService({ db: env.db, keyring: env.config.masterKeys });
    await secrets.setSecret(A.id, "dograh_api_key", "tenant-a-key");
    const idA = randomUUID();
    const idB = randomUUID();
    await withTenant(env.db, A.id, (tx) =>
      queue.enqueueInTx(tx, secretReader, { tenantId: A.id, id: idA }),
    );
    await withTenant(env.db, B.id, (tx) =>
      queue.enqueueInTx(tx, secretReader, { tenantId: B.id, id: idB }),
    );
    expect((await waitFor(() => seen.find((s) => s.id === idA))).tenantInDb).toBe("tenant-a-key");
    expect((await waitFor(() => seen.find((s) => s.id === idB))).tenantInDb).toBeNull();
  });
});

describe("retries and dead-lettering", () => {
  it("a transient failure is retried and then succeeds", async () => {
    const id = randomUUID();
    await withTenant(env.db, A.id, (tx) => queue.enqueueInTx(tx, flaky, { tenantId: A.id, id }));
    const hit = await waitFor(() => seen.find((s) => s.id === id), 20_000);
    expect(hit.attempt).toBe(2);
  });

  it("a job that always fails ends up in the dead_letter queue (and is not lost)", async () => {
    const id = randomUUID();
    await withTenant(env.db, A.id, (tx) => queue.enqueueInTx(tx, doomed, { tenantId: A.id, id }));
    const row = await waitFor(async () => {
      const r = await owner.query(
        `select name, data from pgboss.job where name = $1 and data->>'id' = $2`,
        [DEAD_LETTER_QUEUE, id],
      );
      return r.rows[0];
    }, 30_000);
    expect(row.data.tenantId).toBe(A.id); // tenant stays attached for forensics
  }, 40_000);
});

describe("worker privileges and ops", () => {
  it("system.ping runs end to end", async () => {
    await withTenant(env.db, B.id, (tx) => queue.enqueueInTx(tx, systemPing, { tenantId: B.id }));
    await waitFor(async () => {
      const r = await owner.query(
        `select 1 from pgboss.job where name = 'system.ping' and state = 'completed' and data->>'tenantId' = $1`,
        [B.id],
      );
      return r.rowCount ? true : undefined;
    });
  });

  it("the app role has DML but no DDL on the job schema", async () => {
    const c = new pg.Client({ connectionString: env.config.databaseUrl });
    await c.connect();
    try {
      await expect(c.query("create table pgboss.sneaky (x int)")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(c.query("drop table pgboss.job")).rejects.toMatchObject({ code: "42501" });
    } finally {
      await c.end();
    }
  });

  it("the worker (running as crm_app with supervision on) raised no errors", () => {
    expect(workerErrors).toEqual([]);
  });

  it("installJobs is idempotent", async () => {
    const names = await installJobs(process.env.DATABASE_MIGRATION_URL!, [
      record,
      flaky,
      doomed,
      systemPing,
      secretReader,
    ]);
    expect(names).toContain(DEAD_LETTER_QUEUE);
  });

  it("defineJob rejects badly named jobs", () => {
    expect(() =>
      defineJob({ name: "BadName", schema: payload, handler: async () => undefined }),
    ).toThrow(/domain.action/);
  });
});
