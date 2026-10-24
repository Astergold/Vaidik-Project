import { createFileRoute } from "@tanstack/react-router";
import { LoginForm } from "@/components/auth/LoginForm";
import { optionalString } from "@/lib/search";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string; error?: string } => ({
    redirect: optionalString(s.redirect),
    error: optionalString(s.error),
  }),
  component: function LoginPage() {
    return <LoginForm {...Route.useSearch()} />;
  },
});
