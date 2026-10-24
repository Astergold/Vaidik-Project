import type { Webhook } from "@vernacular/contracts";
import { History, Loader2, RotateCw } from "lucide-react";
import { QueryGate } from "@/components/QueryGate";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDeliveries, useReplayDelivery } from "@/features/integrations/integrations-api";
import { deliverySummary } from "@/features/integrations/webhook-form";
import { formatDateTime } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";

const STATUS_VARIANT = {
  succeeded: "secondary",
  pending: "outline",
  retrying: "outline",
  failed: "destructive",
} as const;

/** A webhook's delivery attempts, newest first, with Replay (D5-I4-03). */
export function DeliveryLog({ webhook: w, onClose }: { webhook: Webhook; onClose: () => void }) {
  const tz = useTenantTimeZone();
  const q = useDeliveries(w.id, true);
  const replay = useReplayDelivery(w.id);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-4 sm:max-w-2xl">
        <SheetTitle>Delivery log</SheetTitle>
        <SheetDescription className="mb-4 break-all">{w.url}</SheetDescription>
        <div className="min-w-0 space-y-3">
          <QueryGate
            q={q}
            what="deliveries"
            service="Webhook"
            empty={
              items.length === 0 && (
                <StateCard icon={History} title="No deliveries yet">
                  Send a test, or wait for one of the subscribed events.
                </StateCard>
              )
            }
          >
            {replay.isError && (
              <p role="alert" className="text-sm text-destructive">
                {errText(replay.error, "Couldn't replay the delivery.")}
              </p>
            )}
            <div className="max-w-full overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Next retry</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(d.createdAt, tz)}
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {d.event}
                      </TableCell>
                      <TableCell className="min-w-40">
                        <Badge variant={STATUS_VARIANT[d.status]} className="capitalize">
                          {d.status}
                        </Badge>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {deliverySummary(d)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {d.nextRetryAt ? formatDateTime(d.nextRetryAt, tz) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {d.status !== "pending" && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={replay.isPending}
                            onClick={() => replay.mutate(d.id)}
                            aria-label={`Replay ${d.event} from ${formatDateTime(d.createdAt, tz)}`}
                          >
                            {replay.isPending && replay.variables === d.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <RotateCw />
                            )}
                            Replay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {q.hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
              >
                {q.isFetchingNextPage && <Loader2 className="animate-spin" />}
                Load older
              </Button>
            )}
          </QueryGate>
        </div>
      </SheetContent>
    </Sheet>
  );
}
