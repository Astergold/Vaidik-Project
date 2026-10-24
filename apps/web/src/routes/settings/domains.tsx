import { createFileRoute } from "@tanstack/react-router";
import { DomainsPage } from "@/features/settings/DomainsPage";

export const Route = createFileRoute("/settings/domains")({
  component: DomainsPage,
});
