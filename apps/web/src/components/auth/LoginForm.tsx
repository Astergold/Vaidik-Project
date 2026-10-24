import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AuthHeader, Field, FormAlert, SubmitButton } from "@/components/auth/AuthParts";
import {
  googleErrorMessage,
  loginForm,
  signInErrorMessage,
  signInWithEmail,
  startGoogleSignIn,
} from "@/lib/auth";
import { useBranding } from "@/lib/branding";
import { safeRedirect } from "@/lib/errors";
import { parseForm, type FieldErrors } from "@/lib/forms";

export function LoginForm({ redirect, error }: { redirect?: string; error?: string }) {
  const { productName } = useBranding();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const target = safeRedirect(redirect);

  const signIn = useMutation({
    mutationFn: signInWithEmail,
    meta: { silent: true },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["me"] });
      await navigate({ href: target, replace: true });
    },
  });
  const google = useMutation({
    mutationFn: () => startGoogleSignIn(target),
    meta: { silent: true },
    onSuccess: (url) => window.location.assign(url),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = parseForm(loginForm, e.currentTarget);
    setFieldErrors(parsed.ok ? {} : parsed.errors);
    if (parsed.ok) signIn.mutate(parsed.data);
  };

  const problem = signIn.isError
    ? signInErrorMessage(signIn.error)
    : google.isError
      ? googleErrorMessage(google.error)
      : error
        ? "Google sign-in didn't work. Use the Google account your invitation was sent to."
        : null;

  return (
    <div>
      <AuthHeader title="Sign in">to {productName}</AuthHeader>
      <form method="post" noValidate onSubmit={onSubmit} className="space-y-4">
        {problem && <FormAlert>{problem}</FormAlert>}
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          error={fieldErrors.email}
        />
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={fieldErrors.password}
        />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <SubmitButton pending={signIn.isPending}>Sign in</SubmitButton>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        variant="outline"
        className="w-full"
        disabled={signIn.isPending || google.isPending}
        onClick={() => google.mutate()}
      >
        Continue with Google
      </Button>
    </div>
  );
}
