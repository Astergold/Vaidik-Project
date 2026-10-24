import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage } from "@/features/integrations/IntegrationsPage";

export const Route = createFileRoute("/settings/integrations")({
  component: IntegrationsPage,
});
