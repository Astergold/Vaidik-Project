import { createFileRoute } from "@tanstack/react-router";
import { UnmatchedPage } from "@/features/applications/UnmatchedPage";

export const Route = createFileRoute("/applications/unmatched")({
  component: UnmatchedPage,
});
