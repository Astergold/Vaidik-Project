import { z } from "zod";
import { role } from "./enums.js";

/** GET /api/me — who am I, in which tenant, with which role. */
export const meResponse = z.object({
  user: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
  tenant: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    timezone: z.string(),
    status: z.enum(["active", "suspended"]),
  }),
  role,
  isPlatformAdmin: z.boolean(),
  /** Set when a super-admin is impersonating this user (Day 6). */
  impersonatedBy: z.uuid().nullable(),
});
export type MeResponse = z.infer<typeof meResponse>;
