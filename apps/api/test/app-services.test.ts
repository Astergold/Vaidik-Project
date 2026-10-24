import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installJobs, systemPing } from "../src/jobs/index.js";
import { buildTestEnv, createTenant, type TestEnv, type TestTenant } from "./helpers.js";

let env: TestEnv;
let A: TestTenant;
beforeAll(async () => {
  env = await buildTestEnv();
  A = await createTenant(env, "svc");
  await installJobs(process.env.DATABASE_MIGRATION_URL!, [systemPing]);
});
afterAll(async () => env.close());

describe("services exposed on the app for modules", () => {
  it("app.secrets round-trips through the app's keyring", async () => {
    await env.app.secrets.setSecret(A.id, "llm_key", "sk-test");
    expect(await env.app.secrets.getSecret(A.id, "llm_key")).toBe("sk-test");
  });

  it("app.jobs.enqueueInTx works with the request-style transaction (and rollback un-sends)", async () => {
    const trx = await env.db.startTransaction().execute();
    const { sql } = await import("kysely");
    await sql`select set_config('app.tenant_id', ${A.id}, true)`.execute(trx);
    const id = await env.app.jobs.enqueueInTx(trx, systemPing, { tenantId: A.id });
    expect(id).toBeTruthy();
    await trx.rollback().execute();
    const owner = new (await import("pg")).default.Client({
      connectionString: process.env.DATABASE_MIGRATION_URL,
    });
    await owner.connect();
    const r = await owner.query("select count(*)::int as n from pgboss.job where id = $1", [id]);
    await owner.end();
    expect(r.rows[0].n).toBe(0);
  });
});
