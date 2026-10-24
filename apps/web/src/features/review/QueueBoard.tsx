import { useState } from "react";
import type { QueueItem, QueueKind } from "@vernacular/contracts";
import { AlertTriangle, CheckCircle2, Inbox, PlugZap } from "lucide-react";
import { StateCard } from "@/components/StateCard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { TemperatureTag } from "@/features/leads/LeadsTable";
import { useQueue } from "@/features/review/review-api";
import { ReviewPanel, type ReviewResult } from "@/features/review/ReviewPanel";
import { isMissingRoute } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";

const EMPTY: Record<QueueKind, string> = {
  needs_counsellor: "Nothing needs you right now.",
  review_call: "No calls waiting for review.",
  sla_breach: "No overdue items.",
};

/**
 * A queue list + the review side panel (D4-I4-01). Finishing an item opens the next one in place: the panel
 * stays mounted and the route doesn't change, so a counsellor can clear many items in a row.
 */
export function QueueBoard({ kind, title }: { kind: QueueKind; title: string }) {
  const tz = useTenantTimeZone();
  const q = useQueue(kind);
  const [openId, setOpenId] = useState<string | null>(null);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [last, setLast] = useState<ReviewResult | null>(null);

  // Items already finished stay hidden even if a refetch hasn't caught up yet.
  const items = (q.data?.items ?? []).filter((i) => !done.has(i.id));
  const current: QueueItem | undefined = (q.data?.items ?? []).find((i) => i.id === openId);

  const finish = (r: ReviewResult) => {
    if (!openId) return;
    const order = (q.data?.items ?? []).filter((i) => !done.has(i.id)).map((i) => i.id);
    const idx = order.indexOf(openId);
    const next =
      order
        .slice(idx + 1)
        .concat(order.slice(0, idx))
        .find((id) => id !== openId) ?? null;
    setDone((d) => new Set(d).add(openId));
    setLast(r);
    setOpenId(next);
  };

  let body;
  if (q.isPending) {
    body = (
      <div className="space-y-2" aria-busy="true" aria-label={`Loading ${title}`}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  } else if (isMissingRoute(q.error)) {
    body = (
      <StateCard icon={PlugZap} title="Queues not available yet">
        This needs a server feature that hasn&apos;t been switched on yet. Nothing is missing from
        your leads.
      </StateCard>
    );
  } else if (q.isError) {
    body = (
      <StateCard
        icon={AlertTriangle}
        title={`Couldn't load ${title.toLowerCase()}`}
        tone="error"
        action={
          <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
            Try again
          </Button>
        }
      >
        Check your connection and try again.
      </StateCard>
    );
  } else if (items.length === 0) {
    body = (
      <StateCard icon={last ? CheckCircle2 : Inbox} title={last ? "All done" : EMPTY[kind]}>
        {last ? `Last: ${last.leadName} — ${last.text}.` : "New items appear here as calls finish."}
      </StateCard>
    );
  } else {
    body = (
      <ul className="space-y-2" aria-label={title}>
        {items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => setOpenId(i.id)}
              className="w-full rounded-lg border bg-card p-3 text-left hover:bg-accent/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium break-words">{i.lead.name ?? "Unnamed lead"}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {i.lead.phone ?? "—"}
                  </p>
                </div>
                <TemperatureTag value={i.lead.temperature} />
              </div>
              {i.reason && <p className="mt-1 text-sm break-words">{i.reason}</p>}
              {i.dueAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Due {formatDateTime(i.dueAt, tz)}
                </p>
              )}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {last && items.length > 0 && (
        <p
          role="status"
          className="rounded-md border bg-accent px-3 py-2 text-sm text-accent-foreground"
        >
          Saved — {last.leadName}: {last.text}
        </p>
      )}
      {body}
      <Sheet open={Boolean(current)} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-4 sm:max-w-xl">
          <SheetTitle className="sr-only">{title}: review</SheetTitle>
          <SheetDescription className="sr-only">
            Call, transcript and actions for the selected item
          </SheetDescription>
          {last && (
            <p
              role="status"
              className="mb-3 mr-8 rounded-md border bg-accent px-3 py-2 text-sm text-accent-foreground"
            >
              Saved — {last.leadName}: {last.text}
            </p>
          )}
          {current && <ReviewPanel key={current.id} item={current} onDone={finish} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
