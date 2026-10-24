import { createFileRoute } from "@tanstack/react-router";
import { HomeRedirect } from "@/components/SystemPages";

export const Route = createFileRoute("/")({
  component: HomeRedirect,
});
