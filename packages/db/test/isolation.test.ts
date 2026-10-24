import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import {
  appDb,
  closeAll,
  expectPgError,
  randomPhone,
  seedTenant,
  withTenant,
  type Seeded,
} from "./helpers.js";

let A: Seeded;
let B: Seeded;

beforeAll(async () => {
  A = await seedTenant("tenant-a", randomPhone());
  B = await seedTenant("tenant-b", randomPhone());
});
afterAll(closeAll);

describe("tenant isolation (as crm_app, the role request code uses)", () => {
  it("tenant B sees zero of tenant A's rows in every seeded table", async () => {
    await withTenant(appDb, B.tenantId, async (trx) => {
      for (const table of [
        "person",
        "person_identifier",
        "lead",
        "admission_cycle",
        "tenant_policy",
      ] as const) {
        const rows = await trx
          .selectFrom(table)
          .selectAll()
          .where("tenant_id", "=", A.tenantId)
          .execute();
        expect(rows, table).toEqual([]);
      }
      expect(
        await trx.selectFrom("tenant").selectAll().where("id", "=", A.tenantId).execute(),
      ).toEqual([]);
      // and sees exactly its own
      expect(await trx.selectFrom("lead").select("id").execute()).toEqual([{ id: B.leadId }]);
    });
  });

  it("no tenant context => zero rows (fail closed), not an error", async () => {
    const rows = await sql<{ n: number }>`select count(*)::int as n from crm.lead`.execute(appDb);
    expect(rows.rows[0]!.n).toBe(0);
  });

  it("an empty / unset app.tenant_id also fails closed", async () => {
    await appDb.transaction().execute(async (trx) => {
      await sql`select set_config('app.tenant_id', '', true)`.execute(trx);
      const r = await sql<{ n: number }>`select count(*)::int as n from crm.person`.execute(trx);
      expect(r.rows[0]!.n).toBe(0);
    });
  });

  it("context does not leak across pooled connections (transaction-local)", async () => {
    await withTenant(appDb, A.tenantId, async () => {});
    const r = await sql<{
      t: string | null;
    }>`select current_setting('app.tenant_id', true) as t`.execute(appDb);
    expect(r.rows[0]!.t ?? "").toBe("");
  });

  it("cannot INSERT a row for another tenant (RLS WITH CHECK)", async () => {
    await expectPgError(
      withTenant(appDb, B.tenantId, (trx) =>
        trx.insertInto("person").values({ tenant_id: A.tenantId, full_name: "smuggled" }).execute(),
      ),
      "42501",
    );
  });

  it("cannot UPDATE or DELETE another tenant's rows (0 rows affected)", async () => {
    await withTenant(appDb, B.tenantId, async (trx) => {
      const upd = await trx
        .updateTable("person")
        .set({ full_name: "hacked" })
        .where("id", "=", A.personId)
        .executeTakeFirst();
      expect(upd.numUpdatedRows).toBe(0n);
      const del = await trx.deleteFrom("lead").where("id", "=", A.leadId).executeTakeFirst();
      expect(del.numDeletedRows).toBe(0n);
    });
    const still = await withTenant(appDb, A.tenantId, (trx) =>
      trx
        .selectFrom("person")
        .select("full_name")
        .where("id", "=", A.personId)
        .executeTakeFirstOrThrow(),
    );
    expect(still.full_name).toBe("tenant-a Student");
  });

  it("withTenant rejects non-uuid tenant ids (no injection via context)", async () => {
    await expect(withTenant(appDb, "x'; drop table crm.lead; --", async () => 1)).rejects.toThrow(
      /uuid/,
    );
  });
});

describe("pre-tenant lookup functions (SECURITY DEFINER, narrow)", () => {
  it("resolve_tenant_by_slug / webhook_key work without tenant context", async () => {
    const bySlug = await sql<{
      tenant_id: string;
      status: string;
    }>`select * from crm.resolve_tenant_by_slug(${A.slug})`.execute(appDb);
    expect(bySlug.rows).toEqual([{ tenant_id: A.tenantId, slug: A.slug, status: "active" }]);

    const key = await withTenant(appDb, A.tenantId, (trx) =>
      trx.selectFrom("tenant").select("webhook_key").executeTakeFirstOrThrow(),
    );
    const byKey = await sql<{
      tenant_id: string;
    }>`select * from crm.resolve_tenant_by_webhook_key(${key.webhook_key})`.execute(appDb);
    expect(byKey.rows[0]!.tenant_id).toBe(A.tenantId);
    expect(
      (await sql`select * from crm.resolve_tenant_by_webhook_key('nope')`.execute(appDb)).rows,
    ).toEqual([]);
  });

  it("domain_allowed is true only for VERIFIED domains of ACTIVE tenants", async () => {
    const host = `crm-${randomUUID().slice(0, 8)}.example.edu`;
    await withTenant(appDb, A.tenantId, (trx) =>
      trx.insertInto("tenant_domain").values({ tenant_id: A.tenantId, hostname: host }).execute(),
    );
    const allowed = async (h: string) =>
      (await sql<{ ok: boolean }>`select crm.domain_allowed(${h}) as ok`.execute(appDb)).rows[0]!
        .ok;
    expect(await allowed(host)).toBe(false); // unverified
    await withTenant(appDb, A.tenantId, (trx) =>
      trx
        .updateTable("tenant_domain")
        .set({ verified_at: sql`now()` })
        .where("hostname", "=", host)
        .execute(),
    );
    expect(await allowed(host)).toBe(true);
    expect(await allowed("unknown.example.org")).toBe(false);
    await withTenant(appDb, A.tenantId, (trx) =>
      trx.updateTable("tenant").set({ status: "suspended" }).where("id", "=", A.tenantId).execute(),
    );
    expect(await allowed(host)).toBe(false); // suspended tenant gets no cert
    await withTenant(appDb, A.tenantId, (trx) =>
      trx.updateTable("tenant").set({ status: "active" }).where("id", "=", A.tenantId).execute(),
    );
  });

  it("resolve_intake_source finds the source by key and exposes only needed columns", async () => {
    const src = await withTenant(appDb, A.tenantId, (trx) =>
      trx
        .insertInto("intake_source")
        .values({ tenant_id: A.tenantId, name: "Website", kind: "form" })
        .returning("source_key")
        .executeTakeFirstOrThrow(),
    );
    const r = await sql<{
      tenant_id: string;
      kind: string;
    }>`select * from crm.resolve_intake_source(${src.source_key})`.execute(appDb);
    expect(r.rows[0]).toMatchObject({ tenant_id: A.tenantId, kind: "form" });
  });
});

describe("uuid_v7", () => {
  it("is version 7 and time-ordered", async () => {
    const r = await sql<{
      id: string;
    }>`select crm.uuid_v7()::text as id from generate_series(1, 5) g order by g`.execute(appDb);
    for (const { id } of r.rows) expect(id[14]).toBe("7");
    await new Promise((res) => setTimeout(res, 5));
    const later = (await sql<{ id: string }>`select crm.uuid_v7()::text as id`.execute(appDb))
      .rows[0]!.id;
    expect(later > r.rows[4]!.id).toBe(true);
  });
});
