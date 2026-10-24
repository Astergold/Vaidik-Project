import { describe, expect, it } from "vitest";
import type { LeadDetail } from "@vernacular/contracts";
import {
  buildStagePatch,
  initialStageForm,
  stageErrorsFromApi,
  zonedLocalToIso,
} from "@/features/lead360/stage-form";
import { ApiCallError } from "@/lib/api";

const lead = (over: Partial<LeadDetail> = {}): LeadDetail => ({
  id: "01a14679-1d15-784c-bf57-ba49718c66bc",
  stage: "attempting",
  subStage: null,
  temperature: null,
  nextStep: null,
  nextStepDueAt: null,
  owner: null,
  aiAgent: null,
  source: null,
  program: null,
  cycle: { id: "01a14679-1d09-7370-b710-6f6701830a32", name: "2026-27" },
  person: {
    id: "01a14679-1d13-7337-96e5-6b2b10492140",
    fullName: "Test",
    preferredLanguage: null,
    city: null,
    state: null,
    ndncStatus: "clear",
    identifiers: [],
  },
  lastRejectCode: null,
  lastRejectAt: null,
  lostReason: null,
  callCount: 0,
  createdAt: "2026-10-15T00:00:00.000Z",
  updatedAt: "2026-10-15T00:00:00.000Z",
  ...over,
});
const TZ = "Asia/Kolkata";

describe("stage change form (D3-I4-01)", () => {
  it("blocks a change without a reason, client-side", () => {
    const r = buildStagePatch(
      lead(),
      { ...initialStageForm(lead()), stage: "lost", reason: " x " },
      TZ,
    );
    expect(r).toEqual({ ok: false, errors: { reason: expect.stringMatching(/at least 3/) } });
  });

  it("requires a different stage", () => {
    const r = buildStagePatch(lead(), { ...initialStageForm(lead()), reason: "because" }, TZ);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.stage).toBe("Choose a different stage");
  });

  it("an open target with no next step asks for one; a closed one doesn't", () => {
    const open = buildStagePatch(
      lead(),
      { ...initialStageForm(lead()), stage: "interested", reason: "keen" },
      TZ,
    );
    expect(!open.ok && open.errors.nextStep).toMatch(/next step/);
    const closed = buildStagePatch(
      lead(),
      { ...initialStageForm(lead()), stage: "lost", reason: "not keen" },
      TZ,
    );
    expect(closed).toEqual({ ok: true, body: { stage: "lost", reason: "not keen" } });
  });

  it("sends next step + due (tenant time) and clears a stale sub-stage", () => {
    const l = lead({
      subStage: { id: "01a14679-1d15-784c-bf57-ba49718c66bd", name: "Callback asked" },
    });
    const r = buildStagePatch(
      l,
      {
        stage: "interested",
        reason: "  wants a visit ",
        nextStep: "book_visit",
        nextStepDue: "2026-10-18T10:00",
      },
      TZ,
    );
    expect(r).toEqual({
      ok: true,
      body: {
        stage: "interested",
        reason: "wants a visit",
        subStageId: null,
        nextStep: "book_visit",
        nextStepDueAt: "2026-10-18T04:30:00.000Z",
      },
    });
  });

  it("keeps an existing next step without resending it", () => {
    const l = lead({ nextStep: "callback" });
    const r = buildStagePatch(
      l,
      { ...initialStageForm(l), stage: "connected", reason: "picked up" },
      TZ,
    );
    expect(r).toEqual({ ok: true, body: { stage: "connected", reason: "picked up" } });
  });
});

describe("server errors map inline, not to a toast", () => {
  it("REASON_REQUIRED (no details path) → reason field", () => {
    expect(
      stageErrorsFromApi(
        new ApiCallError(422, "REASON_REQUIRED", "Changing the stage needs a reason"),
      ),
    ).toEqual({
      reason: "Changing the stage needs a reason",
    });
  });

  it("NEXT_STEP_REQUIRED → next step field, using the details message", () => {
    const err = new ApiCallError(422, "NEXT_STEP_REQUIRED", "Every open lead needs a next step", [
      { path: "nextStep", message: "Choose a next step (and due date) for this lead" },
    ]);
    expect(stageErrorsFromApi(err)).toEqual({
      nextStep: "Choose a next step (and due date) for this lead",
    });
  });

  it("other 422 details map by path; 403 is a form error", () => {
    const err = new ApiCallError(422, "VALIDATION_ERROR", "x", [
      { path: "subStageId", message: "Sub-stage not found" },
    ]);
    expect(stageErrorsFromApi(err)).toEqual({ subStageId: "Sub-stage not found" });
    expect(stageErrorsFromApi(new ApiCallError(403, "FORBIDDEN", "Not your lead"))).toEqual({
      form: "Not your lead",
    });
  });
});

describe("zonedLocalToIso", () => {
  it("interprets the input in the tenant zone, not the browser's", () => {
    expect(zonedLocalToIso("2026-10-18T10:00", "Asia/Kolkata")).toBe("2026-10-18T04:30:00.000Z");
    expect(zonedLocalToIso("2026-10-18T10:00", "UTC")).toBe("2026-10-18T10:00:00.000Z");
  });

  it("handles DST zones", () => {
    // New York is UTC-4 in July, UTC-5 in December
    expect(zonedLocalToIso("2026-07-01T09:00", "America/New_York")).toBe(
      "2026-07-01T13:00:00.000Z",
    );
    expect(zonedLocalToIso("2026-12-01T09:00", "America/New_York")).toBe(
      "2026-12-01T14:00:00.000Z",
    );
  });

  it("rejects garbage", () => {
    expect(zonedLocalToIso("tomorrow", TZ)).toBeNull();
  });
});
