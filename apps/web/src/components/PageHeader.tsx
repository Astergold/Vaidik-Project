import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { AppPath } from "@/lib/sitemap";

/** Eyebrow (area) + title + one-line description + actions; optional back link above. */
export function PageHeader({
  area,
  title,
  description,
  actions,
  back,
}: {
  area: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: AppPath; label: string };
}) {
  return (
    <div className="space-y-3">
      {back && (
        <Link
          to={back.to}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {area}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
