import { createFileRoute } from "@tanstack/react-router";
import { CampaignDetailPage } from "@/features/campaigns/CampaignPages";

export const Route = createFileRoute("/campaigns/$campaignId/")({
  component: function CampaignRoute() {
    return <CampaignDetailPage id={Route.useParams().campaignId} />;
  },
});
