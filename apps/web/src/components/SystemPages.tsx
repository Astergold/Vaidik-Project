import { Link, Navigate } from "@tanstack/react-router";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session";
import { homeFor } from "@/lib/sitemap";

/** `/`: send each role to its own home. */
export function HomeRedirect() {
  const { session } = useSession();
  if (session.status === "loading")
    return <Skeleton className="h-40 w-full" aria-label="Loading" />;
  return <Navigate to={homeFor(session.viewerRole)} replace />;
}

/** Any unknown URL. Rendered inside the shell. */
export function NotFound() {
  return (
    <Card className="mx-auto mt-6 w-full max-w-lg">
      <CardContent className="py-10 text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-1 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be old, or the page may have moved.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Go home</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Unexpected render error. Replaces the whole app, so it can't rely on the shell or session. No internals shown. */
export function ErrorPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center py-10 text-center">
          <BrandMark size="lg" />
          <h1 className="mt-6 text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please reload the page. If it keeps happening, tell your admin.
          </p>
          <Button className="mt-6" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
