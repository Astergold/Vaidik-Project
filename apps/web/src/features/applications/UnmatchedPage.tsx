import { useState } from "react";
import type { UnmatchedApplication } from "@vernacular/contracts";
import { CheckCircle2, Link2, Loader2, X } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  APPLICATION_STATUS_LABEL,
  ApplicationStatusChip,
  formatInr,
  sourceLabel,
} from "@/features/applications/ApplicationParts";
import {
  useDismissApplication,
  useLinkApplication,
  useUnmatched,
} from "@/features/applications/applications-api";
import { LeadPicker } from "@/features/leads/LeadPicker";
import { formatCount, formatDate } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";

/** Trailing digits only: a masked "+91******4321" must search "4321", not "914321". */
const lastDigits = (phone: string | null) => phone?.match(/(\d+)$/)?.[1]?.slice(-6) ?? "";

/** /applications/unmatched (D5-I4-01): rows the server couldn't match to a lead → link to a lead or dismiss. */
export function UnmatchedPage() {
  return (
    <RoleGate page="applications.unmatched">
      <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
        <PageHeader
          area="Applications"
          title="Unmatched applications"
          description="Rows we couldn't match by application no., phone or email. Link each to the right lead, or dismiss it."
          back={{ to: "/applications", label: "Applications" }}
        />
        <List />
      </div>
    </RoleGate>
  );
}

function List() {
  const q = useUnmatched();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <QueryGate
      q={q}
      what="unmatched applications"
      service="Applications"
      empty={
        items.length === 0 && (
          <StateCard icon={CheckCircle2} title="Nothing to review">
            Every imported application is matched to a lead.
          </StateCard>
        )
      }
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {formatCount(q.data?.pages[0]?.total ?? 0)} to review
      </p>
      <ul className="space-y-3">
        {items.map((u) => (
          <li key={u.id}>
            <UnmatchedCard row={u} />
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <Button
          variant="outline"
          onClick={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
        >
          {q.isFetchingNextPage && <Loader2 className="animate-spin" />}
          Load more
        </Button>
      )}
    </QueryGate>
  );
}

function UnmatchedCard({ row: u }: { row: UnmatchedApplication }) {
  const tz = useTenantTimeZone();
  const link = useLinkApplication(u.id);
  const dismiss = useDismissApplication(u.id);
  const [picking, setPicking] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const label = u.fullName ?? u.externalApplicationNo ?? "Unnamed applicant";
  const facts: [string, string][] = [
    ["Application no.", u.externalApplicationNo ?? "—"],
    ["Phone", u.phone ?? "—"],
    ["Email", u.email ?? "—"],
    ["Program", u.program ?? "—"],
    ["Fee", formatInr(u.feeAmount)],
    ["Paid on", u.paidAt ? formatDate(u.paidAt, tz) : "—"],
  ];
  return (
    <article className="space-y-3 rounded-lg border bg-card p-4" aria-label={label}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold break-words">{label}</h2>
          <p className="text-xs text-muted-foreground">
            {sourceLabel(u.source)} · received {formatDate(u.receivedAt, tz)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ApplicationStatusChip status={u.status} />
          <Badge variant="outline">
            {u.reason === "ambiguous" ? "Several leads match" : "No match"}
          </Badge>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="flex min-w-0 justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 text-right break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {dismissing ? (
        <div className="space-y-2 rounded-md border p-3">
          <label htmlFor={`dismiss-${u.id}`} className="text-sm font-medium">
            Why dismiss it? (optional)
          </label>
          <Input
            id={`dismiss-${u.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="e.g. Test entry, not a real applicant"
          />
          {dismiss.isError && <FormAlert>{errText(dismiss.error, "Couldn't dismiss.")}</FormAlert>}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate(reason)}
            >
              {dismiss.isPending && <Loader2 className="animate-spin" />}
              Dismiss row
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissing(false)}
              disabled={dismiss.isPending}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setPicking(true)}>
            <Link2 /> Link to lead
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDismissing(true)}>
            <X /> Dismiss
          </Button>
        </div>
      )}
      {picking && (
        <LeadPicker
          open={picking}
          onOpenChange={(o) => {
            setPicking(o);
            if (!o) link.reset();
          }}
          title="Link to a lead"
          description={`Choose the lead this application belongs to. Its status (${APPLICATION_STATUS_LABEL[u.status]}) will apply to that lead.`}
          initialQuery={lastDigits(u.phone) || u.fullName || ""}
          confirmLabel="Link application"
          pending={link.isPending}
          error={link.error}
          onConfirm={(lead) => link.mutate(lead.id)}
        />
      )}
    </article>
  );
}
