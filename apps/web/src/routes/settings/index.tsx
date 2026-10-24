import { createFileRoute } from "@tanstack/react-router";
import { GeneralPage } from "@/features/settings/GeneralPage";

export const Route = createFileRoute("/settings/")({
  component: GeneralPage,
});
