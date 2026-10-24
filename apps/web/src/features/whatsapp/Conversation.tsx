import type { ReactNode } from "react";
import type { LeadMessagesResponse } from "@vernacular/contracts";
import { Ban, Loader2, MessageCircle } from "lucide-react";
import { QueryGate } from "@/components/QueryGate";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageBubble } from "@/features/whatsapp/MessageBubble";
import { flattenMessages, useLeadMessages } from "@/features/whatsapp/messaging-api";
import { formatDate } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";

const SUPPRESSION_LABEL: Record<
  NonNullable<LeadMessagesResponse["suppression"]>["reason"],
  string
> = {
  opt_out: "Opted out (STOP)",
  dnd: "On the DND list",
  ndnc: "On the NDNC list",
  invalid: "Invalid number",
};

/** Lead 360 → Conversation tab (D5-I4-02): the WhatsApp thread, newest at the bottom. */
export function Conversation({
  leadId,
  composer,
}: {
  leadId: string;
  /** The send controls (template dialog + free-text box), given the server's gating flags. */
  composer?: (gate: ReturnType<typeof flattenMessages>) => ReactNode;
}) {
  const tz = useTenantTimeZone();
  const q = useLeadMessages(leadId);
  const view = flattenMessages(q.data);
  return (
    <section className="min-w-0 space-y-3" aria-label="WhatsApp conversation">
      {view.suppression && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
        >
          <Badge variant="destructive">
            <Ban /> {view.suppression.reason === "opt_out" ? "STOP" : "Blocked"}
          </Badge>
          <span>
            {SUPPRESSION_LABEL[view.suppression.reason]} since{" "}
            {formatDate(view.suppression.since, tz)}. Messages and calls to this number are blocked.
          </span>
        </div>
      )}
      <QueryGate
        q={q}
        what="messages"
        service="WhatsApp"
        skeleton={
          <div className="space-y-2">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="ml-auto h-12 w-2/3" />
            <Skeleton className="h-12 w-1/2" />
          </div>
        }
        empty={
          view.messages.length === 0 && (
            <>
              <StateCard icon={MessageCircle} title="No WhatsApp messages yet">
                Start the conversation with an approved template.
              </StateCard>
              {composer?.(view)}
            </>
          )
        }
      >
        {q.hasNextPage && (
          <div className="flex justify-center">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
            >
              {q.isFetchingNextPage && <Loader2 className="animate-spin" />}
              Load older messages
            </Button>
          </div>
        )}
        <ol className="space-y-2" aria-label="Messages">
          {view.messages.map((m) => (
            <MessageBubble key={m.id} message={m} tz={tz} />
          ))}
        </ol>
        {composer?.(view)}
      </QueryGate>
    </section>
  );
}
