import { createFileRoute } from "@tanstack/react-router";
import { CompliancePage } from "@/features/planner/CompliancePage";

export const Route = createFileRoute("/ai/compliance")({
  component: CompliancePage,
});
