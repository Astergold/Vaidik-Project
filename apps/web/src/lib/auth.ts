import {
  acceptInvitationBody,
  changePasswordBody,
  newPassword,
  requestPasswordResetBody,
  resetPasswordBody,
  signInEmailBody,
  signInSocialBody,
  signInSocialResponse,
  updateUserBody,
  type ChangePasswordBody,
  type SignInEmailBody,
} from "@vernacular/contracts";
import { z } from "zod";
import { ApiCallError, apiPost } from "@/lib/api";

/** Better Auth calls (D2-I4-02). All go through `apiPost`; bodies are validated against contracts. */
const ok = z.unknown();

export const signInWithEmail = (body: SignInEmailBody) =>
  apiPost("/api/auth/sign-in/email", signInEmailBody.parse(body), ok);

/** Returns Google's consent URL; the caller sends the browser there. */
export const startGoogleSignIn = async (redirect: string) => {
  const body = signInSocialBody.parse({
    provider: "google",
    callbackURL: redirect,
    errorCallbackURL: "/login?error=google",
  });
  return (await apiPost("/api/auth/sign-in/social", body, signInSocialResponse)).url;
};

export const requestPasswordReset = (email: string) =>
  apiPost(
    "/api/auth/request-password-reset",
    requestPasswordResetBody.parse({ email, redirectTo: "/reset-password" }),
    ok,
  );

export const resetPassword = (token: string, password: string) =>
  apiPost(
    "/api/auth/reset-password",
    resetPasswordBody.parse({ token, newPassword: password }),
    ok,
  );

export const acceptInvitation = (invitationId: string) =>
  apiPost(
    "/api/auth/organization/accept-invitation",
    acceptInvitationBody.parse({ invitationId }),
    ok,
  );

export const signOut = () => apiPost("/api/auth/sign-out", {}, ok);

/* ---- form schemas (what the user types; mapped to the bodies above) ---- */

export const loginForm = signInEmailBody;
export const forgotPasswordForm = requestPasswordResetBody.pick({ email: true });
export const resetPasswordForm = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

/** Profile (D6-I4-02): the signed-in user changes their own name. */
export const updateOwnName = (name: string) =>
  apiPost("/api/auth/update-user", updateUserBody.parse({ name }), ok);

export const changePassword = (body: ChangePasswordBody) =>
  apiPost("/api/auth/change-password", changePasswordBody.parse(body), ok);

export function changePasswordErrorMessage(err: unknown): string {
  if (!(err instanceof ApiCallError)) return "Couldn't change your password. Please try again.";
  if (err.code === "INVALID_PASSWORD" || err.status === 400)
    return "Your current password is wrong.";
  if (err.status === 401) return "Sign in again to change your password.";
  if (err.status === 0) return err.message;
  return err.message || "Couldn't change your password. Please try again.";
}

/* ---- user-facing messages for auth failures (shown inline, not as toasts) ---- */

export function signInErrorMessage(err: unknown): string {
  if (!(err instanceof ApiCallError)) return "Couldn't sign you in. Please try again.";
  if (err.status === 401) return "Wrong email or password.";
  if (err.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (err.status === 0) return err.message;
  if (err.status === 403) return err.message;
  return "Couldn't sign you in. Please try again.";
}

export function googleErrorMessage(err: unknown): string {
  if (err instanceof ApiCallError && (err.status === 404 || err.code === "PROVIDER_NOT_FOUND")) {
    return "Google sign-in isn't set up for this workspace yet. Use your email and password.";
  }
  return signInErrorMessage(err);
}

export type InvitationProblem = "sign-in" | "wrong-account" | "invalid" | "other";

export function invitationProblem(err: unknown): InvitationProblem {
  if (!(err instanceof ApiCallError)) return "other";
  if (err.status === 401) return "sign-in";
  if (err.status === 403) return "wrong-account";
  if (err.status === 400 || err.status === 404) return "invalid";
  return "other";
}
