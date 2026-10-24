import { createFileRoute } from "@tanstack/react-router";
import { EditCampaignPage } from "@/features/campaigns/CampaignPages";

export const Route = createFileRoute("/campaigns/$campaignId/edit")({
  component: function EditCampaignRoute() {
    return <EditCampaignPage id={Route.useParams().campaignId} />;
  },
});
