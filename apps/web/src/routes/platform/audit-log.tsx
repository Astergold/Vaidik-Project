import { createFileRoute } from "@tanstack/react-router";
import { AuditLogPage } from "@/features/platform/AuditLogPage";

export const Route = createFileRoute("/platform/audit-log")({
  component: AuditLogPage,
});
