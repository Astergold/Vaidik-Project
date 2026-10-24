import { createFileRoute } from "@tanstack/react-router";
import { WhatsAppSettingsPage } from "@/features/whatsapp/WhatsAppSettingsPage";

export const Route = createFileRoute("/settings/whatsapp")({
  component: WhatsAppSettingsPage,
});
