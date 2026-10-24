import { createFileRoute } from "@tanstack/react-router";
import { CallsPage } from "@/features/calls/CallsPage";

export const Route = createFileRoute("/calls/")({
  component: CallsPage,
});
