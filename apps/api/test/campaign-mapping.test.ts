import { describe, expect, it } from "vitest";
import {
  buildWaveCsv,
  isSkipCode,
  runOutcome,
  toPlatformCircuitBreaker,
  toPlatformRetry,
  toPlatformSchedule,
  waveStateOf,
} from "../src/modules/campaigns/mapping.js";
import { POLICY_REJECT_CODES } from "@vernacular/contracts";

const POLICY = {
  allowedDays: [1, 2, 3, 4, 5, 6],
  callWindowStart: "09:00",
  callWindowEnd: "21:00",
};

describe("toPlatformSchedule", () => {
  it("schedule off → the institution's calling hours, weekdays shifted to 0 = Monday", () => {
    const s = toPlatformSchedule(
      {
        enabled: false,
        schedule: { days: [1], windowStart: "10:00", windowEnd: "11:00" },
      },
      POLICY,
      "Asia/Kolkata",
    );
    expect(s).toEqual({
      enabled: true,
      timezone: "Asia/Kolkata",
      slots: [0, 1, 2, 3, 4, 5].map((d) => ({
        day_of_week: d,
        start_time: "09:00",
        end_time: "21:00",
      })),
    });
  });
  it("schedule on → intersection of days and window", () => {
    const s = toPlatformSchedule(
      {
        enabled: true,
        schedule: { days: [5, 6, 7], windowStart: "08:00", windowEnd: "12:30" },
      },
      POLICY,
      "Asia/Kolkata",
    );
    expect(s?.slots).toEqual([
      { day_of_week: 4, start_time: "09:00", end_time: "12:30" },
      { day_of_week: 5, start_time: "09:00", end_time: "12:30" },
    ]);
  });
  it("no overlap → null (no days, or empty window)", () => {
    expect(
      toPlatformSchedule(
        {
          enabled: true,
          schedule: { days: [7], windowStart: "10:00", windowEnd: "11:00" },
        },
        POLICY,
        "UTC",
      ),
    ).toBeNull();
    expect(
      toPlatformSchedule(
        {
          enabled: true,
          schedule: { days: [1], windowStart: "21:00", windowEnd: "22:00" },
        },
        POLICY,
        "UTC",
      ),
    ).toBeNull();
  });
});

describe("settings mapping", () => {
  it("retry and circuit breaker map to platform field names (threshold % → fraction)", () => {
    expect(
      toPlatformRetry({
        enabled: true,
        maxRetries: 1,
        retryDelaySeconds: 120,
        onBusy: true,
        onNoAnswer: true,
        onVoicemail: false,
      }),
    ).toEqual({
      enabled: true,
      max_retries: 1,
      retry_delay_seconds: 120,
      retry_on_busy: true,
      retry_on_no_answer: true,
      retry_on_voicemail: false,
    });
    expect(
      toPlatformCircuitBreaker({
        enabled: true,
        failureThresholdPct: 50,
        windowSeconds: 120,
        minCallsInWindow: 5,
      }),
    ).toEqual({
      enabled: true,
      failure_threshold: 0.5,
      window_seconds: 120,
      min_calls_in_window: 5,
    });
  });
  it("every policy code is classified: time-based codes are never skips", () => {
    const skips = POLICY_REJECT_CODES.filter(isSkipCode);
    expect(skips).not.toContain("OUTSIDE_WINDOW");
    expect(skips).not.toContain("TOO_SOON");
    expect(skips).not.toContain("CAP_REACHED");
    expect(skips).not.toContain("WALLET_EMPTY");
    expect(skips).toEqual(
      expect.arrayContaining(["SUPPRESSED", "NDNC_LISTED", "NO_CONSENT", "CALL_IN_PROGRESS"]),
    );
  });
});

describe("buildWaveCsv", () => {
  it("writes the header and escapes commas, quotes, newlines and formula injection", () => {
    const csv = buildWaveCsv([
      {
        phone_number: "+919000000001",
        lead_id: "l1",
        call_attempt_id: "a1",
        crm_campaign_id: "c1",
        person_name: 'Sharma, "Ravi"\nK',
        program: "=HYPERLINK()",
        language: null,
      },
    ]);
    expect(csv).toBe(
      "phone_number,lead_id,call_attempt_id,crm_campaign_id,person_name,program,language\n" +
        '+919000000001,l1,a1,c1,"Sharma, ""Ravi"" K",\'=HYPERLINK(),\n',
    );
  });
});

describe("runOutcome", () => {
  const run = (over: object) => ({
    id: 1,
    created_at: "2026-10-24T10:00:00Z",
    is_completed: true,
    ...over,
  });
  it.each([
    [
      {
        gathered_context: { mapped_call_disposition: "user_hangup" },
        cost_info: { call_duration_seconds: 107 },
      },
      "completed",
      107,
    ],
    [
      {
        gathered_context: { call_disposition: "busy" },
        cost_info: { call_duration_seconds: 0 },
      },
      "busy",
      0,
    ],
    [{ gathered_context: { mapped_call_disposition: "no_answer" } }, "no_answer", null],
    [{ gathered_context: { mapped_call_disposition: "voicemail" } }, "no_answer", null],
    [{ gathered_context: { mapped_call_disposition: "failed" } }, "failed", null],
    [{ gathered_context: {}, cost_info: { call_duration_seconds: 0 } }, "no_answer", 0],
    [{ is_completed: false }, "in_progress", null],
    [
      {
        gathered_context: { mapped_call_disposition: "something_new" },
        cost_info: { call_duration_seconds: 30 },
      },
      "completed",
      30,
    ],
  ])("%j → %s", (over, status, dur) => {
    const o = runOutcome(run(over));
    expect(o.status).toBe(status);
    expect(o.durationS).toBe(dur);
  });
  it("reads the call_attempt_id the CRM put in the CSV", () => {
    expect(runOutcome(run({ initial_context: { call_attempt_id: "abc" } })).callAttemptId).toBe(
      "abc",
    );
    expect(runOutcome(run({ initial_context: null })).callAttemptId).toBeNull();
  });
});

describe("waveStateOf", () => {
  it.each([
    ["created", "created"],
    ["running", "running"],
    ["syncing", "running"],
    ["paused", "paused"],
    ["completed", "completed"],
    ["failed", "failed"],
    ["never-seen", "running"],
  ])("%s → %s", (input, out) => expect(waveStateOf(input)).toBe(out));
});
