import type { ReactNode } from "react";
import { AlertTriangle, Lock, PlugZap } from "lucide-react";
import { StateCard } from "@/components/StateCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isMissingRoute } from "@/lib/api";
import { errText, isForbidden } from "@/lib/seam";

export interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * Loading → not available yet (404 "Route not found") → no access (403) → error with retry → empty → content.
 * `service` names the missing backend ("Applications" → "Applications service not available yet").
 */
export function QueryGate({
  q,
  what,
  service,
  skeleton,
  empty,
  children,
}: {
  q: QueryLike;
  /** Plural noun for messages: "applications". */
  what: string;
  service: string;
  skeleton?: ReactNode;
  /** Rendered instead of children when set (the caller decides what "empty" means). */
  empty?: ReactNode | false;
  children: ReactNode;
}) {
  if (q.isPending)
    return (
      <div aria-busy="true" aria-label={`Loading ${what}`}>
        {skeleton ?? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
      </div>
    );
  if (isMissingRoute(q.error))
    return (
      <StateCard icon={PlugZap} title={`${service} service not available yet`}>
        This needs a server feature that hasn&apos;t been switched on yet. Nothing is shown until it
        is.
      </StateCard>
    );
  if (isForbidden(q.error))
    return (
      <StateCard icon={Lock} title="Not available for your role">
        {errText(q.error, `You don't have access to ${what}.`)}
      </StateCard>
    );
  if (q.isError)
    return (
      <StateCard
        icon={AlertTriangle}
        title={`Couldn't load ${what}`}
        tone="error"
        action={
          <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
            Try again
          </Button>
        }
      >
        {errText(q.error, "Check your connection and try again.")}
      </StateCard>
    );
  if (empty) return <>{empty}</>;
  return <>{children}</>;
}
