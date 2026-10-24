import { createFileRoute } from "@tanstack/react-router";
import { MatrixPage } from "@/features/programs/MatrixPage";

export const Route = createFileRoute("/programs/matrix")({
  component: MatrixPage,
});
