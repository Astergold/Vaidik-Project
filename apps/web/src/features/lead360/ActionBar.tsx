import type { ReactNode } from "react";
import { useState } from "react";
import type { LeadDetail } from "@vernacular/contracts";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCallNow, usePatchLead } from "@/features/lead360/lead360-api";
import { describeRejection } from "@/features/lead360/reject-codes";
import { isClosedStage } from "@/features/lead360/stage-form";
import { StageDialog } from "@/features/lead360/StageDialog";
import { ApiCallError } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import { useSession, useTenantTimeZone } from "@/lib/session";

const MANAGERS = ["owner", "admin", "admission_head"];

/** Call now · Change stage · (managers) owner. The call result is shown right here, never as a toast. */
export function ActionBar({ lead }: { lead: LeadDetail }) {
  const tz = useTenantTimeZone();
  const { session } = useSession();
  const [stageOpen, setStageOpen] = useState(false);
  const call = useCallNow(lead.id);
  const owner = usePatchLead(lead.id);
  const me = session.status === "ready" ? session : null;
  const isManager = me ? MANAGERS.includes(me.viewerRole) : false;
  const closed = isClosedStage(lead.stage);

  return (
    <section aria-label="Actions" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => call.mutate()}
          disabled={call.isPending || closed}
          title={closed ? "Reopen the lead (change stage) to call" : undefined}
        >
          {call.isPending ? <Loader2 className="animate-spin" /> : <PhoneCall />}
          Call now
        </Button>
        <Button variant="outline" onClick={() => setStageOpen(true)}>
          Change stage
        </Button>
        {isManager && me && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={owner.isPending}>
                Owner <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                disabled={lead.owner?.id === me.me.user.id}
                onSelect={() => owner.mutate({ ownerCounsellorId: me.me.user.id })}
              >
                Assign to me
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!lead.owner}
                onSelect={() => owner.mutate({ ownerCounsellorId: null })}
              >
                Unassign
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <CallStatus lead={lead} call={call} tz={tz} />
      {owner.isError && (
        <Notice tone="error" title="Couldn't change the owner">
          {owner.error instanceof ApiCallError ? owner.error.message : "Please try again."}
        </Notice>
      )}

      {stageOpen && <StageDialog lead={lead} open={stageOpen} onOpenChange={setStageOpen} />}
    </section>
  );
}

function CallStatus({
  lead,
  call,
  tz,
}: {
  lead: LeadDetail;
  call: ReturnType<typeof useCallNow>;
  tz: string;
}) {
  if (call.isError) {
    const closed = call.error instanceof ApiCallError && call.error.code === "LEAD_CLOSED";
    return (
      <Notice tone="error" title={closed ? "This lead is closed" : "Couldn't start the call"}>
        {call.error instanceof ApiCallError ? call.error.message : "Please try again."}
      </Notice>
    );
  }
  const result = call.data;
  if (result?.queued) {
    return (
      <Notice tone="success" title="Call queued">
        It will appear in the timeline as soon as it starts.
      </Notice>
    );
  }
  const rejection = result?.rejection
    ? describeRejection(result.rejection.code, result.rejection.retryAt, tz)
    : lead.lastRejectCode
      ? describeRejection(lead.lastRejectCode, null, tz)
      : null;
  if (!rejection) return null;
  const fresh = Boolean(result?.rejection);
  return (
    <Notice
      tone="warning"
      title={
        fresh ? `Not called: ${rejection.title}` : `Last call attempt blocked: ${rejection.title}`
      }
      code={rejection.code}
    >
      {rejection.detail}
      {rejection.retry && (
        <span className="block font-medium text-foreground">{rejection.retry}.</span>
      )}
      {!fresh && lead.lastRejectAt && (
        <span className="block text-xs">Blocked {formatDateTime(lead.lastRejectAt, tz)}</span>
      )}
    </Notice>
  );
}

function Notice({
  tone,
  title,
  code,
  children,
}: {
  tone: "warning" | "error" | "success";
  title: string;
  code?: string;
  children: ReactNode;
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      className={
        tone === "error"
          ? "flex gap-3 rounded-lg border border-destructive/40 bg-card p-3 text-sm"
          : tone === "warning"
            ? "flex gap-3 rounded-lg border border-warning bg-warning/15 p-3 text-sm"
            : "flex gap-3 rounded-lg border border-primary/30 bg-accent p-3 text-sm"
      }
    >
      <Icon
        className={
          tone === "error"
            ? "mt-0.5 size-4 shrink-0 text-destructive"
            : tone === "warning"
              ? "mt-0.5 size-4 shrink-0 text-warning-foreground"
              : "mt-0.5 size-4 shrink-0 text-primary"
        }
        aria-hidden
      />
      <div className="min-w-0 text-muted-foreground">
        <p className="font-medium text-foreground">
          {title}
          {code && (
            <code className="ml-2 rounded bg-muted px-1 py-0.5 text-xs font-normal">{code}</code>
          )}
        </p>
        {children}
      </div>
    </div>
  );
}
