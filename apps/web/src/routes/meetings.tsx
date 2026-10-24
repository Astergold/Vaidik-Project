import { createFileRoute } from "@tanstack/react-router";
import { MeetingsPage, validateMeetingsSearch } from "@/features/visits/VisitPages";

export const Route = createFileRoute("/meetings")({
  validateSearch: validateMeetingsSearch,
  component: function MeetingsRoute() {
    const navigate = Route.useNavigate();
    return (
      <MeetingsPage
        search={Route.useSearch()}
        onSearch={(p) => void navigate({ search: (prev) => ({ ...prev, ...p }), replace: true })}
      />
    );
  },
});
