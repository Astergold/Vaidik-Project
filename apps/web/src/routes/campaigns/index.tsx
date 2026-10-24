import { createFileRoute } from "@tanstack/react-router";
import { CampaignsPage } from "@/features/campaigns/CampaignPages";

export const Route = createFileRoute("/campaigns/")({
  component: CampaignsPage,
});
