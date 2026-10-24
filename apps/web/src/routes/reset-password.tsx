import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { optionalString } from "@/lib/search";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>): { token?: string; error?: string } => ({
    token: optionalString(s.token),
    error: optionalString(s.error),
  }),
  component: function ResetPasswordPage() {
    return <ResetPasswordForm {...Route.useSearch()} />;
  },
});
