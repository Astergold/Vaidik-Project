import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { campaign, type Campaign } from "@vernacular/contracts";
import {
  CampaignDetailView,
  CampaignsListView,
  CampaignUnavailable,
  ConfirmPanel,
} from "@/features/campaigns/CampaignViews";

/** Server-rendered campaign views (no DOM deps). Links need a router context, so a tiny memory router is provided. */
const router = createRouter({
  routeTree: createRootRoute(),
  history: createMemoryHistory(),
});
const html = (el: React.ReactElement) =>
  renderToStaticMarkup(<RouterContextProvider router={router}>{el}</RouterContextProvider>);
const noop = () => {};

// Test fixture validated against the proposed contract (the app never fabricates campaigns).
const make = (over: Partial<Campaign> = {}): Campaign =>
  campaign.parse({
    id: "01a14679-0000-7000-8000-0000000000c1",
    name: "Interested leads, October",
    status: "running",
    workflow: { id: 2, name: "Admissions outreach" },
    telephonyConfigId: 1,
    aiAgent: {
      id: "01a14679-1d0e-7a18-bf77-11f3cd23feba",
      displayName: "Asha (English)",
    },
    leadFilter: { stage: ["interested"], temperature: ["hot"] },
    scheduleEnabled: true,
    schedule: {
      days: [1, 2, 3, 4, 5],
      windowStart: "10:00",
      windowEnd: "18:00",
    },
    maxConcurrent: 5,
    batchSize: 100,
    retry: {
      enabled: true,
      maxRetries: 1,
      retryDelaySeconds: 120,
      onBusy: true,
      onNoAnswer: true,
      onVoicemail: false,
    },
    circuitBreaker: {
      enabled: true,
      failureThresholdPct: 50,
      windowSeconds: 120,
      minCallsInWindow: 5,
    },
    progress: {
      total: 400,
      dialed: 100,
      connected: 40,
      failed: 10,
      pending: 300,
      skipped: 0,
    },
    waves: [],
    lastError: null,
    lastSyncedAt: null,
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
    ...over,
  });
const detail = (c: Campaign, extra: Partial<Parameters<typeof CampaignDetailView>[0]> = {}) =>
  html(
    <CampaignDetailView
      campaign={c}
      tz="Asia/Kolkata"
      confirm={null}
      pendingAction={null}
      actionError={null}
      onAsk={noop}
      onAction={noop}
      onCancelConfirm={noop}
      {...extra}
    />,
  );

describe("campaigns list (D3-I4-04)", () => {
  it("empty → explains and offers New campaign", () => {
    const h = html(
      <CampaignsListView state={{ kind: "ready", data: [] }} unavailable={false} canCreate />,
    );
    expect(h).toContain("No campaigns yet");
    expect(h).toContain("New campaign");
  });
  it("loading and error", () => {
    expect(
      html(<CampaignsListView state={{ kind: "loading" }} unavailable={false} canCreate />),
    ).toContain("Loading campaigns");
    expect(
      html(
        <CampaignsListView
          state={{ kind: "error", message: "x", retry: noop }}
          unavailable={false}
          canCreate
        />,
      ),
    ).toContain("Couldn&#x27;t load campaigns");
  });
  it("rows show status and progress", () => {
    const h = html(
      <CampaignsListView state={{ kind: "ready", data: [make()] }} unavailable={false} canCreate />,
    );
    expect(h).toContain("Interested leads, October");
    expect(h).toContain("Running");
    expect(h).toContain("100 / 400 dialled");
    expect(h).toContain('aria-valuenow="25"');
  });
  it("API missing → 'not available yet', nothing listed", () => {
    const h = html(<CampaignsListView state={{ kind: "loading" }} unavailable canCreate />);
    expect(h).toContain("Campaign service not available yet");
    expect(h).not.toContain("aria-busy");
  });
});

describe("campaign detail", () => {
  it("progress counts and schedule in the tenant timezone", () => {
    const h = detail(make());
    for (const s of [
      "400",
      "100",
      "40",
      "10",
      "300",
      "Mon–Fri, 10:00–18:00 (Asia/Kolkata)",
      "Updates every few seconds",
    ])
      expect(h).toContain(s);
    expect(h).toContain("Stage: Interested · Temperature: Hot");
  });
  it("running shows Pause + Stop, draft shows Start + Edit, stopped shows nothing", () => {
    const running = detail(make());
    expect(running).toContain("Pause");
    expect(running).toContain("Stop");
    expect(running).not.toContain(">Start<");
    const draft = detail(make({ status: "draft" }));
    expect(draft).toMatch(/Start/);
    expect(draft).toContain("Edit");
    expect(draft).not.toContain("Pause");
    const stopped = detail(make({ status: "stopped" }));
    expect(stopped).not.toMatch(/Pause|Stop<|Start|Edit/);
  });
  it("paused offers Resume", () => {
    expect(detail(make({ status: "paused" }))).toContain("Resume");
  });
  it("shows the waves and the last calling-platform problem", () => {
    const h = detail(
      make({
        lastError: "The calling platform is temporarily unavailable",
        waves: [
          {
            waveNo: 1,
            state: "completed",
            totalRows: 100,
            processedRows: 100,
            failedRows: 3,
            startedAt: null,
            completedAt: null,
          },
          {
            waveNo: 2,
            state: "running",
            totalRows: 100,
            processedRows: 20,
            failedRows: 0,
            startedAt: null,
            completedAt: null,
          },
        ],
      }),
    );
    expect(h).toContain("Waves");
    expect(h).toContain("Done");
    expect(h).toContain("Calling");
    expect(h).toContain("The calling platform is temporarily unavailable");
    expect(h.toLowerCase()).not.toMatch(/dograh|godrah/);
  });
  it("an action error is shown on the page", () => {
    expect(detail(make(), { actionError: "Invalid transition" })).toContain("Invalid transition");
  });
});

describe("confirmation before start and stop", () => {
  it("start explains what will happen, incl. the policy still applying", () => {
    const h = html(
      <ConfirmPanel
        kind="start"
        campaign={make({ status: "draft" })}
        tz="Asia/Kolkata"
        pending={false}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(h).toContain('role="alertdialog"');
    expect(h).toContain("Start calling?");
    expect(h).toContain("Admissions outreach");
    expect(h).toContain("waves of 100");
    expect(h).toContain("5 calls at a time");
    expect(h).toContain("Do-Not-Call");
    expect(h).toContain("Cancel");
  });
  it("stop warns it can't be restarted", () => {
    const h = html(
      <ConfirmPanel
        kind="stop"
        campaign={make()}
        tz="Asia/Kolkata"
        pending={false}
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(h).toContain("Stop this campaign?");
    expect(h).toContain("can&#x27;t be restarted");
  });
  it("detail renders the panel when asked", () => {
    expect(detail(make(), { confirm: "stop" })).toContain("Stop this campaign?");
  });
});

describe("not available", () => {
  it("says nothing was saved or dialled", () => {
    const h = html(<CampaignUnavailable />);
    expect(h).toContain("Campaign service not available yet");
    expect(h).toContain("no calls were placed");
  });
});
