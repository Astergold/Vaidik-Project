import { createFileRoute } from "@tanstack/react-router";
import { LlmPage } from "@/features/settings/LlmPage";

export const Route = createFileRoute("/settings/llm")({
  component: LlmPage,
});
