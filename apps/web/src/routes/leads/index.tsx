import { createFileRoute } from "@tanstack/react-router";
import { LeadsPage } from "@/features/leads/LeadsPage";
import { validateLeadsSearch } from "@/features/leads/leads-search";

export const Route = createFileRoute("/leads/")({
  validateSearch: validateLeadsSearch,
  component: LeadsPage,
});
