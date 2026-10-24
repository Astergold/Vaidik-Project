/**
 * Dev/staging seed (D2-I2-06). Idempotent. Refuses to run in production.
 *   pnpm db:seed
 * Creates: platform admin, tenant MIT-ADT with default policy/branding, current cycle, programs,
 * owner + admission head + 2 counsellors, one AI agent allocated to both counsellors, a lead source,
 * and ~14 clearly-fake demo leads (phones +91 90000 000NN) so the UI has data.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createDb, withTenant, type Db } from "@vernacular/db";
import type { CoreStage, Role, Temperature } from "@vernacular/contracts";
import { createAuth, createAuthPool, type Auth } from "./auth/auth.js";
import { loadConfig, type Config } from "./config.js";
import { ConsoleMailer } from "./lib/mailer.js";

export interface SeedOptions {
  db: Db;
  auth: Auth; // must allow sign-up (seed creates users)
  password: string;
  platformAdminEmail: string;
  tenantSlug?: string;
  tenantName?: string;
  log?: (msg: string) => void;
}

export interface SeedResult {
  tenantId: string;
  password: string;
  logins: { who: string; email: string; role: string }[];
}

const DEMO_LEADS: {
  name: string;
  stage: CoreStage;
  temp: Temperature | null;
  owner: "c1" | "c2" | null;
  agent: boolean;
  city: string;
  program: number;
  daysAgo: number;
  calls: number;
}[] = [
  {
    name: "Aarav Patil",
    stage: "interested",
    temp: "hot",
    owner: "c1",
    agent: true,
    city: "Pune",
    program: 0,
    daysAgo: 1,
    calls: 2,
  },
  {
    name: "Diya Deshmukh",
    stage: "visit_booked",
    temp: "hot",
    owner: "c1",
    agent: true,
    city: "Pune",
    program: 1,
    daysAgo: 2,
    calls: 3,
  },
  {
    name: "Kabir Singh",
    stage: "connected",
    temp: "warm",
    owner: "c2",
    agent: true,
    city: "Nashik",
    program: 0,
    daysAgo: 2,
    calls: 1,
  },
  {
    name: "Ishita Rao",
    stage: "interested",
    temp: "warm",
    owner: "c2",
    agent: true,
    city: "Mumbai",
    program: 2,
    daysAgo: 3,
    calls: 2,
  },
  {
    name: "Vihaan Joshi",
    stage: "attempting",
    temp: null,
    owner: null,
    agent: true,
    city: "Satara",
    program: 0,
    daysAgo: 0,
    calls: 1,
  },
  {
    name: "Anaya Kulkarni",
    stage: "new",
    temp: null,
    owner: null,
    agent: false,
    city: "Pune",
    program: 3,
    daysAgo: 0,
    calls: 0,
  },
  {
    name: "Reyansh Mehta",
    stage: "visited",
    temp: "hot",
    owner: "c1",
    agent: true,
    city: "Ahmedabad",
    program: 1,
    daysAgo: 6,
    calls: 4,
  },
  {
    name: "Saanvi Nair",
    stage: "applied",
    temp: "hot",
    owner: "c2",
    agent: true,
    city: "Kochi",
    program: 0,
    daysAgo: 9,
    calls: 3,
  },
  {
    name: "Arjun Verma",
    stage: "fee_paid",
    temp: "hot",
    owner: "c1",
    agent: true,
    city: "Indore",
    program: 1,
    daysAgo: 14,
    calls: 5,
  },
  {
    name: "Myra Shaikh",
    stage: "connected",
    temp: "cold",
    owner: "c2",
    agent: true,
    city: "Pune",
    program: 2,
    daysAgo: 4,
    calls: 2,
  },
  {
    name: "Advait Bhosale",
    stage: "lost",
    temp: "cold",
    owner: "c1",
    agent: true,
    city: "Kolhapur",
    program: 0,
    daysAgo: 20,
    calls: 6,
  },
  {
    name: "Navya Reddy",
    stage: "invalid",
    temp: "invalid",
    owner: null,
    agent: true,
    city: "Hyderabad",
    program: 3,
    daysAgo: 5,
    calls: 1,
  },
  {
    name: "Krish Agarwal",
    stage: "attempting",
    temp: null,
    owner: null,
    agent: true,
    city: "Jaipur",
    program: 1,
    daysAgo: 1,
    calls: 2,
  },
  {
    name: "Tara Iyer",
    stage: "interested",
    temp: "warm",
    owner: "c1",
    agent: true,
    city: "Chennai",
    program: 2,
    daysAgo: 7,
    calls: 2,
  },
];
const PROGRAMS = ["B.Tech Computer Science", "MBA", "BBA", "B.Des"];

export async function runSeed(o: SeedOptions): Promise<SeedResult> {
  const log = o.log ?? ((m) => console.warn(m));
  const slug = o.tenantSlug ?? "mit-adt";
  const name = o.tenantName ?? "MIT-ADT University";
  const logins: SeedResult["logins"] = [];

  async function ensureUser(email: string, display: string, extra?: { platformAdmin?: boolean }) {
    const existing = await o.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", email)
      .executeTakeFirst();
    let id = existing?.id;
    if (!id)
      id = (await o.auth.api.signUpEmail({ body: { email, password: o.password, name: display } }))
        .user.id;
    if (extra?.platformAdmin) {
      await o.db
        .updateTable("user")
        .set({ isPlatformAdmin: true, role: "admin" })
        .where("id", "=", id)
        .execute();
    }
    return id;
  }

  // --- platform admin (no tenant membership; acts through the platform console / impersonation) ---
  await ensureUser(o.platformAdminEmail, "Platform Admin", { platformAdmin: true });
  logins.push({ who: "Platform admin", email: o.platformAdminEmail, role: "super-admin" });

  // --- tenant -------------------------------------------------------------------------------------
  const found = await sql<{
    tenant_id: string;
  }>`select tenant_id from crm.resolve_tenant_by_slug(${slug})`.execute(o.db);
  const tenantId = found.rows[0]?.tenant_id ?? randomUUID();
  if (!found.rows[0]) {
    await o.db.insertInto("organization").values({ id: tenantId, name, slug }).execute();
    await withTenant(o.db, tenantId, async (t) => {
      await t
        .insertInto("tenant")
        .values({ id: tenantId, name, slug, timezone: "Asia/Kolkata" })
        .execute();
      await t
        .insertInto("tenant_policy")
        .values({
          tenant_id: tenantId,
          ai_disclosure_text: "This call is made by an AI assistant on behalf of the university.",
        })
        .execute();
      await t
        .insertInto("tenant_branding")
        .values({ tenant_id: tenantId, product_name: "Vernacular AI" })
        .execute();
    });
    log(`created tenant ${slug}`);
  }

  // --- team -------------------------------------------------------------------------------------------
  const team: { key: string; role: Role; display: string }[] = [
    { key: "owner", role: "owner", display: "Olivia Owner" },
    { key: "head", role: "admission_head", display: "Harish Head" },
    { key: "c1", role: "counsellor", display: "Chitra Counsellor" },
    { key: "c2", role: "counsellor", display: "Chetan Counsellor" },
  ];
  const userIds: Record<string, string> = {};
  for (const m of team) {
    const email = `${m.key}@${slug}.local`;
    userIds[m.key] = await ensureUser(email, m.display);
    await o.db
      .insertInto("member")
      .values({ organizationId: tenantId, userId: userIds[m.key]!, role: m.role })
      .onConflict((oc) => oc.columns(["organizationId", "userId"]).doNothing())
      .execute();
    logins.push({ who: m.display, email, role: m.role });
  }

  // --- catalog, agent, source, cycle, leads ----------------------------------------------------------
  await withTenant(o.db, tenantId, async (t) => {
    const cycle = await t
      .selectFrom("admission_cycle")
      .select("id")
      .where("name", "=", "2026-27")
      .executeTakeFirst();
    const cycleId =
      cycle?.id ??
      (
        await t
          .insertInto("admission_cycle")
          .values({
            tenant_id: tenantId,
            name: "2026-27",
            starts_on: "2026-01-01",
            ends_on: "2027-03-31",
            is_current: true,
          })
          .returning("id")
          .executeTakeFirstOrThrow()
      ).id;

    const programIds: string[] = [];
    for (const p of PROGRAMS) {
      const r = await t
        .insertInto("program")
        .values({ tenant_id: tenantId, name: p })
        .onConflict((oc) => oc.columns(["tenant_id", "name"]).doUpdateSet({ name: p }))
        .returning("id")
        .executeTakeFirstOrThrow();
      programIds.push(r.id);
    }

    let agent = await t
      .selectFrom("ai_agent")
      .select("id")
      .where("display_name", "=", "Asha (English)")
      .executeTakeFirst();
    if (!agent) {
      agent = await t
        .insertInto("ai_agent")
        .values({ tenant_id: tenantId, display_name: "Asha (English)", language: "en" })
        .returning("id")
        .executeTakeFirstOrThrow();
    }
    for (const k of ["c1", "c2"]) {
      await t
        .insertInto("ai_agent_counsellor")
        .values({ tenant_id: tenantId, ai_agent_id: agent.id, user_id: userIds[k]! })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }

    let source = await t
      .selectFrom("intake_source")
      .select("id")
      .where("name", "=", "Website form")
      .executeTakeFirst();
    if (!source)
      source = await t
        .insertInto("intake_source")
        .values({ tenant_id: tenantId, name: "Website form", kind: "form" })
        .returning("id")
        .executeTakeFirstOrThrow();

    let created = 0;
    for (const [i, d] of DEMO_LEADS.entries()) {
      const phone = `+91900000${String(i + 1).padStart(4, "0")}`; // obviously fake
      const exists = await t
        .selectFrom("person_identifier")
        .select("person_id")
        .where("kind", "=", "phone")
        .where("value_norm", "=", phone)
        .executeTakeFirst();
      if (exists) continue;
      const at = new Date(Date.now() - d.daysAgo * 86_400_000);
      const person = await t
        .insertInto("person")
        .values({
          tenant_id: tenantId,
          full_name: d.name,
          city: d.city,
          state: "Maharashtra",
          preferred_language: "en",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await t
        .insertInto("person_identifier")
        .values({
          tenant_id: tenantId,
          person_id: person.id,
          kind: "phone",
          value_raw: phone,
          value_norm: phone,
          is_primary: true,
        })
        .execute();
      const lead = await t
        .insertInto("lead")
        .values({
          tenant_id: tenantId,
          person_id: person.id,
          cycle_id: cycleId,
          source_id: source.id,
          program_id: programIds[d.program]!,
          stage: d.stage,
          owner_counsellor_id: d.owner ? userIds[d.owner]! : null,
          ai_agent_id: d.agent ? agent.id : null,
          next_step:
            d.stage === "interested"
              ? "book_visit"
              : d.stage === "visited"
                ? "fill_form"
                : d.stage === "applied"
                  ? "pay_fee"
                  : null,
          next_step_due_at: d.stage === "interested" ? new Date(Date.now() + 86_400_000) : null,
          created_at: at,
        } as never)
        .returning("id")
        .executeTakeFirstOrThrow();
      await t
        .insertInto("lead_stage_history")
        .values({
          tenant_id: tenantId,
          lead_id: lead.id,
          from_stage: null,
          to_stage: "new",
          actor: "system",
          created_at: at,
        } as never)
        .execute();
      if (d.stage !== "new")
        await t
          .insertInto("lead_stage_history")
          .values({
            tenant_id: tenantId,
            lead_id: lead.id,
            from_stage: "new",
            to_stage: d.stage,
            actor: "ai",
            reason: "seed",
          })
          .execute();
      for (let c = 0; c < d.calls; c++) {
        const done = c === d.calls - 1 && d.stage !== "attempting";
        await t
          .insertInto("call_attempt")
          .values({
            tenant_id: tenantId,
            lead_id: lead.id,
            ai_agent_id: d.agent ? agent.id : null,
            status: done ? "completed" : "no_answer",
            started_at: new Date(at.getTime() + c * 3_600_000),
            duration_s: done ? 95 : 0,
            ...(done
              ? {
                  transcript_text: `Agent: Hello ${d.name.split(" ")[0]}, this is Asha from the university. Student: Yes, I am interested in the course.`,
                }
              : {}),
          } as never)
          .execute();
      }
      if (d.temp) {
        // counsellor-sourced observation: no quote needed; the trigger updates lead.current_temperature
        await t
          .insertInto("lead_temperature_observation")
          .values({
            tenant_id: tenantId,
            lead_id: lead.id,
            value: d.temp,
            source: "system",
            reason: "seed",
          })
          .execute();
      }
      created++;
    }
    log(created ? `created ${created} demo leads` : "demo leads already present");
  });

  return { tenantId, password: o.password, logins };
}

/* eslint-disable no-console -- the seed CLI prints its result table on purpose */
// ---- CLI ------------------------------------------------------------------------------------------
async function main() {
  const config: Config = loadConfig();
  if (config.env === "production") {
    console.error("seed refuses to run with NODE_ENV=production");
    process.exit(1);
  }
  let password = process.env.SEED_PASSWORD;
  const generated = !password;
  if (!password) password = randomBytes(12).toString("base64url") + "!9a";
  if (password.length < 12) {
    console.error("SEED_PASSWORD must be at least 12 characters");
    process.exit(1);
  }
  const db = createDb(config.databaseUrl);
  const pool = createAuthPool(config.databaseUrl);
  const auth = createAuth({ config, mailer: new ConsoleMailer(), allowSignUp: true, pool });
  try {
    const r = await runSeed({
      db,
      auth,
      password,
      platformAdminEmail: process.env.SEED_PLATFORM_ADMIN_EMAIL ?? "admin@laveric.local",
    });
    console.warn(
      `\nSeed complete. Tenant id: ${r.tenantId}\nPassword for all users${generated ? " (generated — shown once)" : ""}: ${r.password}\n`,
    );
    console.table(r.logins);
  } finally {
    await db.destroy();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
