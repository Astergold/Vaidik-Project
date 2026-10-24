import type { ReactNode } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, Construction, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session";
import { canView, childrenOf, homeFor, PAGES, ROLE_LABELS, type PageId } from "@/lib/sitemap";
import { cn } from "@/lib/utils";

/**
 * Stand-in for every Appendix B page until its task builds it (D1-I4-04).
 * `?state=loading|error` previews the loading and error states so all three can be screenshotted.
 */
export const PLACEHOLDER_STATES = ["empty", "loading", "error"] as const;
export type PlaceholderState = (typeof PLACEHOLDER_STATES)[number];

export function validatePlaceholderSearch(search: Record<string, unknown>): {
  state?: PlaceholderState;
} {
  const state = PLACEHOLDER_STATES.find((s) => s === search.state);
  return state && state !== "empty" ? { state } : {};
}

export function PlaceholderPage({ page }: { page: PageId }) {
  const def = PAGES[page];
  const { session } = useSession();
  const { state = "empty" } = useSearch({ from: "__root__" });
  const navigate = useNavigate();
  const setState = (next: PlaceholderState) =>
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, state: next === "empty" ? undefined : next }),
      replace: true,
    });

  if (session.status === "ready" && !canView(def, session.viewerRole)) {
    return (
      <StateCard icon={Lock} title="Not available for your role">
        {def.title} isn't part of the {ROLE_LABELS[session.viewerRole]} workspace.{" "}
        <Link
          to={homeFor(session.viewerRole)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Go to your home page
        </Link>
      </StateCard>
    );
  }

  const related = childrenOf(page);
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {def.area}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{def.title}</h1>
        </div>
        <div
          role="group"
          aria-label="Preview state"
          className="inline-flex rounded-md border bg-card p-0.5"
        >
          {PLACEHOLDER_STATES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={state === s}
              onClick={() => setState(s)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground",
                state === s && "bg-primary text-primary-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {state === "loading" && (
        <Card aria-busy="true" aria-label="Loading">
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-1/3" />
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      )}
      {state === "error" && (
        <StateCard icon={AlertTriangle} title="We couldn't load this page" tone="error">
          Something went wrong on our side. Your data is safe.
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setState("empty")}>
              Try again
            </Button>
          </div>
        </StateCard>
      )}
      {state === "empty" && (
        <StateCard icon={Construction} title="Nothing here yet">
          {def.builds}
        </StateCard>
      )}

      {related.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium">Related pages</h2>
          <ul className="flex flex-wrap gap-2">
            {related.map((r) => (
              <li key={r.path}>
                <a
                  href={r.sampleHref ?? r.path}
                  className="inline-block rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent"
                >
                  {r.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StateCard({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: typeof Lock;
  title: string;
  tone?: "error";
  children: ReactNode;
}) {
  return (
    <Card className={cn("mx-auto w-full max-w-5xl", tone === "error" && "border-destructive/40")}>
      <CardContent className="flex flex-col items-center px-6 py-10 text-center">
        <Icon
          className={cn(
            "mb-3 size-8",
            tone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div>
      </CardContent>
    </Card>
  );
}
