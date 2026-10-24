import { createFileRoute } from "@tanstack/react-router";
import { CallsReviewPage } from "@/features/review/CallsReviewPage";

export const Route = createFileRoute("/calls/review")({
  component: CallsReviewPage,
});
