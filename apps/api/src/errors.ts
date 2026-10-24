/** Every API error leaves the server as { error: { code, message, details? } }. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthenticated = (message = "Authentication required") =>
  new AppError(401, "UNAUTHENTICATED", message);
export const forbidden = (
  message = "You do not have access to this resource",
  code = "FORBIDDEN",
) => new AppError(403, code, message);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, "CONFLICT", message, details);
export const validation = (message: string, details?: unknown) =>
  new AppError(422, "VALIDATION_ERROR", message, details);
