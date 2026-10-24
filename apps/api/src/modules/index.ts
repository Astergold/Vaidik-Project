import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { dashboardRoutes } from "./dashboard/routes.js";
import { sourcesRoutes } from "./intake/sources.routes.js";
import { leadsRoutes } from "./leads/routes.js";
import { meRoutes } from "./me/routes.js";
import { policyRoutes } from "./policy/routes.js";
import { notificationsRoutes } from "./notifications/routes.js";
import { duplicatesRoutes } from "./duplicates/routes.js";
import { campaignsRoutes } from "./campaigns/routes.js";
import { leadsImportsRoutes } from "./leads/imports/routes.js";

/**
 * TENANT routes. Everything listed here runs inside the tenant scope: 401 without a session,
 * RLS-scoped transaction in request.tx, commit/rollback handled for you.
 * To add an endpoint: create modules/<feature>/routes.ts and add ONE line below.
 */
export const tenantModules: FastifyPluginAsyncZod[] = [
  meRoutes,
  leadsRoutes,
  dashboardRoutes,
  policyRoutes,
  sourcesRoutes,
  notificationsRoutes,
  duplicatesRoutes,
  campaignsRoutes,
  leadsImportsRoutes,
];
