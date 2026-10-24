/** Campaign routes. Reads: every role. Create / edit / start / pause / resume / stop: owner, admin, admission head. */
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  apiError,
  campaign,
  campaignPlatformOptions,
  campaignsListResponse,
  createCampaignBody,
  patchCampaignBody,
  CAMPAIGN_ACTIONS,
} from "@vernacular/contracts";
import { tenantCtx } from "../../context.js";
import { requireRole } from "../../guards.js";
import { campaignService } from "./service.js";

const MANAGE = requireRole("owner", "admin", "admission_head");
const idParams = z.object({ id: z.uuid() });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const errors = {
  401: apiError,
  403: apiError,
  404: apiError,
  409: apiError,
  422: apiError,
  502: apiError,
  503: apiError,
};

export const campaignsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/api/campaigns",
    {
      schema: {
        tags: ["campaigns"],
        querystring: listQuery,
        response: { 200: campaignsListResponse, ...errors },
      },
    },
    async (req) => {
      const { tx } = tenantCtx(req);
      return {
        items: await campaignService.list(tx, req.query.page, req.query.pageSize),
      };
    },
  );

  /** Live choices for the create form, straight from the calling platform. */
  app.get(
    "/api/campaigns/platform-options",
    {
      preHandler: MANAGE,
      schema: {
        tags: ["campaigns"],
        response: { 200: campaignPlatformOptions, ...errors },
      },
    },
    async (req) => {
      const { auth } = tenantCtx(req);
      const platform = await app.platform(auth.tenantId);
      return campaignService.platformOptions(platform);
    },
  );

  app.post(
    "/api/campaigns",
    {
      preHandler: MANAGE,
      schema: {
        tags: ["campaigns"],
        body: createCampaignBody,
        response: { 201: campaign, ...errors },
      },
    },
    async (req, reply) => {
      const { tx, auth } = tenantCtx(req);
      const platform = await app.platform(auth.tenantId, tx);
      const created = await campaignService.create(tx, auth, req.body, platform);
      return reply.code(201).send(created);
    },
  );

  app.get(
    "/api/campaigns/:id",
    {
      schema: {
        tags: ["campaigns"],
        params: idParams,
        response: { 200: campaign, ...errors },
      },
    },
    async (req) => {
      const { tx } = tenantCtx(req);
      return campaignService.get(tx, req.params.id);
    },
  );

  app.patch(
    "/api/campaigns/:id",
    {
      preHandler: MANAGE,
      schema: {
        tags: ["campaigns"],
        params: idParams,
        body: patchCampaignBody,
        response: { 200: campaign, ...errors },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      const platform = await app.platform(auth.tenantId, tx);
      return campaignService.patch(tx, auth, req.params.id, req.body, platform);
    },
  );

  app.post(
    "/api/campaigns/:id/:action",
    {
      preHandler: MANAGE,
      schema: {
        tags: ["campaigns"],
        params: z.object({ id: z.uuid(), action: z.enum(CAMPAIGN_ACTIONS) }),
        response: { 200: campaign, ...errors },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      return campaignService.act(tx, auth, app.jobs, req.params.id, req.params.action);
    },
  );
};
