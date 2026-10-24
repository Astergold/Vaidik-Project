import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PASSWORD_MIN_LENGTH } from "@vernacular/contracts";
import { AuthHeader, Field, FormAlert, SubmitButton } from "@/components/auth/AuthParts";
import { BackToSignIn } from "@/components/auth/ForgotPasswordForm";
import { Button } from "@/components/ui/button";
import { ApiCallError } from "@/lib/api";
import { resetPassword, resetPasswordForm } from "@/lib/auth";
import { apiFieldErrors, parseForm, type FieldErrors } from "@/lib/forms";

/** Lands from the emailed link as `/reset-password?token=…` (or `?error=INVALID_TOKEN`). */
export function ResetPasswordForm({ token, error }: { token?: string; error?: string }) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const reset = useMutation({
    mutationFn: (password: string) => resetPassword(token ?? "", password),
    meta: { silent: true },
    onError: (err) => setFieldErrors(renameKeys(apiFieldErrors(err))),
  });

  const tokenRejected = reset.error instanceof ApiCallError && reset.error.code === "INVALID_TOKEN";
  if (!token || error || tokenRejected) {
    return (
      <div className="space-y-4 text-center">
        <AuthHeader title="This link has expired">
          Reset links work once and expire after an hour. Ask for a new one.
        </AuthHeader>
        <Button asChild className="w-full">
          <Link to="/forgot-password">Send a new link</Link>
        </Button>
        <BackToSignIn />
      </div>
    );
  }

  if (reset.isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <AuthHeader title="Password updated">
          You can now sign in with your new password.
        </AuthHeader>
        <Button asChild className="w-full">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = parseForm(resetPasswordForm, e.currentTarget);
    setFieldErrors(parsed.ok ? {} : parsed.errors);
    if (parsed.ok) reset.mutate(parsed.data.password);
  };

  return (
    <div>
      <AuthHeader title="Choose a new password" />
      <form method="post" noValidate onSubmit={onSubmit} className="space-y-4">
        {reset.isError && Object.keys(fieldErrors).length === 0 && (
          <FormAlert>Couldn&apos;t update your password. Please try again.</FormAlert>
        )}
        <Field
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={fieldErrors.password}
        />
        <Field
          name="confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={fieldErrors.confirm}
        />
        <SubmitButton pending={reset.isPending}>Update password</SubmitButton>
      </form>
    </div>
  );
}

/** The API names the field `newPassword`; the form calls it `password`. */
const renameKeys = (e: FieldErrors): FieldErrors =>
  Object.fromEntries(Object.entries(e).map(([k, v]) => [k === "newPassword" ? "password" : k, v]));
