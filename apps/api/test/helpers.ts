import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createDb, withTenant, type Db } from "@vernacular/db";
import type { Role } from "@vernacular/contracts";
import { createAuth, createAuthPool, type Auth } from "../src/auth/auth.js";
import { loadConfig, type Config } from "../src/config.js";
import { MemoryMailer } from "../src/lib/mailer.js";
import { buildServer } from "../src/server.js";
import type { PlatformResolver } from "../src/modules/campaigns/platform.js";

export const PASSWORD = "Test-Password-123!";

export function testConfig(overrides: Record<string, string | undefined> = {}): Config {
  return loadConfig({
    ...process.env,
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    RATE_LIMIT_ENABLED: "false",
    ...overrides,
  });
}

export interface TestEnv {
  app: FastifyInstance;
  db: Db;
  config: Config;
  mailer: MemoryMailer;
  /** Auth instance that CAN create users (public sign-up is off in the app itself). */
  seedAuth: Auth;
  close(): Promise<void>;
}

export async function buildTestEnv(
  overrides: Record<string, string | undefined> = {},
  extra: { platform?: PlatformResolver } = {},
): Promise<TestEnv> {
  const config = testConfig(overrides);
  const db = createDb(config.databaseUrl, { max: 6 });
  const mailer = new MemoryMailer();
  const pool = createAuthPool(config.databaseUrl);
  const seedAuth = createAuth({ config, mailer, allowSignUp: true, pool });
  const app = await buildServer({
    config,
    db,
    mailer,
    auth: createAuth({ config, mailer, pool }),
    ...(extra.platform ? { platform: extra.platform } : {}),
  });
  await app.ready();
  return {
    app,
    db,
    config,
    mailer,
    seedAuth,
    close: async () => {
      await app.close();
      await db.destroy();
      await pool.end();
    },
  };
}

export interface TestTenant {
  id: string;
  slug: string;
  users: Record<string, TestUser>;
}
export interface TestUser {
  id: string;
  email: string;
  role: Role;
}

/** Organization + tenant + default policy + current cycle. Created with the app role only. */
export async function createTenant(env: TestEnv, label: string): Promise<TestTenant> {
  const id = randomUUID();
  const slug = `${label}-${id.slice(0, 8)}`;
  await env.db.insertInto("organization").values({ id, name: label, slug }).execute();
  await withTenant(env.db, id, async (trx) => {
    await trx.insertInto("tenant").values({ id, name: label, slug }).execute();
    await trx.insertInto("tenant_policy").values({ tenant_id: id }).execute();
    await trx
      .insertInto("admission_cycle")
      .values({
        tenant_id: id,
        name: "2026-27",
        starts_on: "2026-01-01",
        ends_on: "2027-03-31",
        is_current: true,
      })
      .execute();
  });
  return { id, slug, users: {} };
}

export async function createUser(
  env: TestEnv,
  tenant: TestTenant | null,
  key: string,
  role: Role,
  opts: { platformAdmin?: boolean } = {},
): Promise<TestUser> {
  const email = `${key}-${randomUUID().slice(0, 8)}@test.local`;
  const res = await env.seedAuth.api.signUpEmail({
    body: { email, password: PASSWORD, name: `${key} user` },
  });
  const id = res.user.id;
  if (opts.platformAdmin) {
    await env.db
      .updateTable("user")
      .set({ isPlatformAdmin: true, role: "admin" })
      .where("id", "=", id)
      .execute();
  }
  if (tenant) {
    await env.db
      .insertInto("member")
      .values({ organizationId: tenant.id, userId: id, role })
      .execute();
  }
  const u = { id, email, role };
  if (tenant) tenant.users[key] = u;
  return u;
}

/** Signs in through the real /api/auth endpoint and returns a Cookie header value. */
export async function login(
  app: FastifyInstance,
  email: string,
  password = PASSWORD,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email, password },
  });
  if (res.statusCode !== 200) throw new Error(`login failed (${res.statusCode}): ${res.body}`);
  const cookies = res.cookies.map((c) => `${c.name}=${c.value}`);
  if (!cookies.length) throw new Error("login returned no cookie");
  return cookies.join("; ");
}

export const asUser = (cookie: string) => ({ cookie });

export interface LeadSeed {
  fullName?: string;
  phone?: string;
  stage?: string;
  temperature?: string;
  ownerId?: string | null;
  agentId?: string | null;
  sourceId?: string | null;
  createdAt?: Date;
  city?: string;
}

/** Person + phone identifier + lead (current cycle). Returns ids. */
export async function createLead(env: TestEnv, tenant: TestTenant, s: LeadSeed = {}) {
  const phone = s.phone ?? `+9190${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  return withTenant(env.db, tenant.id, async (trx) => {
    const cycle = await trx
      .selectFrom("admission_cycle")
      .select("id")
      .where("is_current", "=", true)
      .executeTakeFirstOrThrow();
    const person = await trx
      .insertInto("person")
      .values({
        tenant_id: tenant.id,
        full_name: s.fullName ?? "Test Student",
        city: s.city ?? null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("person_identifier")
      .values({
        tenant_id: tenant.id,
        person_id: person.id,
        kind: "phone",
        value_raw: phone,
        value_norm: phone,
        is_primary: true,
      })
      .execute();
    const lead = await trx
      .insertInto("lead")
      .values({
        tenant_id: tenant.id,
        person_id: person.id,
        cycle_id: cycle.id,
        stage: s.stage ?? "new",
        current_temperature: s.temperature ?? null,
        owner_counsellor_id: s.ownerId ?? null,
        ai_agent_id: s.agentId ?? null,
        source_id: s.sourceId ?? null,
        ...(s.createdAt ? { created_at: s.createdAt } : {}),
      } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    return { leadId: lead.id, personId: person.id, phone };
  });
}

export async function createAgent(
  env: TestEnv,
  tenant: TestTenant,
  name: string,
  counsellorIds: string[] = [],
) {
  return withTenant(env.db, tenant.id, async (trx) => {
    const a = await trx
      .insertInto("ai_agent")
      .values({ tenant_id: tenant.id, display_name: name })
      .returning("id")
      .executeTakeFirstOrThrow();
    for (const uid of counsellorIds) {
      await trx
        .insertInto("ai_agent_counsellor")
        .values({ tenant_id: tenant.id, ai_agent_id: a.id, user_id: uid })
        .execute();
    }
    return a.id;
  });
}
