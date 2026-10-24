import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { validateDashboardSearch } from "@/features/dashboard/dashboard-search";

export const Route = createFileRoute("/dashboard")({
  validateSearch: validateDashboardSearch,
  component: DashboardPage,
});
