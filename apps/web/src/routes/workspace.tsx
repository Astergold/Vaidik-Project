import { createFileRoute } from "@tanstack/react-router";
import { validateWorkspaceSearch, WorkspacePage } from "@/features/workspace/WorkspacePage";

export const Route = createFileRoute("/workspace")({
  validateSearch: validateWorkspaceSearch,
  component: function WorkspaceRoute() {
    return <WorkspacePage tab={Route.useSearch().tab} />;
  },
});
