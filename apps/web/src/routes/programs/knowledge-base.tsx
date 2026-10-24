import { createFileRoute } from "@tanstack/react-router";
import { KbPage } from "@/features/programs/KbPage";

export const Route = createFileRoute("/programs/knowledge-base")({
  component: KbPage,
});
