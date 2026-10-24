import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { rejectProposalBody, type Proposal } from "@vernacular/contracts";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { ReasonDialog } from "@/components/ReasonDialog";
import { RoleGate, useCanManage } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Switch } from "@/components/Switch";
import { Tabs, tabPanelProps } from "@/components/Tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeRejection } from "@/features/lead360/reject-codes";
import {
  useBulkApprove,
  useDecide,
  usePlannerSettings,
  useProposals,
  useSavePlannerSettings,
} from "@/features/planner/planner-api";
import { isMissingRoute } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";

const ACTION_LABEL: Record<Proposal["action"], string> = {
  callback: "AI call back",
  whatsapp_info: "Send info on WhatsApp",
  counsellor_call: "Counsellor call",
};
const STATUS_LABEL: Record<Proposal["status"], string> = {
  proposed: "Proposed",
  permitted: "Allowed by policy",
  rejected: "Blocked by policy",
  effected: "Done",
};

/** /ai/planner (D6-I4-04e): auto-run vs approval, proposals with rationale and typed policy rejections, approve/reject. */
export function PlannerPage() {
  return (
    <RoleGate page="ai.planner">
      <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
        <PageHeader
          area="AI"
          title="Planner approvals"
          description="Follow-ups the AI planner proposes for warm and cold leads. Every action still passes the calling rules."
        />
        <ModeCard />
        <Proposals />
      </div>
    </RoleGate>
  );
}

function ModeCard() {
  const canManage = useCanManage();
  const q = usePlannerSettings();
  const save = useSavePlannerSettings();
  if (q.isPending) return null;
  if (q.isError)
    return (
      <p className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
        {isMissingRoute(q.error)
          ? "The planner setting isn't available yet."
          : errText(q.error, "Couldn't load the planner setting.")}
      </p>
    );
  const approval = q.data.mode === "approval";
  return (
    <section
      className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
      aria-label="Planner mode"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {approval ? "An admission head approves each action" : "Actions run automatically"}
        </p>
        <p className="text-xs text-muted-foreground">
          {approval
            ? "Nothing is sent until someone approves it."
            : "Allowed actions are sent as planned; blocked ones are listed with the reason."}
          {q.data.updatedBy && ` Changed by ${q.data.updatedBy}.`}
        </p>
        {save.isError && (
          <p className="text-xs text-destructive">
            {errText(save.error, "Couldn't change the mode.")}
          </p>
        )}
      </div>
      {canManage ? (
        <Switch
          checked={approval}
          disabled={save.isPending}
          onChange={(on) => save.mutate(on ? "approval" : "auto")}
          label="Require approval for planner actions"
          onText="Approval on"
          offText="Approval off"
        />
      ) : (
        <Badge variant="outline">{approval ? "Approval on" : "Automatic"}</Badge>
      )}
    </section>
  );
}

function Proposals() {
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const q = useProposals(tab);
  const bulk = useBulkApprove();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const pending = q.data?.pages[0]?.pendingApproval ?? 0;
  const pickable = items.filter((p) => p.approval === "pending");
  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <section className="min-w-0 space-y-3">
      <Tabs
        id="planner"
        label="Proposals"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setPicked(new Set());
        }}
        items={[
          {
            value: "pending",
            label: "Needs approval",
            badge: pending ? String(pending) : undefined,
          },
          { value: "all", label: "All proposals" },
        ]}
      />
      <div
        {...tabPanelProps("planner", tab)}
        className="min-w-0 space-y-3 focus-visible:outline-none"
      >
        {picked.size > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
            role="region"
            aria-label="Bulk approve"
          >
            <span className="mr-auto">{picked.size} selected</span>
            <Button
              size="sm"
              disabled={bulk.isPending}
              onClick={() => bulk.mutate([...picked], { onSettled: () => setPicked(new Set()) })}
            >
              {bulk.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Approve {picked.size}
            </Button>
          </div>
        )}
        {bulk.isSuccess && (
          <p role="status" className="text-sm text-muted-foreground">
            {bulk.data} approved.
          </p>
        )}
        {bulk.isError && (
          <FormAlert>
            {errText(bulk.error, "Some approvals failed; the list shows what went through.")}
          </FormAlert>
        )}
        <QueryGate
          q={q}
          what="proposals"
          service="Planner"
          empty={
            items.length === 0 && (
              <StateCard
                icon={Sparkles}
                title={tab === "pending" ? "Nothing waiting for approval" : "No proposals yet"}
              >
                The planner runs nightly and after calls.
              </StateCard>
            )
          }
        >
          {tab === "pending" && pickable.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pickable.every((p) => picked.has(p.id))}
                onChange={(e) =>
                  setPicked(e.target.checked ? new Set(pickable.map((p) => p.id)) : new Set())
                }
              />
              Select all {pickable.length} shown
            </label>
          )}
          <ul className="space-y-3">
            {items.map((p) => (
              <ProposalCard
                key={p.id}
                p={p}
                picked={picked.has(p.id)}
                onPick={(on) => toggle(p.id, on)}
              />
            ))}
          </ul>
          {q.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
            >
              {q.isFetchingNextPage && <Loader2 className="animate-spin" />}
              Load more
            </Button>
          )}
        </QueryGate>
      </div>
    </section>
  );
}

function ProposalCard({
  p,
  picked,
  onPick,
}: {
  p: Proposal;
  picked: boolean;
  onPick: (on: boolean) => void;
}) {
  const tz = useTenantTimeZone();
  const d = useDecide();
  const [rejecting, setRejecting] = useState(false);
  const rejection = p.rejectCode ? describeRejection(p.rejectCode, null, tz) : null;
  const pending = p.approval === "pending";
  return (
    <li className="min-w-0 space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {pending && (
            <input
              type="checkbox"
              className="mt-1"
              checked={picked}
              onChange={(e) => onPick(e.target.checked)}
              aria-label={`Select proposal for ${p.lead.name ?? "lead"}`}
            />
          )}
          <div className="min-w-0">
            <p className="font-medium">
              {ACTION_LABEL[p.action]} ·{" "}
              <Link to="/leads/$leadId" params={{ leadId: p.lead.id }} className="hover:underline">
                {p.lead.name ?? "Unnamed lead"}
              </Link>
              {p.lead.phone && (
                <span className="text-sm font-normal text-muted-foreground"> {p.lead.phone}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Planned for {formatDateTime(p.scheduledFor, tz)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={
              p.status === "rejected"
                ? "destructive"
                : p.status === "effected"
                  ? "secondary"
                  : "outline"
            }
          >
            {STATUS_LABEL[p.status]}
          </Badge>
          {p.approval === "pending" && <Badge variant="outline">Waiting for approval</Badge>}
          {p.approval === "approved" && (
            <Badge variant="secondary">Approved{p.decidedBy && ` by ${p.decidedBy}`}</Badge>
          )}
          {p.approval === "declined" && (
            <Badge variant="outline">Declined{p.decidedBy && ` by ${p.decidedBy}`}</Badge>
          )}
        </div>
      </div>
      <blockquote className="border-l-2 pl-3 text-sm break-words text-muted-foreground">
        {p.rationale}
      </blockquote>
      {rejection && (
        <p className="text-sm" role="note">
          <span className="font-mono text-xs">{rejection.code}</span> · {rejection.title}.{" "}
          {rejection.detail}
        </p>
      )}
      {(d.approve.isError || d.reject.isError) && (
        <FormAlert>{errText(d.approve.error ?? d.reject.error, "That didn't work.")}</FormAlert>
      )}
      {pending && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={d.approve.isPending} onClick={() => d.approve.mutate(p.id)}>
            {d.approve.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
            <X /> Reject
          </Button>
        </div>
      )}
      {rejecting && (
        <ReasonDialog
          title="Reject this proposal?"
          description={`${ACTION_LABEL[p.action]} for ${p.lead.name ?? "this lead"} won't happen.`}
          confirmLabel="Reject"
          destructive
          pending={d.reject.isPending}
          error={d.reject.error}
          validate={(r) =>
            rejectProposalBody.safeParse({ reason: r }).error?.issues[0]?.message ?? null
          }
          onConfirm={(reason) =>
            d.reject.mutate({ id: p.id, reason }, { onSuccess: () => setRejecting(false) })
          }
          onClose={() => setRejecting(false)}
        />
      )}
    </li>
  );
}
