import { createFileRoute } from "@tanstack/react-router";
import { EmailPage } from "@/features/settings/EmailPage";

export const Route = createFileRoute("/settings/email")({
  component: EmailPage,
});
