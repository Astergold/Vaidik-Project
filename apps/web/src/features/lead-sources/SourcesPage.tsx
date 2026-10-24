import { useState } from "react";
import type { LeadSource } from "@vernacular/contracts";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, FileUp, Lock, Plug, Plus } from "lucide-react";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MappingEditor } from "@/features/lead-sources/MappingEditor";
import {
  CreateSourceDialog,
  KIND_LABEL,
  RotateTokenDialog,
} from "@/features/lead-sources/SourceDialogs";
import { usePatchSource, useSources } from "@/features/lead-sources/sources-api";
import { CopyField } from "@/features/lead-sources/TokenReveal";
import { ApiCallError } from "@/lib/api";
import { formatDate } from "@/lib/labels";
import { useSession, useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Settings → Lead sources (D3-I4-03, part 1). Owner/admin edit; admission head reads (mirrors the API's
 * role gates — no buttons that would 403). The CSV import wizard is a follow-up (backend D3-I3-03).
 */
export function SourcesPage() {
  const { session } = useSession();
  const role = session.status === "ready" ? session.viewerRole : null;
  const canEdit = role === "owner" || role === "admin";
  const sources = useSources(session.status === "ready");
  const [creating, setCreating] = useState(false);
  const forbidden = sources.error instanceof ApiCallError && sources.error.status === 403;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Settings
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Lead sources</h1>
          <p className="text-sm text-muted-foreground">
            Forms and systems that send us leads. Each gets its own URL and token.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/settings/lead-sources/import">
                <FileUp /> Import CSV
              </Link>
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus /> New source
            </Button>
          </div>
        )}
      </div>
      {role === "admission_head" && (
        <p className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          You can view sources. Owners and admins can add or change them.
        </p>
      )}

      {session.status === "loading" || sources.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading sources">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : forbidden ? (
        <StateCard icon={Lock} title="Not available for your role">
          Lead sources are managed by owners and admins.
        </StateCard>
      ) : sources.isError ? (
        <StateCard
          icon={AlertTriangle}
          title="Couldn't load lead sources"
          tone="error"
          action={
            <Button variant="outline" size="sm" onClick={() => void sources.refetch()}>
              Try again
            </Button>
          }
        >
          Check your connection and try again.
        </StateCard>
      ) : sources.data.items.length === 0 ? (
        <StateCard
          icon={Plug}
          title="No lead sources yet"
          action={
            canEdit && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus /> New source
              </Button>
            )
          }
        >
          Add one for each web form or lead provider, then give them its URL and token.
        </StateCard>
      ) : (
        <ul className="space-y-3">
          {sources.data.items.map((s) => (
            <li key={s.id}>
              <SourceCard source={s} canEdit={canEdit} />
            </li>
          ))}
        </ul>
      )}

      {creating && <CreateSourceDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}

function SourceCard({ source: s, canEdit }: { source: LeadSource; canEdit: boolean }) {
  const tz = useTenantTimeZone();
  const [editing, setEditing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const patch = usePatchSource(s.id);
  const mapped = Object.keys(s.fieldMapping).filter((k) => k !== "consent_channels");

  return (
    <article className={cn("space-y-3 rounded-lg border bg-card p-4", !s.isActive && "opacity-80")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold break-words">{s.name}</h2>
          <p className="text-xs text-muted-foreground">
            {KIND_LABEL[s.kind]} · added {formatDate(s.createdAt, tz)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={s.isActive ? "secondary" : "outline"}>
            {s.isActive ? "Active" : "Inactive"}
          </Badge>
          <Badge variant="outline">{s.autoDial ? "Auto-call on" : "Auto-call off"}</Badge>
          <Badge variant="outline">{s.hasToken ? "Token set" : "No token"}</Badge>
        </div>
      </div>
      <CopyField id={`url-${s.id}`} label="Endpoint URL" value={s.endpointUrl} />
      <p className="text-xs text-muted-foreground">
        Mapping: {mapped.length ? mapped.join(", ") : "automatic recognition"}
      </p>
      {patch.isError && (
        <p className="text-sm text-destructive">
          {patch.error instanceof ApiCallError ? patch.error.message : "Couldn't update the source"}
        </p>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
          >
            {editing ? "Hide mapping" : "Edit mapping & test"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRotating(true)}>
            Rotate token
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={patch.isPending}
            onClick={() => patch.mutate({ isActive: !s.isActive })}
          >
            {s.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      )}
      {canEdit && editing && <MappingEditor source={s} onClose={() => setEditing(false)} />}
      {rotating && <RotateTokenDialog source={s} open={rotating} onOpenChange={setRotating} />}
    </article>
  );
}
