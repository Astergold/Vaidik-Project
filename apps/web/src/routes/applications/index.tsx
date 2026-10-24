import { createFileRoute } from "@tanstack/react-router";
import { ApplicationsPage } from "@/features/applications/ApplicationsPage";
import {
  applyApplicationsFilter,
  validateApplicationsSearch,
} from "@/features/applications/applications-search";

export const Route = createFileRoute("/applications/")({
  validateSearch: validateApplicationsSearch,
  component: function ApplicationsRoute() {
    const navigate = Route.useNavigate();
    return (
      <ApplicationsPage
        search={Route.useSearch()}
        onSearch={(p) =>
          void navigate({ search: (prev) => applyApplicationsFilter(prev, p), replace: true })
        }
      />
    );
  },
});
