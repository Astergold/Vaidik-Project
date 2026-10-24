import { createFileRoute } from "@tanstack/react-router";
import { ExportsPage } from "@/features/reports/ExportsPage";

export const Route = createFileRoute("/reports/exports")({
  component: ExportsPage,
});
