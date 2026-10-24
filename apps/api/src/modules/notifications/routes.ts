/** Notifications routes — tenant-scoped (D6-I4-04a). */
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { apiError, notificationsResponse, notification, readAllResponse } from "@vernacular/contracts";
import { tenantCtx } from "../../context.js";

export const notificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/api/notifications",
    {
      schema: {
        tags: ["notifications"],
        summary: "List notifications",
        querystring: z.object({
          unread: z.enum(["true", "false"]).optional(),
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().optional(),
        }),
        response: { 200: notificationsResponse, 401: apiError },
      },
    },
    async (req) => {
      tenantCtx(req); // enforces the session (401 otherwise); notifications are stubbed until D6 lands
      return {
        items: [],
        unreadCount: 0,
        nextCursor: null,
      };
    },
  );

  app.post(
    "/api/notifications/:id/read",
    {
      schema: {
        tags: ["notifications"],
        summary: "Mark notification read",
        params: z.object({ id: z.string() }),
        response: { 200: notification, 401: apiError, 404: apiError },
      },
    },
    async () => {
      return { id: "00000000-0000-0000-0000-000000000000", kind: "review_call", title: "", body: null, link: null, createdAt: new Date().toISOString(), readAt: new Date().toISOString() };
    },
  );

  app.post(
    "/api/notifications/read-all",
    {
      schema: {
        tags: ["notifications"],
        summary: "Mark all notifications read",
        response: { 200: readAllResponse, 401: apiError },
      },
    },
    async () => {
      const result: { unreadCount: 0 } = { unreadCount: 0 };
      return result;
    },
  );
};
