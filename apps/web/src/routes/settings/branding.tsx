import { createFileRoute } from "@tanstack/react-router";
import { BrandingPage } from "@/features/settings/BrandingPage";

export const Route = createFileRoute("/settings/branding")({
  component: BrandingPage,
});
