import { createFileRoute } from "@tanstack/react-router";
import { ImportWizard } from "@/features/lead-sources/import/ImportWizard";

export const Route = createFileRoute("/settings/lead-sources/import")({
  component: ImportWizard,
});
