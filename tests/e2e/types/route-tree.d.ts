/**
 * Type-check stand-in for apps/web/src/routeTree.gen.ts (D7-I4-02). The sweep imports the sitemap, whose AppPath is
 * keyof FileRoutesByTo; the real generated file would pull the whole web app (and its Vite-only types) into this
 * program. Paths are plain strings here; the web app's own typecheck keeps the real, strict type.
 */
export type FileRoutesByTo = Record<string, unknown>;
