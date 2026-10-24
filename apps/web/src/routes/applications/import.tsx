import { createFileRoute } from "@tanstack/react-router";
import { ApplicationsImport } from "@/features/applications/import/ApplicationsImport";

export const Route = createFileRoute("/applications/import")({
  component: ApplicationsImport,
});
