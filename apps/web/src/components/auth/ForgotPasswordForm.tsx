import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AuthHeader, Field, FormAlert, SubmitButton } from "@/components/auth/AuthParts";
import { ApiCallError } from "@/lib/api";
import { forgotPasswordForm, requestPasswordReset } from "@/lib/auth";
import { parseForm, type FieldErrors } from "@/lib/forms";

export function ForgotPasswordForm() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const request = useMutation({ mutationFn: requestPasswordReset, meta: { silent: true } });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = parseForm(forgotPasswordForm, e.currentTarget);
    setFieldErrors(parsed.ok ? {} : parsed.errors);
    if (parsed.ok) request.mutate(parsed.data.email);
  };

  if (request.isSuccess) {
    return (
      <div className="text-center">
        <AuthHeader title="Check your email">
          If an account exists for {request.variables}, we&apos;ve sent a link to reset your
          password. It expires in an hour.
        </AuthHeader>
        <BackToSignIn />
      </div>
    );
  }

  return (
    <div>
      <AuthHeader title="Forgot password">
        Enter your email and we&apos;ll send you a reset link.
      </AuthHeader>
      <form method="post" noValidate onSubmit={onSubmit} className="space-y-4">
        {request.isError && <FormAlert>{forgotErrorMessage(request.error)}</FormAlert>}
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          error={fieldErrors.email}
        />
        <SubmitButton pending={request.isPending}>Send reset link</SubmitButton>
      </form>
      <BackToSignIn />
    </div>
  );
}

function forgotErrorMessage(err: unknown): string {
  if (err instanceof ApiCallError && err.status === 429) {
    return "Too many requests. Wait a minute and try again.";
  }
  if (err instanceof ApiCallError && err.status === 0) return err.message;
  return "Couldn't send the link. Please try again.";
}

export function BackToSignIn() {
  return (
    <p className="mt-4 text-center text-sm">
      <Link to="/login" className="font-medium text-primary hover:underline">
        Back to sign in
      </Link>
    </p>
  );
}
