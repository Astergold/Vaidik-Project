import { ApiCallError } from "@/lib/api";

/**
 * What the app does with a failed API call (D2-I4-01). Pure, so it is unit-tested; `router.tsx`
 * wires it to the QueryClient caches. Queries/mutations with `meta: { silent: true }` skip it and
 * show the error inline instead (session probe, auth forms, role-gated pages).
 */
export type ErrorAction =
  | { kind: "ignore" }
  | { kind: "redirect-login" }
  | { kind: "toast"; title: string; description?: string };

export interface ErrorContext {
  /** Dev server with the stub session: a 401 is expected, so don't bounce to /login. */
  devSession: boolean;
  /** Already on /login etc.: the form shows the error. */
  onAuthPage: boolean;
}

export function decideErrorAction(err: unknown, ctx: ErrorContext): ErrorAction {
  if (!(err instanceof ApiCallError)) {
    return { kind: "toast", title: "Something went wrong", description: "Please reload the page." };
  }
  if (err.status === 401) {
    if (ctx.onAuthPage) return { kind: "ignore" };
    if (ctx.devSession) {
      return {
        kind: "toast",
        title: "Not signed in",
        description: "Dev session: sign in at /login to load real data.",
      };
    }
    return { kind: "redirect-login" };
  }
  if (err.status === 0) return { kind: "toast", title: "You're offline", description: err.message };
  if (err.status === 403) {
    return { kind: "toast", title: "You don't have access to this", description: err.message };
  }
  if (err.status >= 500) {
    return {
      kind: "toast",
      title: "Something went wrong",
      description: "Please try again in a moment.",
    };
  }
  return { kind: "toast", title: "That didn't work", description: err.message };
}

/** Retry server/network hiccups once; never retry 4xx (they won't change). */
export function shouldRetry(failureCount: number, err: unknown): boolean {
  if (err instanceof ApiCallError && err.status >= 400 && err.status < 500) return false;
  return failureCount < 1;
}

/** Only same-site paths: `/leads?x=1` yes; `//evil.com`, `https://…`, `/\evil` no. */
export function safeRedirect(target: unknown): string {
  if (typeof target !== "string" || !target.startsWith("/")) return "/";
  if (target.startsWith("//") || target.startsWith("/\\")) return "/";
  return target;
}

/** Per query/mutation opt-out of the global policy, for errors the component shows itself. */
// A type alias (not an interface) so it satisfies React Query's Record<string, unknown> meta constraint.
export type ErrorMeta = {
  /** Every failure is shown inline (session probe, auth forms). */
  silent?: boolean;
  /** Only these statuses are shown inline (e.g. dashboard 403/422); 401/5xx still go global. */
  handles?: readonly number[];
};

export function handledLocally(err: unknown, meta: ErrorMeta | undefined): boolean {
  if (meta?.silent) return true;
  return err instanceof ApiCallError && (meta?.handles?.includes(err.status) ?? false);
}
