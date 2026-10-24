import { createFileRoute } from "@tanstack/react-router";
import { PerformancePage } from "@/features/reports/PerformancePage";

export const Route = createFileRoute("/reports/performance")({
  component: PerformancePage,
});
