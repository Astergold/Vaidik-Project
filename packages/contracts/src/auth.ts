import { z } from "zod";

/**
 * Wire shapes of the Better Auth endpoints the UI calls (mounted by the api at /api/auth/*).
 * Better Auth owns the handlers; these document and validate what we send (D2-I4-02).
 */

/** Same rule as the api's `emailAndPassword.minPasswordLength`. */
export const PASSWORD_MIN_LENGTH = 10;
export const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128, "Use at most 128 characters");

/** POST /api/auth/sign-in/email → sets the httpOnly session cookie. 401 INVALID_EMAIL_OR_PASSWORD. */
export const signInEmailBody = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
export type SignInEmailBody = z.infer<typeof signInEmailBody>;

/** POST /api/auth/sign-in/social → `{ url }` to send the browser to. 404 when Google isn't configured. */
export const signInSocialBody = z.object({
  provider: z.literal("google"),
  callbackURL: z.string(),
  errorCallbackURL: z.string(),
});
export const signInSocialResponse = z.object({ url: z.url() });

/** POST /api/auth/request-password-reset — always 200 (never reveals whether the email exists). */
export const requestPasswordResetBody = z.object({
  email: z.email("Enter a valid email address"),
  /** The emailed link lands on `${redirectTo}?token=…` (or `?error=INVALID_TOKEN`). */
  redirectTo: z.string(),
});

/** POST /api/auth/reset-password. 400 INVALID_TOKEN when the link is used or expired. */
export const resetPasswordBody = z.object({ newPassword, token: z.string().min(1) });

/** POST /api/auth/organization/accept-invitation — needs a signed-in user with the invited email. */
export const acceptInvitationBody = z.object({ invitationId: z.string().min(1) });

/** POST /api/auth/update-user — change the signed-in user's own display name (D6-I4-02 profile). */
export const updateUserBody = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
});

/** POST /api/auth/change-password. 400 INVALID_PASSWORD when the current password is wrong. */
export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword,
  /** Sign out other browsers/devices. */
  revokeOtherSessions: z.boolean(),
});
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;
