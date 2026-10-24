import { describe, expect, it } from "vitest";

/**
 * D7-I4-02 finding: a form submitted before hydration falls back to the browser default (GET), which put the email
 * and password into the URL (history, server logs). Every component that renders a password field must declare
 * method="post" on its forms, so an early submit can never leak credentials into a URL.
 */
const sources = import.meta.glob("/src/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("forms with secrets never submit as GET", () => {
  const withPasswords = Object.entries(sources).filter(
    ([path, src]) => !path.endsWith(".test.tsx") && /type="password"/.test(src),
  );

  it("finds the password forms (sanity)", () => {
    expect(withPasswords.map(([p]) => p)).toEqual(
      expect.arrayContaining([
        "/src/components/auth/LoginForm.tsx",
        "/src/components/auth/ResetPasswordForm.tsx",
      ]),
    );
  });

  for (const [path, src] of withPasswords) {
    it(`${path}: every <form> declares method="post"`, () => {
      const forms = src.match(/<form\b[^>]*/g) ?? [];
      expect(forms.length).toBeGreaterThan(0);
      for (const f of forms) expect(f, f).toMatch(/method="post"/);
    });
  }
});
