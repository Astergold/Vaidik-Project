import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AuthLayout } from "@/components/AuthLayout";
import { validatePlaceholderSearch } from "@/components/PlaceholderPage";
import { ErrorPage, NotFound } from "@/components/SystemPages";
import { Toaster } from "@/components/ui/toaster";
import { BrandingProvider, DEFAULT_BRANDING } from "@/lib/branding";
import { isAuthPath } from "@/lib/sitemap";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: validatePlaceholderSearch,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: DEFAULT_BRANDING.productName },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorPage,
});

/** Auth pages get the centred card; everything else gets the app shell. */
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuth = isAuthPath(pathname);
  return (
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        {isAuth ? (
          <AuthLayout>
            <Outlet />
          </AuthLayout>
        ) : (
          <AppShell>
            <Outlet />
          </AppShell>
        )}
        <Toaster />
      </BrandingProvider>
    </QueryClientProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
