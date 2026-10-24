import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiCallError } from "@/lib/api";
import {
  googleErrorMessage,
  invitationProblem,
  loginForm,
  requestPasswordReset,
  resetPasswordForm,
  signInErrorMessage,
  signInWithEmail,
} from "@/lib/auth";
import { apiFieldErrors } from "@/lib/forms";

describe("auth form schemas (D2-I4-02)", () => {
  it("login needs a valid email and a password", () => {
    const r = loginForm.safeParse({ email: "not-an-email", password: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual(["email", "password"]);
    expect(loginForm.safeParse({ email: "c1@mit-adt.local", password: "x" }).success).toBe(true);
  });

  it("new password: at least 10 chars and must match the confirmation", () => {
    expect(resetPasswordForm.safeParse({ password: "short", confirm: "short" }).success).toBe(
      false,
    );
    const mismatch = resetPasswordForm.safeParse({
      password: "long-enough-1",
      confirm: "long-enough-2",
    });
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirm"]);
    expect(
      resetPasswordForm.safeParse({ password: "long-enough-1", confirm: "long-enough-1" }).success,
    ).toBe(true);
  });
});

describe("auth error messages", () => {
  it("never reveals which part of the credentials was wrong", () => {
    expect(
      signInErrorMessage(new ApiCallError(401, "INVALID_EMAIL_OR_PASSWORD", "Invalid email")),
    ).toBe("Wrong email or password.");
    expect(signInErrorMessage(new ApiCallError(429, "TOO_MANY", "x"))).toMatch(/Too many attempts/);
    expect(signInErrorMessage(new Error("x"))).toMatch(/Couldn't sign you in/);
  });

  it("explains when Google isn't configured", () => {
    expect(googleErrorMessage(new ApiCallError(404, "PROVIDER_NOT_FOUND", "x"))).toMatch(
      /isn't set up/,
    );
  });

  it("classifies invitation failures", () => {
    expect(invitationProblem(new ApiCallError(401, "UNAUTHORIZED", "x"))).toBe("sign-in");
    expect(
      invitationProblem(new ApiCallError(403, "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION", "x")),
    ).toBe("wrong-account");
    expect(invitationProblem(new ApiCallError(400, "INVITATION_NOT_FOUND", "x"))).toBe("invalid");
    expect(invitationProblem(new ApiCallError(500, "X", "x"))).toBe("other");
  });

  it("maps 422 details to form fields", () => {
    const err = new ApiCallError(422, "VALIDATION_ERROR", "x", [
      { path: "newPassword", message: "Too short" },
    ]);
    expect(apiFieldErrors(err)).toEqual({ newPassword: "Too short" });
    expect(apiFieldErrors(new ApiCallError(422, "VALIDATION_ERROR", "x", "nope"))).toEqual({});
  });
});

describe("auth requests go to Better Auth through the api client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sign-in posts JSON to /api/auth/sign-in/email", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await signInWithEmail({ email: "c1@mit-adt.local", password: "secret" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/sign-in/email");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      email: "c1@mit-adt.local",
      password: "secret",
    });
  });

  it("password reset asks for the link to land on /reset-password", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await requestPasswordReset("c1@mit-adt.local");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/request-password-reset");
    expect(JSON.parse(String(init.body))).toEqual({
      email: "c1@mit-adt.local",
      redirectTo: "/reset-password",
    });
  });
});
