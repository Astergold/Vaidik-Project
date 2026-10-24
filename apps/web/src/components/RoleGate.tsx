import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { StateCard } from "@/components/StateCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session";
import { canView, homeFor, PAGES, ROLE_LABELS, type PageId } from "@/lib/sitemap";

/**
 * Renders a page only for the roles the sitemap lists for it (single source of truth). Shapes the UI only:
 * the API enforces every permission. Children don't mount (and fire no requests) for other roles.
 */
export function RoleGate({ page, children }: { page: PageId; children: ReactNode }) {
  const { session } = useSession();
  if (session.status === "loading")
    return <Skeleton className="h-40 w-full" aria-busy="true" aria-label="Loading" />;
  const def = PAGES[page];
  if (!canView(def, session.viewerRole))
    return (
      <StateCard icon={Lock} title="Not available for your role">
        {def.title} isn&apos;t part of the {ROLE_LABELS[session.viewerRole]} workspace.{" "}
        <Link
          to={homeFor(session.viewerRole)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Go to your home page
        </Link>
      </StateCard>
    );
  return <>{children}</>;
}

/** The viewer's role once the session is ready (null while loading). */
export function useViewerRole() {
  const { session } = useSession();
  return session.status === "ready" ? session.viewerRole : null;
}

/** Owner/admin manage settings-type things; heads usually read. Mirrors handbook §7.5. */
export function useCanManage() {
  const role = useViewerRole();
  return role === "owner" || role === "admin";
}
