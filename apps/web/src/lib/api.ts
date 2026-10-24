import { apiError } from "@vernacular/contracts";
import { z } from "zod";

/**
 * The only network path in the UI (D1-I4-02, D2-I4-01): same-origin /api/* calls, typed by contracts.
 * Never call `fetch` from a component. Failures become `ApiCallError`; the QueryClient's caches turn
 * them into toasts / the 401 redirect (`src/lib/errors.ts`), so call sites don't handle that themselves.
 */
export class ApiCallError extends Error {
  constructor(
    /** HTTP status; 0 = network failure (server unreachable). */
    readonly status: number,
    readonly code: string,
    message: string,
    /** 422 details: `[{ path, message }]`. */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiCallError";
  }
}

/** Better Auth (/api/auth/*) answers errors as `{ code?, message }` instead of `{ error: {…} }`. */
const authError = z.object({ code: z.string().optional(), message: z.string() });

export function toApiError(status: number, body: unknown): ApiCallError {
  const wrapped = apiError.safeParse(body);
  if (wrapped.success) {
    const e = wrapped.data.error;
    return new ApiCallError(status, e.code, e.message, e.details);
  }
  const auth = authError.safeParse(body);
  if (auth.success)
    return new ApiCallError(status, auth.data.code ?? `HTTP_${status}`, auth.data.message);
  return new ApiCallError(
    status,
    `HTTP_${status}`,
    status >= 500 ? "Something went wrong on our side." : "The request failed.",
  );
}

export type QueryValue =
  string | number | boolean | null | undefined | readonly (string | number)[];

/** Repeats a key for arrays (`stage=new&stage=attempting`), the format the API's filters expect. */
export function toQueryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) for (const v of value) params.append(key, String(v));
    else params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

type ApiPath = `/api/${string}`;

async function call<T>(url: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: "same-origin" });
  } catch {
    throw new ApiCallError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw toApiError(res.status, body);
  return schema.parse(body);
}

export const apiGet = <T>(
  path: ApiPath,
  schema: z.ZodType<T>,
  query?: Record<string, QueryValue>,
) =>
  call(
    `${path}${query ? toQueryString(query) : ""}`,
    { method: "GET", headers: { accept: "application/json" } },
    schema,
  );

export const apiPost = <T>(path: ApiPath, body: unknown, schema: z.ZodType<T>) =>
  call(
    path,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    schema,
  );

export const apiPatch = <T>(path: ApiPath, body: unknown, schema: z.ZodType<T>) =>
  call(
    path,
    {
      method: "PATCH",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    schema,
  );

export const apiPut = <T>(path: ApiPath, body: unknown, schema: z.ZodType<T>) =>
  call(
    path,
    {
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    schema,
  );

/** DELETE that answers 204 (or any 2xx); failures arrive as the JSON error envelope. */
export async function apiDelete(path: ApiPath): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "DELETE",
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    throw new ApiCallError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection.");
  }
  if (!res.ok) throw toApiError(res.status, await res.json().catch(() => null));
}

/** multipart/form-data upload (the browser sets the boundary header itself). */
export const apiPostForm = <T>(path: ApiPath, form: FormData, schema: z.ZodType<T>) =>
  call(path, { method: "POST", headers: { accept: "application/json" }, body: form }, schema);

/** A file response (e.g. a CSV report). Errors still arrive as the JSON error envelope. */
export async function apiGetBlob(path: ApiPath): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin" });
  } catch {
    throw new ApiCallError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection.");
  }
  if (!res.ok) throw toApiError(res.status, await res.json().catch(() => null));
  return res.blob();
}

/** 404 from the router itself ("Route not found"): the endpoint isn't deployed, as opposed to a missing record. */
export const isMissingRoute = (err: unknown) =>
  err instanceof ApiCallError && err.status === 404 && err.message === "Route not found";
