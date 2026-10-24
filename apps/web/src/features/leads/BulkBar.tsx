import { useState } from "react";
import {
  bulkLeadsBody,
  CORE_STAGES,
  type BulkLeadsResult,
  type BulkTarget,
  type CoreStage,
} from "@vernacular/contracts";
import { Download, Loader2, Megaphone, MoveRight, UserPlus, X } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCampaigns } from "@/features/campaigns/campaigns-api";
import { useLeadFilterOptions } from "@/features/leads/LeadFilters";
import { useBulkLeads } from "@/features/leads/leads-views-api";
import { isMissingRoute } from "@/lib/api";
import { formatCount, STAGE_LABEL } from "@/lib/labels";
import { errText } from "@/lib/seam";

type Mode = "assign" | "stage" | "add_to_campaign";

const ACTION_DONE: Record<BulkLeadsResult["action"], string> = {
  assign: "assigned",
  stage: "moved",
  add_to_campaign: "added to the campaign",
  export: "queued for export",
};

/** Plain-language outcome from the server's numbers. */
export function describeResult(r: BulkLeadsResult): string {
  const main = `${formatCount(r.affected)} lead${r.affected === 1 ? "" : "s"} ${ACTION_DONE[r.action]}`;
  const skipped = r.skipped.length
    ? `; ${formatCount(r.skipped.length)} skipped (${[...new Set(r.skipped.map((s) => s.reason))].join(", ")})`
    : "";
  const exp = r.action === "export" ? " — download it from Reports → Exports when it's ready" : "";
  return `${main}${skipped}${exp}.`;
}

/**
 * Floating bulk action bar (D6-I4-04b) for managers. Every action is one POST /api/leads/bulk; the server writes
 * (stage changes through moveStage with the reason), and the list is refetched afterwards.
 */
export function BulkBar({
  count,
  target,
  onClear,
}: {
  count: number;
  target: BulkTarget;
  onClear: () => void;
}) {
  const bulk = useBulkLeads();
  const [mode, setMode] = useState<Mode | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const run = (body: Parameters<typeof bulk.mutate>[0]) =>
    bulk.mutate(body, {
      onSuccess: (r) => {
        setResult(describeResult(r));
        setMode(null);
        onClear();
      },
    });

  const visible = count > 0 || result !== null || (bulk.isError && !mode);
  return (
    <>
      {visible && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-lg"
        >
          <p className="mr-auto text-sm font-medium">
            {count > 0 ? `${formatCount(count)} selected` : result}
          </p>
          {count > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => setMode("assign")}>
                <UserPlus /> Assign
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMode("stage")}>
                <MoveRight /> Change stage
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMode("add_to_campaign")}>
                <Megaphone /> Add to campaign
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulk.isPending}
                onClick={() => run({ action: "export", target })}
              >
                {bulk.isPending && !mode ? <Loader2 className="animate-spin" /> : <Download />}
                Export
              </Button>
            </>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={count > 0 ? "Clear selection" : "Dismiss"}
            onClick={() => (count > 0 ? onClear() : setResult(null))}
          >
            <X />
          </Button>
          {bulk.isError && !mode && (
            <p role="alert" className="w-full text-sm text-destructive">
              {isMissingRoute(bulk.error)
                ? "Bulk actions aren't available yet."
                : errText(bulk.error, "That didn't work.")}
            </p>
          )}
        </div>
      )}
      {mode && (
        <BulkDialog
          mode={mode}
          count={count}
          target={target}
          pending={bulk.isPending}
          error={bulk.error}
          onRun={run}
          onClose={() => {
            bulk.reset();
            setMode(null);
          }}
        />
      )}
    </>
  );
}

function BulkDialog({
  mode,
  count,
  target,
  pending,
  error,
  onRun,
  onClose,
}: {
  mode: Mode;
  count: number;
  target: BulkTarget;
  pending: boolean;
  error: unknown;
  onRun: (b: Parameters<ReturnType<typeof useBulkLeads>["mutate"]>[0]) => void;
  onClose: () => void;
}) {
  const options = useLeadFilterOptions();
  const campaigns = useCampaigns();
  const [counsellorId, setCounsellorId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [to, setTo] = useState<CoreStage>("lost");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const title = {
    assign: "Assign to a counsellor",
    stage: "Change stage",
    add_to_campaign: "Add to a campaign",
  }[mode];
  const submit = () => {
    const raw =
      mode === "assign"
        ? { action: mode, target, counsellorId }
        : mode === "stage"
          ? { action: mode, target, to, reason }
          : { action: mode, target, campaignId };
    const r = bulkLeadsBody.safeParse(raw);
    if (!r.success) return setProblem(r.error.issues[0]?.message ?? "Check the form");
    setProblem(null);
    onRun(r.data);
  };
  const editable =
    campaigns.data?.items.filter((c) => c.status === "draft" || c.status === "paused") ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {formatCount(count)} leads. The server applies it and reports anything it skipped.
        </DialogDescription>
        <div className="space-y-3">
          {mode === "assign" && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-counsellor">Counsellor</Label>
              <select
                id="bulk-counsellor"
                value={counsellorId}
                onChange={(e) => setCounsellorId(e.target.value)}
                className="h-9 w-full rounded-md border bg-card px-2 text-sm"
                disabled={!options.data}
              >
                <option value="">
                  {options.data
                    ? "Choose…"
                    : options.isError
                      ? "Couldn't load counsellors"
                      : "Loading…"}
                </option>
                {options.data?.counsellors
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {mode === "stage" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-stage">Move to</Label>
                <select
                  id="bulk-stage"
                  value={to}
                  onChange={(e) => setTo(e.target.value as CoreStage)}
                  className="h-9 w-full rounded-md border bg-card px-2 text-sm"
                >
                  {CORE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-reason">Reason (recorded on every lead)</Label>
                <Textarea
                  id="bulk-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="e.g. Joined another college"
                />
              </div>
            </>
          )}
          {mode === "add_to_campaign" && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-campaign">Campaign</Label>
              <select
                id="bulk-campaign"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="h-9 w-full rounded-md border bg-card px-2 text-sm"
                disabled={!campaigns.data}
              >
                <option value="">
                  {campaigns.data
                    ? editable.length
                      ? "Choose…"
                      : "No draft or paused campaigns"
                    : isMissingRoute(campaigns.error)
                      ? "Campaigns aren't available yet"
                      : campaigns.isError
                        ? "Couldn't load campaigns"
                        : "Loading…"}
                </option>
                {editable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {problem && <p className="text-sm text-destructive">{problem}</p>}
          {error ? (
            <FormAlert>
              {isMissingRoute(error)
                ? "Bulk actions aren't available yet."
                : errText(error, "That didn't work.")}
            </FormAlert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Apply to {formatCount(count)} leads
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
