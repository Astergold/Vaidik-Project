import { z } from "zod";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");
const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

const base = z.object({
  callWindowStart: clock,
  /** Exclusive: with "21:00" the last call can start at 20:59. */
  callWindowEnd: clock,
  /** ISO weekdays, 1 = Monday ... 7 = Sunday */
  allowedDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  maxAttemptsPerDay: z.number().int().min(1).max(20),
  maxAttemptsTotal: z.number().int().min(1).max(100),
  minGapMinutes: z.number().int().min(0).max(1440),
  requireConsent: z.boolean(),
  ndncCheck: z.boolean(),
  promoRequires140: z.boolean(),
  aiDisclosureText: z.string().trim().max(2000).nullable(),
});

/** GET /api/settings/policy response */
export const policySettings = base;
export type PolicySettings = z.infer<typeof policySettings>;

/** PUT /api/settings/policy body (full replace). */
export const policySettingsBody = base
  .refine((v) => minutes(v.callWindowStart) < minutes(v.callWindowEnd), {
    message: "Window start must be before window end",
    path: ["callWindowEnd"],
  })
  .refine((v) => new Set(v.allowedDays).size === v.allowedDays.length, {
    message: "allowedDays must not repeat",
    path: ["allowedDays"],
  })
  .refine((v) => v.maxAttemptsPerDay <= v.maxAttemptsTotal, {
    message: "Per-day cap cannot exceed the total cap",
    path: ["maxAttemptsPerDay"],
  });

export const holiday = z.object({ id: z.uuid(), date: z.iso.date(), name: z.string() });
export const holidaysResponse = z.object({ items: z.array(holiday) });
export const createHolidayBody = z.object({
  date: z.iso.date(),
  name: z.string().trim().min(1).max(100),
});
