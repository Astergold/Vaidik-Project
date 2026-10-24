import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage, validateCalendarSearch } from "@/features/visits/VisitPages";

export const Route = createFileRoute("/calendar")({
  validateSearch: validateCalendarSearch,
  component: function CalendarRoute() {
    const navigate = Route.useNavigate();
    return (
      <CalendarPage
        search={Route.useSearch()}
        onSearch={(p) => void navigate({ search: (prev) => ({ ...prev, ...p }), replace: true })}
      />
    );
  },
});
