import type { PlatformHealth } from "@vernacular/contracts";
import { CheckCircle2, Loader2, RotateCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlatformHealth } from "@/features/platform/platform-api";
import { formatCount, formatDate, formatDateTime } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

/** /platform/health (D6-I4-01): job queue depth, failed jobs, daily sync parity, recent job errors. Auto-refreshes. */
export function HealthPage() {
  return (
    <RoleGate page="platform.health">
      <HealthView />
    </RoleGate>
  );
}

/** "3 min", "2 h" since an ISO time, measured against the server's generatedAt (not the browser clock). */
export function ageSince(iso: string, nowIso: string): string {
  const min = Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(iso)) / 60_000));
  return min < 60
    ? `${min} min`
    : min < 48 * 60
      ? `${Math.round(min / 60)} h`
      : `${Math.round(min / 1440)} d`;
}

function HealthView() {
  const tz = useTenantTimeZone();
  const q = usePlatformHealth();
  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 space-y-4">
      <PageHeader
        area="Platform"
        title="Health"
        description={
          q.data
            ? `Updated ${formatDateTime(q.data.generatedAt, tz)} · refreshes every 30 s`
            : "Queues, sync parity and job errors across tenants."
        }
        actions={
          q.isSuccess && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
            >
              {q.isFetching ? <Loader2 className="animate-spin" /> : <RotateCw />}
              Refresh
            </Button>
          )
        }
      />
      <QueryGate q={q} what="platform health" service="Platform">
        {q.data && <Sections h={q.data} tz={tz} />}
      </QueryGate>
    </div>
  );
}

function Sections({ h, tz }: { h: PlatformHealth; tz: string }) {
  const mismatches = h.syncHealth.filter((s) => s.engineRuns !== s.crmAttempts).length;
  return (
    <>
      <section className="min-w-0 space-y-2" aria-labelledby="queues-h">
        <h2 id="queues-h" className="text-lg font-semibold">
          Job queues
        </h2>
        {h.queues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No queues reported.</p>
        ) : (
          <div className="max-w-full overflow-x-auto rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Queue</TableHead>
                  <TableHead className="text-right">Waiting</TableHead>
                  <TableHead className="text-right">Running</TableHead>
                  <TableHead className="text-right">Failed (24 h)</TableHead>
                  <TableHead className="text-right">Oldest waiting</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {h.queues.map((qu) => (
                  <TableRow key={qu.name}>
                    <TableCell className="font-mono text-xs">{qu.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(qu.queued)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(qu.active)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        qu.failed24h > 0 && "font-medium text-destructive",
                      )}
                    >
                      {formatCount(qu.failed24h)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {qu.oldestQueuedAt ? ageSince(qu.oldestQueuedAt, h.generatedAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="min-w-0 space-y-2" aria-labelledby="sync-h">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="sync-h" className="text-lg font-semibold">
            Sync health
          </h2>
          {h.syncHealth.length > 0 &&
            (mismatches === 0 ? (
              <Badge variant="secondary">
                <CheckCircle2 /> All matching
              </Badge>
            ) : (
              <Badge variant="destructive">{mismatches} mismatched</Badge>
            ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Voice Engine runs vs CRM call attempts, per tenant and day.
        </p>
        {h.syncHealth.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sync data yet.</p>
        ) : (
          <div className="max-w-full overflow-x-auto rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Engine runs</TableHead>
                  <TableHead className="text-right">CRM attempts</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {h.syncHealth.map((s) => {
                  const diff = s.crmAttempts - s.engineRuns;
                  return (
                    <TableRow key={`${s.tenant.id}-${s.date}`}>
                      <TableCell>{s.tenant.name}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(`${s.date}T12:00:00Z`, tz)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(s.engineRuns)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(s.crmAttempts)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          diff !== 0 && "font-medium text-destructive",
                        )}
                      >
                        {diff === 0 ? "0" : diff > 0 ? `+${diff}` : String(diff)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="min-w-0 space-y-2" aria-labelledby="errors-h">
        <h2 id="errors-h" className="text-lg font-semibold">
          Recent job errors
        </h2>
        {h.recentErrors.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" aria-hidden /> No failed jobs recently.
          </p>
        ) : (
          <ul className="space-y-2">
            {h.recentErrors.map((e) => (
              <li key={e.id} className="min-w-0 rounded-md border bg-card p-3 text-sm">
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="font-mono">{e.queue}</span>
                  <span>{e.tenant?.name ?? "Platform"}</span>
                  <span>{formatDateTime(e.failedAt, tz)}</span>
                  <span>attempt {e.attempts}</span>
                </p>
                <p className="mt-1 break-words">{e.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
