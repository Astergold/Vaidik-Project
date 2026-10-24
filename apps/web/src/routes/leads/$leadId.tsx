import { createFileRoute } from "@tanstack/react-router";
import { Lead360Page } from "@/features/lead360/Lead360Page";

export const Route = createFileRoute("/leads/$leadId")({
  component: function LeadRoute() {
    return <Lead360Page leadId={Route.useParams().leadId} />;
  },
});
