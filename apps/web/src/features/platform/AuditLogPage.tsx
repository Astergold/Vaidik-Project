import { useState, type FormEvent } from "react";
import type { AuditEntry } from "@vernacular/contracts";
import { Loader2, ScrollText, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuditLog, useTenants } from "@/features/platform/platform-api";
import { formatDateTime } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";

/** /platform/audit-log (D6-I4-01): who changed what, across tenants; impersonated actions show both people. */
export function AuditLogPage() {
  return (
    <RoleGate page="platform.audit">
      <AuditView />
    </RoleGate>
  );
}

interface Filters {
  tenantId?: string;
  q?: string;
  from?: string;
  to?: string;
}

function AuditView() {
  const [filters, setFilters] = useState<Filters>({});
  const [term, setTerm] = useState("");
  const tenants = useTenants({});
  const log = useAuditLog({ ...filters });
  const items = log.data?.pages.flatMap((p) => p.items) ?? [];
  const set = (patch: Filters) => setFilters((f) => ({ ...f, ...patch }));
  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 space-y-4">
      <PageHeader
        area="Platform"
        title="Audit log"
        description="Every recorded change, newest first. Append-only."
      />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Tenant</span>
          <select
            value={filters.tenantId ?? ""}
            onChange={(e) => set({ tenantId: e.target.value || undefined })}
            className="h-8 max-w-48 rounded-md border bg-card px-2 text-sm"
            disabled={!tenants.data}
          >
            <option value="">
              {tenants.data ? "All tenants" : "All tenants (list unavailable)"}
            </option>
            {tenants.data?.items.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">From</span>
          <Input
            type="date"
            className="h-8 w-auto"
            value={filters.from ?? ""}
            onChange={(e) => set({ from: e.target.value || undefined })}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            className="h-8 w-auto"
            value={filters.to ?? ""}
            onChange={(e) => set({ to: e.target.value || undefined })}
          />
        </label>
        <form
          role="search"
          className="relative min-w-0 flex-1 basis-56"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            set({ q: term.trim() || undefined });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Action, entity or person"
            aria-label="Search the audit log"
            className="h-8 pl-8"
            maxLength={100}
          />
        </form>
      </div>
      <QueryGate
        q={log}
        what="audit entries"
        service="Platform"
        empty={
          items.length === 0 && (
            <StateCard icon={ScrollText} title="No entries">
              Nothing recorded for these filters.
            </StateCard>
          )
        }
      >
        <ol className="space-y-2" aria-label="Audit entries">
          {items.map((e) => (
            <Entry key={e.id} entry={e} />
          ))}
        </ol>
        {log.hasNextPage && (
          <Button
            variant="outline"
            onClick={() => void log.fetchNextPage()}
            disabled={log.isFetchingNextPage}
          >
            {log.isFetchingNextPage && <Loader2 className="animate-spin" />}
            Load older
          </Button>
        )}
      </QueryGate>
    </div>
  );
}

function Entry({ entry: e }: { entry: AuditEntry }) {
  const tz = useTenantTimeZone();
  return (
    <li className="min-w-0 rounded-md border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-xs font-medium">{e.action}</span>
        <span className="text-muted-foreground">
          on {e.entity}
          {e.entityId && <span className="font-mono text-xs"> {e.entityId}</span>}
        </span>
        {e.impersonator && <Badge variant="destructive">Impersonated</Badge>}
      </div>
      <p className="mt-1 text-xs break-words text-muted-foreground">
        {formatDateTime(e.at, tz)} · {e.tenant?.name ?? "Platform"} · by {e.actor?.name ?? "System"}
        {e.impersonator && ` (impersonated by ${e.impersonator.name})`}
        {e.ip && ` · ${e.ip}`}
      </p>
      {e.diff !== null && e.diff !== undefined && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Changes
          </summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
            {JSON.stringify(e.diff, null, 2)}
          </pre>
        </details>
      )}
    </li>
  );
}
