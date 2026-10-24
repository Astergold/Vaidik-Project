/** Campaign jobs: dispatch waves to the calling platform, poll results back, apply pause/resume/stop. */
import { z } from "zod";
import { defineJob, tenantPayload, type JobContext } from "../../jobs/define.js";
import { controlCampaign, dispatch, syncCampaign } from "./engine.js";

/** How often a live campaign is polled. Progress on the campaign page refreshes every 5 s from the CRM DB. */
export const CAMPAIGN_SYNC_SECONDS = 20;

const campaignPayload = tenantPayload.extend({ campaignId: z.uuid() });

/** Re-arms the poll. singletonKey + slot means at most one pending sync per campaign per slot. */
export async function scheduleSync(
  ctx: JobContext,
  campaignId: string,
  delaySeconds = CAMPAIGN_SYNC_SECONDS,
) {
  const at = new Date(Date.now() + delaySeconds * 1000);
  await ctx.withTx((tx) =>
    ctx.jobs.enqueueInTx(
      tx,
      campaignSyncJob,
      { tenantId: ctx.tenantId, campaignId },
      {
        startAfter: at,
        singletonKey: `campaign-sync:${campaignId}`,
        singletonSeconds: delaySeconds,
      },
    ),
  );
}

export const campaignStartJob = defineJob({
  name: "campaign.start",
  schema: campaignPayload,
  queue: {
    retryLimit: 8,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 600,
  },
  async handler(ctx, data) {
    const result = await dispatch(ctx, data.campaignId);
    ctx.log.info({ campaignId: data.campaignId, result }, "campaign.start");
    if (result === "push" || result === "busy") await scheduleSync(ctx, data.campaignId);
  },
});

export const campaignSyncJob = defineJob({
  name: "campaign.sync",
  schema: campaignPayload,
  queue: {
    retryLimit: 10,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 600,
  },
  work: { pollingIntervalSeconds: 2, localConcurrency: 4 },
  async handler(ctx, data) {
    const more = await syncCampaign(ctx, data.campaignId);
    if (more) await scheduleSync(ctx, data.campaignId);
  },
});

export const campaignControlJob = defineJob({
  name: "campaign.control",
  schema: campaignPayload.extend({
    action: z.enum(["pause", "resume", "stop"]),
  }),
  queue: {
    retryLimit: 8,
    retryDelay: 15,
    retryBackoff: true,
    expireInSeconds: 600,
  },
  work: { pollingIntervalSeconds: 1 },
  async handler(ctx, data) {
    await controlCampaign(ctx, data.campaignId, data.action);
    ctx.log.info({ campaignId: data.campaignId, action: data.action }, "campaign.control");
    if (data.action !== "stop") await scheduleSync(ctx, data.campaignId, 5);
  },
});
