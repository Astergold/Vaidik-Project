import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApplicationStatusChip,
  formatInr,
  sourceLabel,
} from "@/features/applications/ApplicationParts";
import { useLeadApplications } from "@/features/applications/applications-api";
import { isMissingRoute } from "@/lib/api";
import { formatDate } from "@/lib/labels";
import { errText, isForbidden } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";

/** Lead 360 → Applications (D5-I4-01): status chip, application no., fee, paid date and source per application. */
export function LeadApplicationsPanel({ leadId }: { leadId: string }) {
  const tz = useTenantTimeZone();
  const q = useLeadApplications(leadId);
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Applications">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="size-4 text-muted-foreground" aria-hidden /> Applications
      </h2>
      {q.isPending ? (
        <Skeleton className="h-16 w-full" aria-busy="true" aria-label="Loading applications" />
      ) : isMissingRoute(q.error) ? (
        <p className="text-sm text-muted-foreground">Applications service not available yet.</p>
      ) : isForbidden(q.error) ? (
        <p className="text-sm text-muted-foreground">Not available for your role.</p>
      ) : q.isError ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-destructive">
            {errText(q.error, "Couldn't load applications.")}
          </p>
          <Button size="xs" variant="outline" onClick={() => void q.refetch()}>
            Try again
          </Button>
        </div>
      ) : q.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No application received yet.</p>
      ) : (
        <ul className="space-y-3">
          {q.data.items.map((a) => (
            <li key={a.id} className="space-y-1.5 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ApplicationStatusChip status={a.status} />
                <span className="text-xs text-muted-foreground">{sourceLabel(a.source)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Application no.</dt>
                <dd className="text-right break-words">{a.externalApplicationNo ?? "—"}</dd>
                <dt className="text-muted-foreground">Program</dt>
                <dd className="text-right break-words">{a.program?.name ?? "—"}</dd>
                <dt className="text-muted-foreground">Fee</dt>
                <dd className="text-right tabular-nums">{formatInr(a.feeAmount)}</dd>
                <dt className="text-muted-foreground">Paid on</dt>
                <dd className="text-right">{a.paidAt ? formatDate(a.paidAt, tz) : "Not paid"}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
