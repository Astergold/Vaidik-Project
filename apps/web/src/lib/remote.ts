/** A server value as a view sees it: lets presentational components render every state (and be tested without a backend). */
export type Remote<T> =
  | { kind: "loading" }
  | { kind: "error"; message: string; retry: () => void }
  | { kind: "ready"; data: T };
