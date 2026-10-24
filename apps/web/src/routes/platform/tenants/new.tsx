import { createFileRoute } from "@tanstack/react-router";
import { NewTenantWizard } from "@/features/platform/NewTenantWizard";

export const Route = createFileRoute("/platform/tenants/new")({
  component: NewTenantWizard,
});
