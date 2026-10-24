import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/features/settings/PrivacyPage";

export const Route = createFileRoute("/settings/privacy")({
  component: PrivacyPage,
});
