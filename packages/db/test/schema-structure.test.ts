import { afterAll, describe, expect, it } from "vitest";
import {
  ACTIVE_CALL_STATUSES,
  CALL_STATUSES,
  CORE_STAGES,
  NEXT_STEPS,
  TEMPERATURES,
} from "@vernacular/contracts";
import { closeAll, ownerPool } from "./helpers.js";

afterAll(closeAll);

// Auth tables are read before a tenant is known (login/session) -> no RLS by design (see migration 0200).
const AUTH_TABLES = [
  "user",
  "organization",
  "session",
  "account",
  "verification",
  "member",
  "invitation",
];
const NON_TENANT_TABLES = [...AUTH_TABLES, "schema_migrations"];
// App role may only SELECT/INSERT here (no UPDATE/DELETE).
const APPEND_ONLY = [
  "audit_log",
  "lead_stage_history",
  "consent_record",
  "lead_temperature_observation",
  "usage_event",
  "agent_tool_call",
  "recording_access_log",
];

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await ownerPool.query(sql, params)).rows as T[];
}

describe("role & schema hygiene", () => {
  it("crm_app is not superuser, not BYPASSRLS, and owns nothing", async () => {
    const [r] = await q<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "select rolsuper, rolbypassrls from pg_roles where rolname = 'crm_app'",
    );
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
    const owned = await q(
      "select c.relname from pg_class c join pg_roles r on r.oid = c.relowner where r.rolname = 'crm_app'",
    );
    expect(owned).toEqual([]);
  });

  it("nothing lives in schema public", async () => {
    expect(await q("select tablename from pg_tables where schemaname = 'public'")).toEqual([]);
    expect(
      await q(
        "select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'",
      ),
    ).toEqual([]);
  });

  it("dbmate's migration table is crm.schema_migrations", async () => {
    expect(
      await q("select 1 from pg_tables where schemaname='crm' and tablename='schema_migrations'"),
    ).toHaveLength(1);
  });
});

describe("RLS coverage (fails when someone adds a table and forgets RLS)", () => {
  it("every crm table except auth has RLS enabled and a policy", async () => {
    const rows = await q<{ relname: string; relrowsecurity: boolean; policies: string }>(
      `
      select c.relname, c.relrowsecurity,
             (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'crm' and c.relkind = 'r' and c.relname <> all($1)`,
      [NON_TENANT_TABLES],
    );
    expect(rows.length).toBeGreaterThan(20);
    const bad = rows
      .filter((r) => !r.relrowsecurity || Number(r.policies) < 1)
      .map((r) => r.relname);
    expect(bad).toEqual([]);
  });

  it("every non-auth table has a tenant_id column (tenant itself: id)", async () => {
    const rows = await q<{ table_name: string }>(
      `
      select t.table_name from information_schema.tables t
       where t.table_schema = 'crm' and t.table_type = 'BASE TABLE' and t.table_name <> all($1)
         and not exists (select 1 from information_schema.columns c
                          where c.table_schema='crm' and c.table_name=t.table_name and c.column_name='tenant_id')`,
      [NON_TENANT_TABLES],
    );
    expect(rows.map((r) => r.table_name)).toEqual(["tenant"]);
  });

  it("app role has no UPDATE/DELETE on append-only tables", async () => {
    for (const t of APPEND_ONLY) {
      const [r] = await q<{ u: boolean; d: boolean; s: boolean; i: boolean }>(
        `select has_table_privilege('crm_app','crm.${t}','UPDATE') u, has_table_privilege('crm_app','crm.${t}','DELETE') d,
                has_table_privilege('crm_app','crm.${t}','SELECT') s, has_table_privilege('crm_app','crm.${t}','INSERT') i`,
      );
      expect({ t, ...r }).toEqual({ t, u: false, d: false, s: true, i: true });
    }
  });
});

describe("enum parity: @vernacular/contracts == DB CHECK constraints", () => {
  async function checkDef(table: string, column: string) {
    const rows = await q<{ def: string }>(
      `
      select pg_get_constraintdef(con.oid) as def
        from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname='crm' and c.relname=$1 and con.contype='c' and pg_get_constraintdef(con.oid) like $2`,
      [table, `%${column}%`],
    );
    return rows.map((r) => r.def).join(" ");
  }
  const cases: [string, string, readonly string[]][] = [
    ["lead", "stage", CORE_STAGES],
    ["lead", "current_temperature", TEMPERATURES],
    ["lead", "next_step", NEXT_STEPS],
    ["call_attempt", "status", CALL_STATUSES],
    ["lead_sub_stage", "core_stage", CORE_STAGES],
  ];
  for (const [table, column, values] of cases) {
    it(`${table}.${column}`, async () => {
      const def = await checkDef(table, column);
      for (const v of values) expect(def, `${table}.${column} missing '${v}'`).toContain(`'${v}'`);
    });
  }
  it("active call statuses match the partial unique index", async () => {
    const [r] = await q<{ indexdef: string }>(
      "select indexdef from pg_indexes where schemaname='crm' and indexname='call_attempt_one_active_per_lead'",
    );
    for (const s of ACTIVE_CALL_STATUSES) expect(r!.indexdef).toContain(`'${s}'`);
  });
});
