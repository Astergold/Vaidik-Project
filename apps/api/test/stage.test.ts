import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@vernacular/db";
import {
  assertReasonForManualMove,
  moveStage,
  STAGE_ORDER,
  TERMINAL_STAGES,
} from "../src/modules/leads/stage.js";
import {
  buildTestEnv,
  createLead,
  createTenant,
  createUser,
  type TestEnv,
  type TestTenant,
} from "./helpers.js";

let env: TestEnv;
let T: TestTenant;
beforeAll(async () => {
  env = await buildTestEnv();
  T = await createTenant(env, "stage");
  await createUser(env, T, "u", "counsellor");
});
afterAll(async () => env.close());

const tx = <R>(fn: (t: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<R>) =>
  withTenant(env.db, T.id, fn);
const fresh = async (stage = "new") => (await createLead(env, T, { stage })).leadId;
const state = (id: string) =>
  tx((t) =>
    t
      .selectFrom("lead")
      .select(["stage", "next_step", "next_step_due_at", "sub_stage_id", "lost_reason"])
      .where("id", "=", id)
      .executeTakeFirstOrThrow(),
  );
const hist = (id: string) =>
  tx((t) =>
    t
      .selectFrom("lead_stage_history")
      .select(["from_stage", "to_stage", "actor", "reason"])
      .where("lead_id", "=", id)
      .orderBy("created_at")
      .execute(),
  );
const auto = (id: string, to: Parameters<typeof moveStage>[1]["to"]) =>
  tx((t) => moveStage(t, { leadId: id, to, actor: "integration", mode: "auto" }));

describe("automatic moves (integrations / system): forward only", () => {
  it("walks forward through the pipeline and writes one history row per move", async () => {
    const id = await fresh();
    for (const to of [
      "attempting",
      "connected",
      "interested",
      "visit_booked",
      "visited",
      "applied",
      "fee_paid",
      "enrolled",
    ] as const) {
      expect(await auto(id, to)).toMatchObject({ changed: true, to });
    }
    expect((await hist(id)).map((h) => `${h.from_stage}>${h.to_stage}`)).toEqual([
      "new>attempting",
      "attempting>connected",
      "connected>interested",
      "interested>visit_booked",
      "visit_booked>visited",
      "visited>applied",
      "applied>fee_paid",
      "fee_paid>enrolled",
    ]);
  });

  it("NEVER moves backwards, and skipping ahead is fine", async () => {
    const id = await fresh("applied");
    expect(await auto(id, "connected")).toMatchObject({
      changed: false,
      from: "applied",
      to: "applied",
    });
    expect(await auto(id, "new")).toMatchObject({ changed: false });
    expect((await state(id)).stage).toBe("applied");
    expect(await hist(id)).toEqual([]);
    expect(await auto(id, "enrolled")).toMatchObject({ changed: true }); // skip fee_paid: allowed
  });

  it("moving to the current stage is a no-op (safe to call repeatedly / replay webhooks)", async () => {
    const id = await fresh("interested");
    for (let i = 0; i < 3; i++) expect((await auto(id, "interested")).changed).toBe(false);
    expect(await hist(id)).toEqual([]);
  });

  it("can close a lead (lost / invalid) from any open stage, but never leaves a closed state by itself", async () => {
    const a = await fresh("interested");
    expect((await auto(a, "lost")).changed).toBe(true);
    for (const to of ["interested", "applied", "enrolled", "new", "invalid"] as const)
      expect((await auto(a, to)).changed, `lost -> ${to}`).toBe(false);
    const b = await fresh("connected");
    expect((await auto(b, "invalid")).changed).toBe(true);
    expect((await auto(b, "applied")).changed).toBe(false);
    expect((await state(b)).stage).toBe("invalid");
  });

  it("every stage in the pipeline order can be reached forward from 'new'", async () => {
    for (const s of STAGE_ORDER.slice(1)) {
      const id = await fresh();
      expect((await auto(id, s)).changed, s).toBe(true);
    }
  });
});

describe("manual moves (a person, with a reason): any direction", () => {
  const manual = (id: string, to: Parameters<typeof moveStage>[1]["to"], reason = "because") =>
    tx(async (t) =>
      moveStage(t, {
        leadId: id,
        to,
        actor: "user",
        actorUserId: T.users.u!.id,
        reason,
        mode: "manual",
      }),
    );

  it("can go backwards and out of closed stages; the actor and reason are recorded", async () => {
    const id = await fresh("applied");
    expect((await manual(id, "interested", "Form was rejected")).changed).toBe(true);
    await manual(id, "lost", "No response");
    expect((await manual(id, "connected", "Parent called back")).changed).toBe(true);
    expect(await hist(id)).toEqual([
      { from_stage: "applied", to_stage: "interested", actor: "user", reason: "Form was rejected" },
      { from_stage: "interested", to_stage: "lost", actor: "user", reason: "No response" },
      { from_stage: "lost", to_stage: "connected", actor: "user", reason: "Parent called back" },
    ]);
  });

  it("a stage change clears the sub-stage; terminal stages clear the next step; 'lost' keeps the reason", async () => {
    const id = await fresh("interested");
    const sub = await tx((t) =>
      t
        .insertInto("lead_sub_stage")
        .values({ tenant_id: T.id, core_stage: "interested", name: "Waiting" })
        .returning("id")
        .executeTakeFirstOrThrow(),
    );
    await tx((t) =>
      t
        .updateTable("lead")
        .set({ sub_stage_id: sub.id, next_step: "callback", next_step_due_at: new Date() })
        .where("id", "=", id)
        .execute(),
    );
    await manual(id, "visit_booked");
    expect(await state(id)).toMatchObject({
      stage: "visit_booked",
      sub_stage_id: null,
      next_step: "callback",
    }); // non-terminal keeps the step
    await manual(id, "lost", "Joined another college");
    expect(await state(id)).toMatchObject({
      stage: "lost",
      next_step: null,
      next_step_due_at: null,
      lost_reason: "Joined another college",
    });
  });

  it("a missing lead is a clean 404-style error", async () => {
    await expect(manual("00000000-0000-4000-8000-000000000000", "lost")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("concurrency and rules", () => {
  it("two simultaneous automatic moves end in the furthest stage, with a consistent history", async () => {
    const id = await fresh();
    await Promise.all([auto(id, "connected"), auto(id, "interested"), auto(id, "attempting")]);
    expect((await state(id)).stage).toBe("interested");
    const h = await hist(id);
    // whatever order they ran in, every recorded step goes strictly forward
    const rank = (s: string) => STAGE_ORDER.indexOf(s as never);
    for (const row of h) expect(rank(row.to_stage)).toBeGreaterThan(rank(row.from_stage!));
  });

  it("terminal stages are enrolled / lost / invalid", () => {
    expect([...TERMINAL_STAGES].sort()).toEqual(["enrolled", "invalid", "lost"]);
  });

  it("assertReasonForManualMove wants at least 3 meaningful characters", () => {
    for (const bad of [undefined, null, "", "  ", "ab", " a "])
      expect(() => assertReasonForManualMove(bad as never), String(bad)).toThrow(/reason/i);
    expect(() => assertReasonForManualMove("abc")).not.toThrow();
  });
});
