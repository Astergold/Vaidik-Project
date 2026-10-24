import { describe, expect, it } from "vitest";
import { campaign, CAMPAIGN_STATUSES, leadsListQuery } from "@vernacular/contracts";
import {
  actionsFor,
  emptyCampaignForm,
  filterToLeadsSearch,
  formatDays,
  formFromCampaign,
  leadsSearchToFilter,
  matchCountQuery,
  progressPct,
  validateCampaignForm,
} from "@/features/campaigns/campaign-logic";
import { toLeadsApiQuery } from "@/features/leads/leads-search";
import { toQueryString } from "@/lib/api";

const AGENT = "01a14679-1d0e-7a18-bf77-11f3cd23feba";
const SRC = "01a14679-1d11-775e-86f3-891dd1d80a60";
const C1 = "01a14679-1cc4-7b7a-980d-5cec851fd541";

describe("status → buttons (D3-I4-04)", () => {
  it("draft: start + edit; running: pause + stop; paused: resume + stop + edit; finished: nothing", () => {
    const none = {
      start: false,
      resume: false,
      pause: false,
      stop: false,
      edit: false,
    };
    expect(actionsFor("draft")).toEqual({ ...none, start: true, edit: true });
    expect(actionsFor("running")).toEqual({ ...none, pause: true, stop: true });
    expect(actionsFor("paused")).toEqual({
      ...none,
      resume: true,
      stop: true,
      edit: true,
    });
    for (const s of ["stopped", "completed"] as const) expect(actionsFor(s)).toEqual(none);
  });
  it("covers every status in the contract", () => {
    for (const s of CAMPAIGN_STATUSES) expect(actionsFor(s)).toBeDefined();
  });
});

describe("filter builder ↔ Leads query (one vocabulary)", () => {
  const filter = {
    stage: ["interested" as const, "visit_booked" as const],
    temperature: ["hot" as const],
    sourceId: [SRC],
    counsellorId: [C1],
    createdFrom: "2026-10-01",
    createdTo: "2026-10-17",
  };

  it("round-trips filter → Leads URL state → filter", () => {
    expect(leadsSearchToFilter(filterToLeadsSearch(filter))).toEqual(filter);
    expect(leadsSearchToFilter(filterToLeadsSearch({}))).toEqual({});
  });

  it("the Leads API query it produces is accepted by leadsListQuery with the same values", () => {
    const q = toLeadsApiQuery(filterToLeadsSearch(filter));
    const wire = Object.fromEntries(
      [...new URLSearchParams(toQueryString(q).slice(1))].reduce(
        (m, [k, v]) => m.set(k, [...(m.get(k) ?? []), v]),
        new Map<string, string[]>(),
      ),
    );
    const parsed = leadsListQuery.parse(
      Object.fromEntries(Object.entries(wire).map(([k, v]) => [k, v.length === 1 ? v[0] : v])),
    );
    const list = (v: unknown) => (Array.isArray(v) ? v : v === undefined ? undefined : [v]);
    expect(list(parsed.stage)).toEqual(filter.stage);
    expect(list(parsed.temperature)).toEqual(filter.temperature);
    expect(list(parsed.sourceId)).toEqual(filter.sourceId);
    expect(list(parsed.counsellorId)).toEqual(filter.counsellorId);
    expect([parsed.createdFrom, parsed.createdTo]).toEqual([filter.createdFrom, filter.createdTo]);
  });

  it("the match-count query asks for one row (we only need total)", () => {
    expect(matchCountQuery(filter)).toMatchObject({
      page: 1,
      pageSize: 1,
      stage: filter.stage,
    });
  });
});

describe("form validation mirrors the API", () => {
  const valid = {
    ...emptyCampaignForm(),
    name: "Interested Oct",
    workflowId: "2",
  };

  it("a valid form builds the create body (empty max-concurrent = platform default)", () => {
    expect(validateCampaignForm(valid)).toEqual({
      ok: true,
      body: {
        name: "Interested Oct",
        workflowId: 2,
        telephonyConfigId: null,
        aiAgentId: null,
        leadFilter: {},
        batchSize: 100,
        maxConcurrent: null,
        retry: {
          enabled: true,
          maxRetries: 1,
          retryDelaySeconds: 120,
          onBusy: true,
          onNoAnswer: true,
          onVoicemail: false,
        },
        scheduleEnabled: false,
        schedule: {
          days: [1, 2, 3, 4, 5],
          windowStart: "10:00",
          windowEnd: "18:00",
        },
        circuitBreaker: {
          enabled: true,
          failureThresholdPct: 50,
          windowSeconds: 120,
          minCallsInWindow: 5,
        },
      },
    });
  });

  it("carries the chosen telephony configuration, agent, wave size and settings", () => {
    const r = validateCampaignForm({
      ...valid,
      telephonyConfigId: "1",
      aiAgentId: AGENT,
      batchSize: "200",
      maxConcurrent: "7",
      retryOnVoicemail: true,
      breakerEnabled: false,
    });
    expect(r.ok && r.body).toMatchObject({
      telephonyConfigId: 1,
      aiAgentId: AGENT,
      batchSize: 200,
      maxConcurrent: 7,
      retry: { onVoicemail: true },
      circuitBreaker: { enabled: false },
    });
  });

  it("schedule fields are only checked when the schedule is on", () => {
    expect(validateCampaignForm({ ...valid, days: [] }).ok).toBe(true);
    const r = validateCampaignForm({
      ...valid,
      scheduleEnabled: true,
      days: [],
    });
    expect(!r.ok && r.errors.days).toBeTruthy();
  });

  it.each([
    [{ workflowId: "" }, "workflowId"],
    [{ maxConcurrent: "0" }, "maxConcurrent"],
    [{ maxConcurrent: "101" }, "maxConcurrent"],
    [{ maxConcurrent: "2.5" }, "maxConcurrent"],
    [{ maxRetries: "11" }, "maxRetries"],
    [{ retryDelaySeconds: "10" }, "retryDelaySeconds"],
    [{ failureThresholdPct: "0" }, "failureThresholdPct"],
    [{ windowSeconds: "601" }, "windowSeconds"],
    [{ minCallsInWindow: "" }, "minCallsInWindow"],
    [{ scheduleEnabled: true, windowStart: "18:00", windowEnd: "10:00" }, "windowEnd"],
    [{ name: "  " }, "name"],
  ])("%o → error on %s", (patch, field) => {
    const r = validateCampaignForm({ ...valid, ...patch });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[field]).toBeTruthy();
  });
});

describe("edit form and display", () => {
  const c = campaign.parse({
    id: "01a14679-0000-7000-8000-0000000000c1",
    name: "Hot leads",
    status: "paused",
    workflow: { id: 3, name: "Follow-up" },
    telephonyConfigId: null,
    aiAgent: { id: AGENT, displayName: "Asha (English)" },
    leadFilter: { temperature: ["hot"] },
    scheduleEnabled: true,
    schedule: { days: [6, 1, 2], windowStart: "09:30", windowEnd: "17:00" },
    maxConcurrent: 3,
    batchSize: 200,
    retry: {
      enabled: false,
      maxRetries: 2,
      retryDelaySeconds: 300,
      onBusy: true,
      onNoAnswer: false,
      onVoicemail: true,
    },
    circuitBreaker: {
      enabled: true,
      failureThresholdPct: 40,
      windowSeconds: 60,
      minCallsInWindow: 3,
    },
    progress: {
      total: 40,
      dialed: 10,
      connected: 4,
      failed: 1,
      pending: 30,
      skipped: 0,
    },
    waves: [],
    lastError: null,
    lastSyncedAt: null,
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
  });
  it("prefills the form from a campaign and validates back to the same settings", () => {
    const r = validateCampaignForm(formFromCampaign(c));
    expect(r.ok && r.body).toEqual({
      name: "Hot leads",
      workflowId: 3,
      telephonyConfigId: null,
      aiAgentId: AGENT,
      leadFilter: c.leadFilter,
      batchSize: 200,
      maxConcurrent: 3,
      retry: c.retry,
      scheduleEnabled: true,
      schedule: { days: [1, 2, 6], windowStart: "09:30", windowEnd: "17:00" },
      circuitBreaker: c.circuitBreaker,
    });
  });
  it("formats days and progress", () => {
    expect(formatDays([1, 2, 3, 4, 5])).toBe("Mon–Fri");
    expect(formatDays([1, 2, 6])).toBe("Mon, Tue, Sat");
    expect(formatDays([1, 2, 3, 4, 5, 6, 7])).toBe("Every day");
    expect(progressPct(c.progress)).toBe(25);
    expect(progressPct({ ...c.progress, total: 0 })).toBe(0);
  });
});
