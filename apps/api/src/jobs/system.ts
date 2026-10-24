import { defineJob, tenantPayload } from "./define.js";

/** Liveness probe for the queue itself: enqueue it, see it logged by the worker. Ops/monitoring use it. */
export const systemPing = defineJob({
  name: "system.ping",
  schema: tenantPayload,
  async handler(ctx) {
    ctx.log.info({ tenantId: ctx.tenantId, jobId: ctx.jobId }, "system.ping processed");
  },
});
