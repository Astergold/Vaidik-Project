import { createFileRoute } from "@tanstack/react-router";
import { HealthPage } from "@/features/platform/HealthPage";

export const Route = createFileRoute("/platform/health")({
  component: HealthPage,
});
