import { z } from "zod";
import { isoDateTime } from "./common.js";
import { coreStage, temperature } from "./enums.js";

/** GET /api/dashboard. Dates are LOCAL dates in the tenant's timezone; default = last 30 days. */
export const dashboardQuery = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  agentId: z.uuid().optional(),
  sourceId: z.uuid().optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuery>;

export const dashboardResponse = z.object({
  range: z.object({ from: z.iso.date(), to: z.iso.date(), timezone: z.string() }),
  totals: z.object({ leads: z.number().int() }),
  /** Leads created in range, by CURRENT stage, in pipeline order (all stages present, zeros included). */
  funnel: z.array(z.object({ stage: coreStage, count: z.number().int() })),
  temperature: z.array(
    z.object({ value: temperature.or(z.literal("unrated")), count: z.number().int() }),
  ),
  calls: z.object({
    /** Calls placed since local midnight (not affected by the date range). */
    today: z.number().int(),
    /** Calls placed in range (excludes reserved / still dialling). */
    inRange: z.number().int(),
    /** Completed with talk time of at least 15 s. */
    connected: z.number().int(),
    connectRate: z.number().min(0).max(1).nullable(),
    avgDurationS: z.number().nullable(),
  }),
  bySource: z.array(
    z.object({
      sourceId: z.uuid().nullable(),
      name: z.string(),
      leads: z.number().int(),
      hot: z.number().int(),
      applied: z.number().int(),
    }),
  ),
  byAgent: z.array(
    z.object({
      agentId: z.uuid().nullable(),
      name: z.string(),
      leads: z.number().int(),
      calls: z.number().int(),
      connected: z.number().int(),
      avgDurationS: z.number().nullable(),
    }),
  ),
  generatedAt: isoDateTime,
});
export type DashboardResponse = z.infer<typeof dashboardResponse>;
