import { createFileRoute } from "@tanstack/react-router";
import { StagesPage } from "@/features/settings/StagesPage";

export const Route = createFileRoute("/settings/stages")({
  component: StagesPage,
});
