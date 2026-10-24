import { createFileRoute } from "@tanstack/react-router";
import { SourcesPage } from "@/features/lead-sources/SourcesPage";

export const Route = createFileRoute("/settings/lead-sources/")({
  component: SourcesPage,
});
