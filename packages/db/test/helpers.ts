import { randomUUID } from "node:crypto";
import pg from "pg";
import { createDb, withTenant, type Db, type Tx } from "../src/index.js";

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
}

/** App-role connection: what request code uses. Subject to RLS. */
export const appDb: Db = createDb(requireEnv("DATABASE_URL"), { max: 4 });

/** Owner connection: ONLY for catalog inspection in tests, never to test tenant behaviour. */
export const ownerPool = new pg.Pool({
  connectionString: requireEnv("DATABASE_MIGRATION_URL"),
  max: 2,
});

export async function closeAll() {
  await appDb.destroy();
  await ownerPool.end();
}

export type Seeded = {
  tenantId: string;
  slug: string;
  cycleId: string;
  personId: string;
  leadId: string;
  phone: string;
};

/** Create organization (no RLS) then a fully populated tenant via the app role only. */
export async function seedTenant(label: string, phone: string): Promise<Seeded> {
  const tenantId = randomUUID();
  const slug = `${label}-${tenantId.slice(0, 8)}`;
  await appDb.insertInto("organization").values({ id: tenantId, name: label, slug }).execute();
  return withTenant(appDb, tenantId, async (trx) => {
    await trx.insertInto("tenant").values({ id: tenantId, name: label, slug }).execute();
    await trx.insertInto("tenant_policy").values({ tenant_id: tenantId }).execute();
    const cycle = await trx
      .insertInto("admission_cycle")
      .values({
        tenant_id: tenantId,
        name: "2026-27",
        starts_on: "2026-01-01",
        ends_on: "2027-03-31",
        is_current: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const person = await trx
      .insertInto("person")
      .values({ tenant_id: tenantId, full_name: `${label} Student` })
      .returning("id")
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("person_identifier")
      .values({
        tenant_id: tenantId,
        person_id: person.id,
        kind: "phone",
        value_raw: phone,
        value_norm: phone,
      })
      .execute();
    const lead = await trx
      .insertInto("lead")
      .values({ tenant_id: tenantId, person_id: person.id, cycle_id: cycle.id })
      .returning("id")
      .executeTakeFirstOrThrow();
    return { tenantId, slug, cycleId: cycle.id, personId: person.id, leadId: lead.id, phone };
  });
}

export function randomPhone(): string {
  return "+9199" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
}

/** Assert a promise rejects with a specific Postgres SQLSTATE. */
export async function expectPgError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const got = (e as { code?: string }).code;
    if (got !== code)
      throw new Error(`expected SQLSTATE ${code}, got ${got}: ${(e as Error).message}`);
    return;
  }
  throw new Error(`expected SQLSTATE ${code} but the statement succeeded`);
}

export { withTenant };
export type { Tx };
