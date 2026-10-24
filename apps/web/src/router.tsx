import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { decideErrorAction, handledLocally, shouldRetry, type ErrorMeta } from "@/lib/errors";
import { STUB_SESSION } from "@/lib/session";
import { isAuthPath } from "@/lib/sitemap";
import { toast } from "@/lib/toast";
import { routeTree } from "./routeTree.gen";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: ErrorMeta;
    mutationMeta: ErrorMeta;
  }
}

export function getRouter() {
  // Global failure handling for every query and mutation (D2-I4-01). Runs once per final failure.
  const onError = (err: unknown, meta: ErrorMeta | undefined) => {
    if (handledLocally(err, meta)) return;
    const { pathname, href } = router.state.location;
    const action = decideErrorAction(err, {
      devSession: STUB_SESSION,
      onAuthPage: isAuthPath(pathname),
    });
    if (action.kind === "toast")
      toast({ title: action.title, description: action.description, tone: "error" });
    if (action.kind === "redirect-login") {
      queryClient.clear();
      void router.navigate({ to: "/login", search: { redirect: href } });
    }
  };

  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (err, query) => onError(err, query.meta) }),
    mutationCache: new MutationCache({ onError: (err, _v, _c, m) => onError(err, m.meta) }),
    defaultOptions: { queries: { staleTime: 30_000, retry: shouldRetry } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
  });
  return router;
}
