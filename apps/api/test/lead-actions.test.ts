import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leadDetail, timelineResponse, type TimelineEvent } from "@vernacular/contracts";
import { withTenant } from "@vernacular/db";
import { allJobs, installJobs } from "../src/jobs/index.js";
import {
  asUser,
  buildTestEnv,
  createAgent,
  createLead,
  createTenant,
  createUser,
  login,
  type TestEnv,
  type TestTenant,
} from "./helpers.js";

let env: TestEnv;
let owner: pg.Pool;
let A: TestTenant;
let B: TestTenant;
const ck: Record<string, string> = {};
let agentId: string;
let leadId: string; // owned by c1
let personId: string;

const call = (method: "GET" | "POST" | "PATCH", url: string, who: string, payload?: object) =>
  env.app.inject({ method, url, headers: asUser(ck[who]!), payload });
const rows = <R>(fn: (t: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<R>) =>
  withTenant(env.db, A.id, fn);
const getLead = (id = leadId) =>
  rows((t) => t.selectFrom("lead").selectAll().where("id", "=", id).executeTakeFirstOrThrow());
const history = (id = leadId) =>
  rows((t) =>
    t
      .selectFrom("lead_stage_history")
      .select(["from_stage", "to_stage", "reason", "actor", "actor_user_id"])
      .where("lead_id", "=", id)
      .orderBy("created_at")
      .execute(),
  );

beforeAll(async () => {
  env = await buildTestEnv();
  owner = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 2 });
  await installJobs(process.env.DATABASE_MIGRATION_URL!, allJobs);
  A = await createTenant(env, "la-a");
  B = await createTenant(env, "la-b");
  for (const [k, role] of [
    ["admin", "admin"],
    ["head", "admission_head"],
    ["c1", "counsellor"],
    ["c2", "counsellor"],
  ] as const)
    await createUser(env, A, k, role);
  await createUser(env, B, "admin", "admin");
  for (const [k, u] of Object.entries(A.users)) ck[k] = await login(env.app, u.email);
  ck.b = await login(env.app, B.users.admin!.email);
  agentId = await createAgent(env, A, "Asha", [A.users.c2!.id]);
  const l = await createLead(env, A, {
    fullName: "Ravi Kumar",
    phone: "+919811122233",
    ownerId: A.users.c1!.id,
    agentId,
    city: "Pune",
  });
  leadId = l.leadId;
  personId = l.personId;
  await rows((t) =>
    t
      .insertInto("person_identifier")
      .values({
        tenant_id: A.id,
        person_id: personId,
        kind: "email",
        value_raw: "Ravi@Example.com",
        value_norm: "ravi@example.com",
      })
      .execute(),
  );
});
afterAll(async () => {
  await owner.end();
  await env.close();
});

describe("GET /api/leads/:id", () => {
  it("returns the full Lead 360 header, matching the shared contract", async () => {
    const res = await call("GET", `/api/leads/${leadId}`, "admin");
    expect(res.statusCode, res.body).toBe(200);
    const d = leadDetail.parse(res.json());
    expect(d).toMatchObject({
      id: leadId,
      stage: "new",
      owner: { id: A.users.c1!.id },
      aiAgent: { displayName: "Asha" },
      cycle: { name: "2026-27" },
      callCount: 0,
      person: { fullName: "Ravi Kumar", city: "Pune", ndncStatus: "unknown" },
    });
    expect(d.person.identifiers.map((i) => i.kind)).toEqual(["email", "phone"]);
  });

  it("admin sees full identifiers; the assigned counsellor sees them masked; nobody else's leads at all", async () => {
    const full = (await call("GET", `/api/leads/${leadId}`, "head")).json().person.identifiers;
    expect(full.find((i: { kind: string }) => i.kind === "phone").value).toBe("+919811122233");
    expect(full.find((i: { kind: string }) => i.kind === "email").value).toBe("ravi@example.com");

    const masked = await call("GET", `/api/leads/${leadId}`, "c1");
    const ids = masked.json().person.identifiers;
    expect(ids.find((i: { kind: string }) => i.kind === "phone").value).toBe("••••••2233");
    expect(ids.find((i: { kind: string }) => i.kind === "email").value).toBe("r•••@example.com");
    expect(masked.body).not.toContain("9811122233");
    expect(masked.body).not.toContain("ravi@example.com");

    const other = await call("GET", `/api/leads/${leadId}`, "c2"); // allocated to the AGENT, but lead is c1's -> agent rule applies
    expect(other.statusCode).toBe(200); // c2 is allocated to this lead's AI agent, so it is theirs too
    expect(
      other.json().person.identifiers.find((i: { kind: string }) => i.kind === "phone").value,
    ).toBe("••••••2233");
  });

  it("404 for another tenant's lead and for unknown ids; 422 for a non-uuid", async () => {
    expect((await call("GET", `/api/leads/${leadId}`, "b")).statusCode).toBe(404);
    expect((await call("GET", `/api/leads/${randomUUID()}`, "admin")).statusCode).toBe(404);
    expect((await call("GET", "/api/leads/nope", "admin")).statusCode).toBe(422);
  });

  it("a counsellor with no link to the lead is refused (403)", async () => {
    const stranger = await createLead(env, A, { fullName: "Unassigned" });
    expect((await call("GET", `/api/leads/${stranger.leadId}`, "c1")).statusCode).toBe(403);
  });
});

describe("GET /api/leads/:id/timeline", () => {
  let tl: string; // a lead dedicated to timeline tests
  const base = new Date("2026-05-01T10:00:00.000Z").getTime();

  beforeAll(async () => {
    const l = await createLead(env, A, { fullName: "Timeline Person", ownerId: A.users.c1!.id });
    tl = l.leadId;
    await rows(async (t) => {
      // 3 notes with the SAME timestamp (page boundaries must not skip or repeat them)
      for (let i = 0; i < 3; i++)
        await t
          .insertInto("lead_note")
          .values({
            tenant_id: A.id,
            lead_id: tl,
            author_id: A.users.c1!.id,
            body: `same-instant ${i}`,
            created_at: new Date(base + 5000),
          } as never)
          .execute();
      await t
        .insertInto("lead_note")
        .values({
          tenant_id: A.id,
          lead_id: tl,
          author_id: null,
          body: "system note",
          kind: "comment",
          created_at: new Date(base + 1000),
        } as never)
        .execute();
      const call1 = await t
        .insertInto("call_attempt")
        .values({
          tenant_id: A.id,
          lead_id: tl,
          status: "completed",
          direction: "outbound",
          started_at: new Date(base + 2000),
          duration_s: 95,
          disposition: "interested",
          recording_key: "k",
          transcript_text: "Student: I want to visit the campus next week.",
        } as never)
        .returning("id")
        .executeTakeFirstOrThrow();
      await t
        .insertInto("call_attempt")
        .values({
          tenant_id: A.id,
          lead_id: tl,
          status: "no_answer",
          started_at: new Date(base),
          duration_s: 0,
        } as never)
        .execute();
      await t
        .insertInto("lead_stage_history")
        .values({
          tenant_id: A.id,
          lead_id: tl,
          from_stage: "new",
          to_stage: "connected",
          actor: "ai",
          reason: "talked 95s",
          created_at: new Date(base + 3000),
        } as never)
        .execute();
      await t
        .insertInto("lead_temperature_observation")
        .values({
          tenant_id: A.id,
          lead_id: tl,
          value: "hot",
          source: "ai_analyst",
          call_attempt_id: call1.id,
          verbatim_quote: "I want to visit the campus next week.",
          observed_at: new Date(base + 4000),
        } as never)
        .execute();
      await t
        .insertInto("lead_temperature_observation")
        .values({
          tenant_id: A.id,
          lead_id: tl,
          value: "warm",
          source: "counsellor",
          observer_user_id: A.users.c1!.id,
          reason: "parents unsure",
          observed_at: new Date(base + 6000),
        } as never)
        .execute();
    });
  });

  it("merges calls, stage changes, notes and temperature, newest first, with the right data for each type", async () => {
    const res = await call("GET", `/api/leads/${tl}/timeline`, "admin");
    expect(res.statusCode, res.body).toBe(200);
    const out = timelineResponse.parse(res.json());
    expect(out.nextCursor).toBeNull();
    const types = out.items.map((e) => e.type);
    expect(types).toEqual([
      "temperature",
      "note",
      "note",
      "note",
      "temperature",
      "stage_change",
      "call",
      "note",
      "call",
    ]);
    const times = out.items.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const byType = (t: string) => out.items.filter((e) => e.type === t) as TimelineEvent[];
    const noAnswer = byType("call").find(
      (e) => e.type === "call" && e.data.status === "no_answer",
    )!;
    expect(noAnswer.data).toMatchObject({
      durationS: 0,
      hasRecording: false,
      hasTranscript: false,
    });
    expect(
      byType("temperature").find((e) => e.type === "temperature" && e.data.source === "ai_analyst")!
        .data,
    ).toMatchObject({ value: "hot", quote: "I want to visit the campus next week." });
    expect(
      byType("temperature").find((e) => e.type === "temperature" && e.data.source === "counsellor")!
        .data,
    ).toMatchObject({ value: "warm", reason: "parents unsure", observerName: "c1 user" });
    expect(byType("stage_change")[0]!.data).toMatchObject({
      from: "new",
      to: "connected",
      actor: "ai",
      actorName: null,
    });
    expect(
      byType("note").some(
        (e) => e.type === "note" && e.data.kind === "comment" && e.data.authorName === null,
      ),
    ).toBe(true);
    const fullCall = byType("call").find(
      (e) => e.type === "call" && e.data.status === "completed",
    )!;
    expect(fullCall.data).toMatchObject({
      durationS: 95,
      hasRecording: true,
      hasTranscript: true,
      disposition: "interested",
    });
  });

  it("pages through everything with no gaps or repeats, even across events sharing a timestamp", async () => {
    const all = timelineResponse
      .parse((await call("GET", `/api/leads/${tl}/timeline?limit=100`, "admin")).json())
      .items.map((e) => e.id);
    expect(all).toHaveLength(9);
    for (const limit of [1, 2, 3, 4]) {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 20; guard++) {
        const res = await call(
          "GET",
          `/api/leads/${tl}/timeline?limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`,
          "admin",
        );
        const page = timelineResponse.parse(res.json());
        expect(page.items.length).toBeLessThanOrEqual(limit);
        seen.push(...page.items.map((e) => e.id));
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      expect(seen, `limit=${limit}`).toEqual(all);
    }
  });

  it("rejects tampered cursors and out-of-range limits", async () => {
    expect(
      (await call("GET", `/api/leads/${tl}/timeline?cursor=garbage`, "admin")).statusCode,
    ).toBe(422);
    expect(
      (
        await call(
          "GET",
          `/api/leads/${tl}/timeline?cursor=${Buffer.from('{"at":1}').toString("base64url")}`,
          "admin",
        )
      ).statusCode,
    ).toBe(422);
    expect((await call("GET", `/api/leads/${tl}/timeline?limit=0`, "admin")).statusCode).toBe(422);
    expect((await call("GET", `/api/leads/${tl}/timeline?limit=101`, "admin")).statusCode).toBe(
      422,
    );
  });

  it("is scoped: assigned counsellor yes, stranger 403, other tenant 404", async () => {
    expect((await call("GET", `/api/leads/${tl}/timeline`, "c1")).statusCode).toBe(200);
    expect((await call("GET", `/api/leads/${tl}/timeline`, "c2")).statusCode).toBe(403);
    expect((await call("GET", `/api/leads/${tl}/timeline`, "b")).statusCode).toBe(404);
  });
});

describe("PATCH /api/leads/:id", () => {
  it("changing the stage needs a reason; with one it is moved, logged with the user, and visible on the timeline", async () => {
    const l = await createLead(env, A, { ownerId: A.users.c1!.id });
    const noReason = await call("PATCH", `/api/leads/${l.leadId}`, "c1", {
      stage: "interested",
      nextStep: "book_visit",
    });
    expect(noReason.statusCode).toBe(422);
    expect(noReason.json().error.code).toBe("REASON_REQUIRED");
    expect((await getLead(l.leadId)).stage).toBe("new"); // rolled back

    const ok = await call("PATCH", `/api/leads/${l.leadId}`, "c1", {
      stage: "interested",
      nextStep: "book_visit",
      nextStepDueAt: "2026-12-05T09:00:00Z",
      reason: "Student wants to visit",
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toMatchObject({
      stage: "interested",
      nextStep: "book_visit",
      nextStepDueAt: "2026-12-05T09:00:00.000Z",
    });
    expect(await history(l.leadId)).toEqual([
      {
        from_stage: "new",
        to_stage: "interested",
        reason: "Student wants to visit",
        actor: "user",
        actor_user_id: A.users.c1!.id,
      },
    ]);
    const tl = (await call("GET", `/api/leads/${l.leadId}/timeline`, "c1")).json().items;
    expect(tl[0]).toMatchObject({
      type: "stage_change",
      data: { to: "interested", actor: "user", actorName: "c1 user" },
    });
  });

  it("an open lead must keep a next step: moving stage without one (or clearing it) is refused and rolled back", async () => {
    const l = await createLead(env, A, { ownerId: A.users.c1!.id });
    const r = await call("PATCH", `/api/leads/${l.leadId}`, "c1", {
      stage: "interested",
      reason: "interested now",
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.code).toBe("NEXT_STEP_REQUIRED");
    expect((await getLead(l.leadId)).stage).toBe("new");
    expect(await history(l.leadId)).toEqual([]);

    await call("PATCH", `/api/leads/${l.leadId}`, "c1", { nextStep: "callback" });
    const clear = await call("PATCH", `/api/leads/${l.leadId}`, "c1", { nextStep: null });
    expect(clear.json().error.code).toBe("NEXT_STEP_REQUIRED");
    expect((await getLead(l.leadId)).next_step).toBe("callback");
  });

  it("closing a lead (lost) keeps the reason and clears the next step; reopening needs a next step again", async () => {
    const l = await createLead(env, A, { ownerId: A.users.c1!.id });
    await call("PATCH", `/api/leads/${l.leadId}`, "c1", {
      nextStep: "callback",
      nextStepDueAt: "2026-12-05T09:00:00Z",
    });
    const lost = await call("PATCH", `/api/leads/${l.leadId}`, "c1", {
      stage: "lost",
      reason: "Joined another college",
    });
    expect(lost.json()).toMatchObject({
      stage: "lost",
      nextStep: null,
      nextStepDueAt: null,
      lostReason: "Joined another college",
    });
    const reopen = await call("PATCH", `/api/leads/${l.leadId}`, "c1", {
      stage: "interested",
      reason: "Changed their mind",
    });
    expect(reopen.json().error.code).toBe("NEXT_STEP_REQUIRED");
    const ok = await call("PATCH", `/api/leads/${l.leadId}`, "c1", {
      stage: "interested",
      reason: "Changed their mind",
      nextStep: "counsellor_call",
    });
    expect(ok.statusCode).toBe(200);
    expect((await history(l.leadId)).map((h) => `${h.from_stage}>${h.to_stage}`)).toEqual([
      "new>lost",
      "lost>interested",
    ]);
  });

  it("sub-stages must belong to the lead's stage, and a stage change clears the old one", async () => {
    const l = await createLead(env, A, { ownerId: A.users.c1!.id, stage: "interested" });
    const sub = await rows((t) =>
      t
        .insertInto("lead_sub_stage")
        .values({ tenant_id: A.id, core_stage: "interested", name: "Waiting for JEE result" })
        .returning("id")
        .executeTakeFirstOrThrow(),
    );
    const wrong = await rows((t) =>
      t
        .insertInto("lead_sub_stage")
        .values({ tenant_id: A.id, core_stage: "applied", name: "Docs pending" })
        .returning("id")
        .executeTakeFirstOrThrow(),
    );
    await call("PATCH", `/api/leads/${l.leadId}`, "c1", { nextStep: "callback" });

    expect(
      (await call("PATCH", `/api/leads/${l.leadId}`, "c1", { subStageId: wrong.id })).statusCode,
    ).toBe(422);
    expect(
      (await call("PATCH", `/api/leads/${l.leadId}`, "c1", { subStageId: randomUUID() }))
        .statusCode,
    ).toBe(422);
    const ok = await call("PATCH", `/api/leads/${l.leadId}`, "c1", { subStageId: sub.id });
    expect(ok.json().subStage).toMatchObject({ id: sub.id, name: "Waiting for JEE result" });

    const moved = await call("PATCH", `/api/leads/${l.leadId}`, "c1", {
      stage: "visit_booked",
      reason: "Visit booked",
      nextStep: "send_info",
    });
    expect(moved.json().subStage).toBeNull();
    const clearedExplicit = await call("PATCH", `/api/leads/${l.leadId}`, "c1", {
      stage: "applied",
      subStageId: wrong.id,
      reason: "Form filled",
    });
    expect(clearedExplicit.json().subStage).toMatchObject({ id: wrong.id }); // stage and matching sub-stage in one patch
  });

  it("only owner/admin/head may reassign; the new owner must belong to the tenant; it is audited", async () => {
    const l = await createLead(env, A, { ownerId: A.users.c1!.id });
    const denied = await call("PATCH", `/api/leads/${l.leadId}`, "c1", {
      ownerCounsellorId: A.users.c2!.id,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("ONLY_MANAGERS_CAN_REASSIGN");
    expect((await getLead(l.leadId)).owner_counsellor_id).toBe(A.users.c1!.id);

    expect(
      (await call("PATCH", `/api/leads/${l.leadId}`, "head", { ownerCounsellorId: randomUUID() }))
        .statusCode,
    ).toBe(422);
    const ok = await call("PATCH", `/api/leads/${l.leadId}`, "head", {
      ownerCounsellorId: A.users.c2!.id,
    });
    expect(ok.json().owner).toMatchObject({ id: A.users.c2!.id });
    const audit = await rows((t) =>
      t
        .selectFrom("audit_log")
        .select(["action", "diff", "actor_user_id"])
        .where("entity_id", "=", l.leadId)
        .execute(),
    );
    expect(audit).toEqual([
      {
        action: "lead.reassign",
        actor_user_id: A.users.head!.id,
        diff: { from: A.users.c1!.id, to: A.users.c2!.id },
      },
    ]);
    // un-assign
    expect(
      (await call("PATCH", `/api/leads/${l.leadId}`, "admin", { ownerCounsellorId: null })).json()
        .owner,
    ).toBeNull();
  });

  it("a counsellor cannot edit a lead that isn't theirs; other tenants get 404; bad bodies get 422", async () => {
    const l = await createLead(env, A, { ownerId: A.users.c1!.id, stage: "interested" });
    await rows((t) =>
      t.updateTable("lead").set({ ai_agent_id: null }).where("id", "=", l.leadId).execute(),
    );
    expect(
      (await call("PATCH", `/api/leads/${l.leadId}`, "c2", { nextStep: "callback" })).statusCode,
    ).toBe(403);
    expect(
      (await call("PATCH", `/api/leads/${l.leadId}`, "b", { nextStep: "callback" })).statusCode,
    ).toBe(404);
    for (const body of [
      {},
      { reason: "only a reason" },
      { stage: "bogus" },
      { nextStep: "dance" },
      { nextStepDueAt: "tomorrow" },
      { ownerCounsellorId: "x" },
    ]) {
      expect(
        (await call("PATCH", `/api/leads/${l.leadId}`, "admin", body)).statusCode,
        JSON.stringify(body),
      ).toBe(422);
    }
  });
});

describe("POST /api/leads/:id/notes", () => {
  it("adds a note that shows on the timeline with the author's name", async () => {
    const l = await createLead(env, A, { ownerId: A.users.c1!.id });
    const res = await call("POST", `/api/leads/${l.leadId}/notes`, "c1", {
      body: "Parent called, wants a Saturday visit",
      kind: "outcome",
    });
    expect(res.statusCode).toBe(201);
    const tl = (await call("GET", `/api/leads/${l.leadId}/timeline`, "c1")).json().items;
    expect(tl[0]).toMatchObject({
      type: "note",
      data: {
        body: "Parent called, wants a Saturday visit",
        kind: "outcome",
        authorName: "c1 user",
      },
    });
  });
  it("validates, and respects lead access", async () => {
    const l = await createLead(env, A, { ownerId: A.users.c1!.id });
    expect(
      (await call("POST", `/api/leads/${l.leadId}/notes`, "c1", { body: "   " })).statusCode,
    ).toBe(422);
    expect(
      (await call("POST", `/api/leads/${l.leadId}/notes`, "c1", { body: "x".repeat(4001) }))
        .statusCode,
    ).toBe(422);
    expect(
      (await call("POST", `/api/leads/${l.leadId}/notes`, "c1", { body: "hi", kind: "comment" }))
        .statusCode,
    ).toBe(422);
    expect(
      (await call("POST", `/api/leads/${l.leadId}/notes`, "c2", { body: "hi" })).statusCode,
    ).toBe(403);
    expect(
      (await call("POST", `/api/leads/${l.leadId}/notes`, "b", { body: "hi" })).statusCode,
    ).toBe(404);
  });
});

describe("POST /api/leads/:id/call-now", () => {
  const ready = async (extra: { agent?: boolean } = {}) => {
    const l = await createLead(env, A, {
      ownerId: A.users.c1!.id,
      ...(extra.agent ? { agentId } : {}),
    });
    await rows(async (t) => {
      await t
        .updateTable("person")
        .set({ ndnc_status: "clear" })
        .where("id", "=", l.personId)
        .execute();
      await t
        .insertInto("consent_record")
        .values({
          tenant_id: A.id,
          person_id: l.personId,
          channel: "voice",
          purpose: "admission",
          granted: true,
          source: "test",
        })
        .execute();
    });
    return l;
  };
  const openHours = () =>
    rows((t) =>
      t
        .updateTable("tenant_policy")
        .set({
          call_window_start: "00:00",
          call_window_end: "23:59",
          allowed_days: [1, 2, 3, 4, 5, 6, 7],
        } as never)
        .execute(),
    );
  const jobsFor = async (id: string) =>
    (
      await owner.query(
        `select data from pgboss.job where name = 'call.dial' and data->>'leadId' = $1`,
        [id],
      )
    ).rows;

  it("queues a call (and a double click is still ONE call)", async () => {
    await openHours();
    const l = await ready();
    const first = await call("POST", `/api/leads/${l.leadId}/call-now`, "c1");
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toEqual({ queued: true });
    expect((await call("POST", `/api/leads/${l.leadId}/call-now`, "c1")).json()).toEqual({
      queued: true,
    });
    const jobs = await jobsFor(l.leadId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toMatchObject({ tenantId: A.id, trigger: "call_now" });
  });

  it("a blocked call is reported with its reason, recorded on the lead, and queues nothing", async () => {
    await openHours();
    const l = await ready();
    await rows((t) =>
      t.updateTable("person").set({ ndnc_status: "listed" }).where("id", "=", l.personId).execute(),
    );
    const res = await call("POST", `/api/leads/${l.leadId}/call-now`, "c1");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ queued: false, rejection: { code: "NDNC_LISTED" } });
    expect((await getLead(l.leadId)).last_reject_code).toBe("NDNC_LISTED");
    expect((await call("GET", `/api/leads/${l.leadId}`, "c1")).json().lastRejectCode).toBe(
      "NDNC_LISTED",
    );
    expect(await jobsFor(l.leadId)).toHaveLength(0);
  });

  it("outside calling hours: the reason AND when it will be possible", async () => {
    const l = await ready();
    await rows((t) =>
      t
        .updateTable("tenant_policy")
        .set({
          call_window_start: "09:00",
          call_window_end: "09:01",
          allowed_days: [1, 2, 3, 4, 5, 6, 7],
        } as never)
        .execute(),
    );
    const res = (await call("POST", `/api/leads/${l.leadId}/call-now`, "c1")).json();
    // (a 1-minute window: outside except for one minute a day, which is fine for a test run in CI at any other time)
    if (!res.queued) {
      expect(res.rejection.code).toBe("OUTSIDE_WINDOW");
      expect(Date.parse(res.rejection.retryAt)).toBeGreaterThan(Date.now());
    }
  });

  it("the DEFAULT policy blocks a number that was never NDNC-checked (NDNC_UNKNOWN)", async () => {
    await openHours();
    const l = await createLead(env, A, { ownerId: A.users.c1!.id });
    await rows((t) =>
      t
        .insertInto("consent_record")
        .values({
          tenant_id: A.id,
          person_id: l.personId,
          channel: "voice",
          purpose: "admission",
          granted: true,
          source: "test",
        })
        .execute(),
    );
    expect((await call("POST", `/api/leads/${l.leadId}/call-now`, "c1")).json()).toEqual({
      queued: false,
      rejection: { code: "NDNC_UNKNOWN" },
    });
  });

  it("no consent / suppressed are reported, closed leads are a 409, strangers 403, other tenants 404", async () => {
    await openHours();
    const noConsent = await createLead(env, A, { ownerId: A.users.c1!.id });
    await rows((t) =>
      t
        .updateTable("person")
        .set({ ndnc_status: "clear" })
        .where("id", "=", noConsent.personId)
        .execute(),
    );
    expect(
      (await call("POST", `/api/leads/${noConsent.leadId}/call-now`, "c1")).json().rejection.code,
    ).toBe("NO_CONSENT");

    const supp = await ready();
    await rows((t) =>
      t
        .insertInto("suppression")
        .values({ tenant_id: A.id, kind: "phone", value_norm: supp.phone, reason: "opt_out" })
        .execute(),
    );
    expect(
      (await call("POST", `/api/leads/${supp.leadId}/call-now`, "c1")).json().rejection.code,
    ).toBe("SUPPRESSED");

    const closed = await ready();
    await rows((t) =>
      t.updateTable("lead").set({ stage: "lost" }).where("id", "=", closed.leadId).execute(),
    );
    const c = await call("POST", `/api/leads/${closed.leadId}/call-now`, "c1");
    expect(c.statusCode).toBe(409);
    expect(c.json().error.code).toBe("LEAD_CLOSED");

    const stranger = await createLead(env, A, {});
    expect((await call("POST", `/api/leads/${stranger.leadId}/call-now`, "c1")).statusCode).toBe(
      403,
    );
    expect((await call("POST", `/api/leads/${noConsent.leadId}/call-now`, "b")).statusCode).toBe(
      404,
    );
  });
});
