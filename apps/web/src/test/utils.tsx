import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { MeResponse } from "@vernacular/contracts";
import { SessionContext, type Session } from "@/lib/session";
import type { ViewerRole } from "@/lib/sitemap";

/**
 * Test helpers for DOM tests (`// @vitest-environment jsdom`). Fixtures passed to these must be parsed with
 * the contract schema in the test — the app itself never fabricates data.
 */
export const ME = (role: ViewerRole, over: Partial<MeResponse["user"]> = {}): MeResponse => ({
  user: {
    id: "01a14679-1cc4-7b7a-980d-5cec851fd541",
    name: "Chitra Counsellor",
    email: "c1@mit-adt.local",
    ...over,
  },
  tenant: {
    id: "80c2ef13-4645-41e0-832c-efb79efca47c",
    name: "MIT-ADT University",
    slug: "mit-adt",
    timezone: "Asia/Kolkata",
    status: "active",
  },
  role: role === "super_admin" ? "owner" : role,
  isPlatformAdmin: role === "super_admin",
  impersonatedBy: null,
});

export function renderUI(
  ui: ReactElement,
  opts: { role?: ViewerRole; path?: string; impersonatedBy?: string } = {},
) {
  const role = opts.role ?? "counsellor";
  const me = { ...ME(role), impersonatedBy: opts.impersonatedBy ?? null };
  const session: Session = { status: "ready", source: "api", me, viewerRole: role };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: [opts.path ?? "/"] }),
  });
  const wrap = ({ children }: { children: ReactNode }) => (
    <RouterContextProvider router={router}>
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={{ session, setDevRole: () => {}, signOut: async () => {} }}>
          {children}
        </SessionContext.Provider>
      </QueryClientProvider>
    </RouterContextProvider>
  );
  return { ...render(ui, { wrapper: wrap }), queryClient, router };
}

export interface RecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}
type Handler = (
  call: RecordedCall,
) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;

/**
 * Stubs global fetch with "METHOD /path" handlers (path without query). Unmatched calls answer like the real
 * API for a missing route: 404 { error: { code: "NOT_FOUND", message: "Route not found" } }.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input, "http://localhost");
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : (init.body ?? null);
      const call = { method, path: url.pathname, query: url.searchParams, body };
      calls.push(call);
      const h = routes[`${method} ${url.pathname}`];
      const res = h
        ? await h(call)
        : { status: 404, body: { error: { code: "NOT_FOUND", message: "Route not found" } } };
      return new Response(JSON.stringify(res.body ?? {}), {
        status: res.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}
