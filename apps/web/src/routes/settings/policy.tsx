import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/features/settings/policy/PolicyPage";

export const Route = createFileRoute("/settings/policy")({
  component: PolicyPage,
});
