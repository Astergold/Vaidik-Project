import { createFileRoute } from "@tanstack/react-router";
import { AgentsPage } from "@/features/agents/AgentsPage";

export const Route = createFileRoute("/ai/agents")({
  component: AgentsPage,
});
