import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  addNoteBody,
  apiError,
  callNowResponse,
  leadDetail,
  leadsFiltersResponse,
  leadsListQuery,
  leadsListResponse,
  patchLeadBody,
  timelineQuery,
  timelineResponse,
} from "@vernacular/contracts";
import { tenantCtx } from "../../context.js";
import { addNote, callNow, patchLead } from "./actions.js";
import { getLeadDetail, getTimeline } from "./detail.js";
import { getLeadFilters, listLeads } from "./service.js";

const idParam = z.object({ id: z.uuid() });

export const leadsRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ["leads"];

  app.get(
    "/api/leads",
    {
      schema: {
        tags,
        summary: "List leads (person-centric, paginated, filterable)",
        querystring: leadsListQuery,
        response: { 200: leadsListResponse, 401: apiError },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      return listLeads(tx, auth, req.query);
    },
  );

  // Static path: find-my-way matches it before /api/leads/:id (tested in leads-filters.test.ts).
  app.get(
    "/api/leads/filters",
    {
      schema: {
        tags,
        summary: "Options for the Leads list filters (sources, AI agents, counsellors)",
        response: { 200: leadsFiltersResponse, 401: apiError },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      return getLeadFilters(tx, auth);
    },
  );

  app.get(
    "/api/leads/:id",
    {
      schema: {
        tags,
        summary: "Lead 360 header",
        params: idParam,
        response: { 200: leadDetail, 403: apiError, 404: apiError },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      return getLeadDetail(tx, auth, req.params.id);
    },
  );

  app.get(
    "/api/leads/:id/timeline",
    {
      schema: {
        tags,
        summary: "Merged timeline (calls, stage changes, notes, temperature)",
        params: idParam,
        querystring: timelineQuery,
        response: { 200: timelineResponse, 403: apiError, 404: apiError, 422: apiError },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      return getTimeline(tx, auth, req.params.id, req.query);
    },
  );

  app.patch(
    "/api/leads/:id",
    {
      schema: {
        tags,
        summary: "Change stage / sub-stage / next step / owner",
        params: idParam,
        body: patchLeadBody,
        response: { 200: leadDetail, 403: apiError, 404: apiError, 422: apiError },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      await patchLead(tx, auth, req.params.id, req.body, req.ip);
      return getLeadDetail(tx, auth, req.params.id);
    },
  );

  app.post(
    "/api/leads/:id/notes",
    {
      schema: {
        tags,
        summary: "Add a note or outcome to the timeline",
        params: idParam,
        body: addNoteBody,
        response: { 201: z.object({ id: z.uuid() }), 403: apiError, 404: apiError },
      },
    },
    async (req, reply) => {
      const { tx, auth } = tenantCtx(req);
      return reply
        .status(201)
        .send(await addNote(tx, auth, req.params.id, req.body.body, req.body.kind));
    },
  );

  app.post(
    "/api/leads/:id/call-now",
    {
      schema: {
        tags,
        summary:
          "Call this lead now (policy-checked; a blocked call is reported in the body, not as an error)",
        params: idParam,
        response: { 200: callNowResponse, 403: apiError, 404: apiError, 409: apiError },
      },
    },
    async (req) => {
      const { tx, auth } = tenantCtx(req);
      return callNow(tx, auth, app.jobs, req.params.id);
    },
  );
};
