import { createFileRoute } from "@tanstack/react-router";
import { DuplicatesPage } from "@/features/duplicates/DuplicatesPage";

export const Route = createFileRoute("/leads/duplicates")({
  component: DuplicatesPage,
});
