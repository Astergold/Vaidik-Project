import { createFileRoute } from "@tanstack/react-router";
import { PlansPage } from "@/features/platform/PlansPage";

export const Route = createFileRoute("/platform/plans")({
  component: PlansPage,
});
