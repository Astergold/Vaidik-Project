import { createFileRoute } from "@tanstack/react-router";
import { validateVisitsSearch, VisitsPage } from "@/features/visits/VisitPages";

export const Route = createFileRoute("/visits")({
  validateSearch: validateVisitsSearch,
  component: function VisitsRoute() {
    const navigate = Route.useNavigate();
    return (
      <VisitsPage
        search={Route.useSearch()}
        onSearch={(p) => void navigate({ search: (prev) => ({ ...prev, ...p }), replace: true })}
      />
    );
  },
});
