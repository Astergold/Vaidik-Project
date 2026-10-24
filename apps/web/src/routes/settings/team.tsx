import { createFileRoute } from "@tanstack/react-router";
import { TeamPage } from "@/features/settings/TeamPage";

export const Route = createFileRoute("/settings/team")({
  component: TeamPage,
});
