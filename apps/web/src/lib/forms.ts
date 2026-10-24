import { z } from "zod";
import { ApiCallError } from "@/lib/api";

/** Field name → first message. */
export type FieldErrors = Record<string, string>;

export type Parsed<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

/** Validate a submitted <form> with a zod schema (no form library needed for these small forms). */
export function parseForm<T>(schema: z.ZodType<T>, form: HTMLFormElement): Parsed<T> {
  const values = Object.fromEntries(
    // Trim emails only: a password with spaces is still that password.
    [...new FormData(form).entries()].map(([k, v]) => [
      k,
      k === "email" && typeof v === "string" ? v.trim() : v,
    ]),
  );
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

/** 422 VALIDATION_ERROR details (`[{ path, message }]`) → field errors. */
export function apiFieldErrors(err: unknown): FieldErrors {
  if (!(err instanceof ApiCallError) || !Array.isArray(err.details)) return {};
  const detail = z
    .array(z.object({ path: z.string(), message: z.string() }))
    .safeParse(err.details);
  if (!detail.success) return {};
  return Object.fromEntries(detail.data.map((d) => [d.path, d.message]));
}
