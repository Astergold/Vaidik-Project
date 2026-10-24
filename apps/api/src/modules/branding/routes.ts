/** Branding routes — public branding + tenant settings. */
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { apiError, publicBranding } from "@vernacular/contracts";

export const brandingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/api/branding",
    {
      config: { public: true },
      schema: {
        tags: ["branding"],
        summary: "Public branding by host",
        response: { 200: publicBranding, 404: apiError },
      },
    },
    async () => {
      return {
        productName: "Vernacular AI",
        logoUrl: "/logo.svg",
        faviconUrl: null,
        brandColor: "#7d0280",
      };
    },
  );
};
