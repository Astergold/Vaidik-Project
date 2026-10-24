import { createFileRoute } from "@tanstack/react-router";
import { AcceptInvitation } from "@/components/auth/AcceptInvitation";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: function AcceptInvitationPage() {
    return <AcceptInvitation invitationId={Route.useParams().invitationId} />;
  },
});
