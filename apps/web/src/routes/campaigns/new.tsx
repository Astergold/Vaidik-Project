import { createFileRoute } from "@tanstack/react-router";
import { NewCampaignPage } from "@/features/campaigns/CampaignPages";

export const Route = createFileRoute("/campaigns/new")({
  component: NewCampaignPage,
});
