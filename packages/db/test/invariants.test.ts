import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  A = await seedTenant("inv-a", randomPhone());
  B = await seedTenant("inv-b", randomPhone());
});
afterAll(closeAll);

const newCall = (t: Seeded, status: string, extra: Record<string, unknown> = {}) =>
  withTenant(appDb, t.tenantId, (trx) =>
    trx
      .insertInto("call_attempt")
      .values({ tenant_id: t.tenantId, lead_id: t.leadId, status, ...extra } as never)
      .returning("id")
      .executeTakeFirstOrThrow(),
  );

describe("dedupe & uniqueness", () => {
  it("same normalised phone in the same tenant is rejected (23505)", async () => {
    await expectPgError(
      withTenant(appDb, A.tenantId, async (trx) => {
        const p = await trx
          .insertInto("person")
          .values({ tenant_id: A.tenantId })
          .returning("id")
          .executeTakeFirstOrThrow();
        await trx
          .insertInto("person_identifier")
          .values({
            tenant_id: A.tenantId,
            person_id: p.id,
            kind: "phone",
            value_raw: "98 99 ...",
            value_norm: A.phone,
          })
          .execute();
      }),
      "23505",
    );
  });

  it("ON CONFLICT DO NOTHING lets intake dedupe in one statement", async () => {
    await withTenant(appDb, A.tenantId, async (trx) => {
      const r = await trx
        .insertInto("person_identifier")
        .values({
          tenant_id: A.tenantId,
          person_id: A.personId,
          kind: "phone",
          value_raw: A.phone,
          value_norm: A.phone,
        })
        .onConflict((oc) => oc.columns(["tenant_id", "kind", "value_norm"]).doNothing())
        .executeTakeFirst();
      expect(r.numInsertedOrUpdatedRows).toBe(0n);
    });
  });

  it("the same phone in ANOTHER tenant is allowed (uniqueness is per tenant)", async () => {
    await withTenant(appDb, B.tenantId, async (trx) => {
      const p = await trx
        .insertInto("person")
        .values({ tenant_id: B.tenantId })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("person_identifier")
        .values({
          tenant_id: B.tenantId,
          person_id: p.id,
          kind: "phone",
          value_raw: A.phone,
          value_norm: A.phone,
        })
        .execute();
    });
  });

  it("one lead per person per cycle (23505)", async () => {
    await expectPgError(
      withTenant(appDb, A.tenantId, (trx) =>
        trx
          .insertInto("lead")
          .values({ tenant_id: A.tenantId, person_id: A.personId, cycle_id: A.cycleId })
          .execute(),
      ),
      "23505",
    );
  });

  it("only one current admission cycle per tenant", async () => {
    await expectPgError(
      withTenant(appDb, A.tenantId, (trx) =>
        trx
          .insertInto("admission_cycle")
          .values({
            tenant_id: A.tenantId,
            name: "2027-28",
            starts_on: "2027-01-01",
            ends_on: "2028-03-31",
            is_current: true,
          })
          .execute(),
      ),
      "23505",
    );
  });
});

describe("exactly-once dialling (partial unique index)", () => {
  it("a second active call for the same lead is rejected; after completion a new one is allowed", async () => {
    const first = await newCall(A, "reserved");
    await expectPgError(newCall(A, "reserved"), "23505");
    await expectPgError(newCall(A, "dialing"), "23505");
    await withTenant(appDb, A.tenantId, (trx) =>
      trx
        .updateTable("call_attempt")
        .set({ status: "completed" })
        .where("id", "=", first.id)
        .execute(),
    );
    const second = await newCall(A, "reserved");
    expect(second.id).not.toBe(first.id);
    await withTenant(appDb, A.tenantId, (trx) =>
      trx
        .updateTable("call_attempt")
        .set({ status: "no_answer" })
        .where("id", "=", second.id)
        .execute(),
    );
  });

  it("concurrent reserves: exactly one wins", async () => {
    const T = await seedTenant("race", randomPhone());
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => newCall(T, "reserved")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason.code).toBe("23505");
    }
  });

  it("the same provider run id cannot create two call_attempts in a tenant", async () => {
    await newCall(A, "completed", { dograh_run_id: "run-1" });
    await expectPgError(newCall(A, "completed", { dograh_run_id: "run-1" }), "23505");
  });
});

describe("verbatim quotes are validated by the database", () => {
  const transcript =
    "Agent: hello\n  Student:   I   want to visit   the campus next week.\nAgent: great";
  let callId: string;
  let lead: Seeded;

  beforeAll(async () => {
    lead = await seedTenant("quotes", randomPhone());
    const c = await withTenant(appDb, lead.tenantId, (trx) =>
      trx
        .insertInto("call_attempt")
        .values({
          tenant_id: lead.tenantId,
          lead_id: lead.leadId,
          status: "completed",
          transcript_text: transcript,
        })
        .returning("id")
        .executeTakeFirstOrThrow(),
    );
    callId = c.id;
  });

  const obs = (value: string, quote: string | null, extra: Record<string, unknown> = {}) =>
    withTenant(appDb, lead.tenantId, (trx) =>
      trx
        .insertInto("lead_temperature_observation")
        .values({
          tenant_id: lead.tenantId,
          lead_id: lead.leadId,
          value,
          source: "ai_analyst",
          call_attempt_id: callId,
          verbatim_quote: quote,
          ...extra,
        } as never)
        .execute(),
    );
  const temp = () =>
    withTenant(appDb, lead.tenantId, (trx) =>
      trx
        .selectFrom("lead")
        .select("current_temperature")
        .where("id", "=", lead.leadId)
        .executeTakeFirstOrThrow(),
    );

  it("accepts an exact quote (whitespace collapsed on both sides) and updates the lead cache", async () => {
    await obs("hot", "I want to visit the campus next week.");
    expect((await temp()).current_temperature).toBe("hot");
  });

  it("rejects a fabricated quote (23514)", async () => {
    await expectPgError(obs("cold", "I am not interested at all"), "23514");
    expect((await temp()).current_temperature).toBe("hot");
  });

  it("is case-sensitive: exact means exact", async () => {
    await expectPgError(obs("warm", "i want to visit the campus"), "23514");
  });

  it("rejects an AI label with no quote or no call", async () => {
    await expectPgError(obs("warm", null), "23514");
    await expectPgError(obs("warm", "   "), "23514");
    await expectPgError(obs("warm", "I want to visit", { call_attempt_id: null }), "23514");
  });

  it("counsellor overrides need no quote and win over the cached value; older observations don't", async () => {
    await withTenant(appDb, lead.tenantId, (trx) =>
      trx
        .insertInto("lead_temperature_observation")
        .values({
          tenant_id: lead.tenantId,
          lead_id: lead.leadId,
          value: "warm",
          source: "counsellor",
          reason: "student unsure",
        })
        .execute(),
    );
    expect((await temp()).current_temperature).toBe("warm");
    // a backfilled, OLDER observation must not overwrite the newer cached value
    await withTenant(appDb, lead.tenantId, (trx) =>
      trx
        .insertInto("lead_temperature_observation")
        .values({
          tenant_id: lead.tenantId,
          lead_id: lead.leadId,
          value: "cold",
          source: "system",
          observed_at: new Date("2020-01-01"),
        })
        .execute(),
    );
    expect((await temp()).current_temperature).toBe("warm");
  });

  it("analysis objections are quote-validated too", async () => {
    const insertAnalysis = (objections: unknown) =>
      withTenant(appDb, lead.tenantId, (trx) =>
        trx
          .insertInto("analysis")
          .values({
            tenant_id: lead.tenantId,
            call_attempt_id: callId,
            objections: JSON.stringify(objections),
          } as never)
          .onConflict((oc) =>
            oc
              .column("call_attempt_id")
              .doUpdateSet({ objections: JSON.stringify(objections) } as never),
          )
          .execute(),
      );
    await insertAnalysis([{ type: "timing", verbatim_quote: "visit the campus next week" }]);
    await expectPgError(
      insertAnalysis([{ type: "fees", verbatim_quote: "too expensive" }]),
      "23514",
    );
    await expectPgError(insertAnalysis([{ type: "fees" }]), "23514");
    await expectPgError(insertAnalysis({ not: "an array" }), "23514");
  });
});

describe("append-only tables", () => {
  it("app role cannot UPDATE or DELETE stage history, usage events, audit log (42501)", async () => {
    await withTenant(appDb, A.tenantId, async (trx) => {
      await trx
        .insertInto("lead_stage_history")
        .values({ tenant_id: A.tenantId, lead_id: A.leadId, to_stage: "new", actor: "system" })
        .execute();
      await trx
        .insertInto("usage_event")
        .values({ tenant_id: A.tenantId, kind: "call_minute", quantity: 1 })
        .execute();
    });
    for (const [table, stmt] of [
      ["lead_stage_history", "update"],
      ["lead_stage_history", "delete"],
      ["usage_event", "update"],
      ["usage_event", "delete"],
      ["audit_log", "update"],
      ["consent_record", "delete"],
    ] as const) {
      await expectPgError(
        withTenant(appDb, A.tenantId, async (trx) => {
          const q =
            stmt === "update"
              ? trx.updateTable(table as never).set({ tenant_id: A.tenantId } as never)
              : trx.deleteFrom(table as never);
          await q.execute();
        }),
        "42501",
      );
    }
  });
});
