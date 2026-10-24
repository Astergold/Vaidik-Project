import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Campaign, CampaignAction } from "@vernacular/contracts";
import {
  AlertTriangle,
  Loader2,
  Megaphone,
  Pause,
  Play,
  PlugZap,
  Plus,
  SearchX,
  Square,
} from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  actionsFor,
  formatSchedule,
  progressPct,
  STATUS_LABEL,
} from "@/features/campaigns/campaign-logic";
import { formatCount, STAGE_LABEL, TEMPERATURE_LABEL } from "@/lib/labels";
import type { Remote } from "@/lib/remote";
import { cn } from "@/lib/utils";

/** Presentational campaign views (D3-I4-04): plain props, every state renderable in tests without the API. */

export function CampaignUnavailable() {
  return (
    <StateCard icon={PlugZap} title="Campaign service not available yet">
      Campaigns need a server feature that hasn&apos;t been switched on yet. Nothing was saved and
      no calls were placed.
    </StateCard>
  );
}

export function CampaignNotFound() {
  return (
    <StateCard
      icon={SearchX}
      title="Campaign not found"
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/campaigns">Back to campaigns</Link>
        </Button>
      }
    >
      It may have been removed, or the link is wrong.
    </StateCard>
  );
}

export function StatusBadge({ status }: { status: Campaign["status"] }) {
  return (
    <Badge
      variant={
        status === "running"
          ? "default"
          : status === "draft" || status === "paused"
            ? "secondary"
            : "outline"
      }
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function ProgressBar({ p }: { p: Campaign["progress"] }) {
  const pct = progressPct(p);
  return (
    <div
      className="h-2 min-w-24 rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Dialled"
    >
      <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CampaignsListView({
  state,
  unavailable,
  canCreate,
}: {
  state: Remote<Campaign[]>;
  unavailable: boolean;
  canCreate: boolean;
}) {
  if (unavailable) return <CampaignUnavailable />;
  if (state.kind === "loading") {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading campaigns">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <StateCard
        icon={AlertTriangle}
        title="Couldn't load campaigns"
        tone="error"
        action={
          <Button variant="outline" size="sm" onClick={state.retry}>
            Try again
          </Button>
        }
      >
        {state.message}
      </StateCard>
    );
  }
  if (state.data.length === 0) {
    return (
      <StateCard
        icon={Megaphone}
        title="No campaigns yet"
        action={
          canCreate && (
            <Button asChild size="sm">
              <Link to="/campaigns/new">
                <Plus /> New campaign
              </Link>
            </Button>
          )
        }
      >
        A campaign calls a chosen set of leads with an AI agent, inside your calling hours.
      </StateCard>
    );
  }
  return (
    <ul className="space-y-2">
      {state.data.map((c) => (
        <li key={c.id}>
          <Link
            to="/campaigns/$campaignId"
            params={{ campaignId: c.id }}
            className="block rounded-lg border bg-card p-4 hover:bg-accent/40"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold break-words">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.workflow.name} · waves of {c.batchSize}
                  {c.waves.length > 0 && ` · wave ${c.waves.length}`}
                </p>
              </div>
              <StatusBadge status={c.status} />
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1">
                <ProgressBar p={c.progress} />
              </div>
              <span className="whitespace-nowrap tabular-nums">
                {formatCount(c.progress.dialed)} / {formatCount(c.progress.total)} dialled ·{" "}
                {formatCount(c.progress.connected)} connected
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const CONFIRM: Record<
  "start" | "stop",
  { title: string; body: (c: Campaign, tz: string) => string; cta: string }
> = {
  start: {
    title: "Start calling?",
    body: (c, tz) =>
      `The "${c.workflow.name}" workflow will call the matching leads in waves of ${c.batchSize}, ${c.scheduleEnabled ? formatSchedule(c.schedule, tz) : "within your calling hours"}, ${c.maxConcurrent ?? "the default number of"} calls at a time. Leads that are on Do-Not-Call, opted out or without consent are skipped before anything is sent.`,
    cta: "Start campaign",
  },
  stop: {
    title: "Stop this campaign?",
    body: () =>
      "The current wave is paused on the calling platform and nobody else is called. Results of calls already made are kept. A stopped campaign can't be restarted.",
    cta: "Stop campaign",
  },
};

/** Inline confirmation (not a modal): states what will happen; the server's answer is what the page then shows. */
export function ConfirmPanel({
  kind,
  campaign: c,
  tz,
  pending,
  onConfirm,
  onCancel,
}: {
  kind: "start" | "stop";
  campaign: Campaign;
  tz: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const copy = CONFIRM[kind];
  return (
    <div
      role="alertdialog"
      aria-label={copy.title}
      className={cn(
        "space-y-3 rounded-lg border p-4",
        kind === "stop" ? "border-destructive/40" : "border-primary/40",
      )}
    >
      <p className="font-medium">{copy.title}</p>
      <p className="text-sm text-muted-foreground">{copy.body(c, tz)}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={kind === "stop" ? "destructive" : "default"}
          onClick={onConfirm}
          disabled={pending}
        >
          {pending && <Loader2 className="animate-spin" />}
          {copy.cta}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function CampaignDetailView({
  campaign: c,
  tz,
  confirm,
  pendingAction,
  actionError,
  onAsk,
  onAction,
  onCancelConfirm,
}: {
  campaign: Campaign;
  tz: string;
  confirm: "start" | "stop" | null;
  pendingAction: CampaignAction | null;
  actionError: string | null;
  onAsk: (kind: "start" | "stop") => void;
  onAction: (a: CampaignAction) => void;
  onCancelConfirm: () => void;
}) {
  const a = actionsFor(c.status);
  const p = c.progress;
  const busy = pendingAction !== null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{c.name}</h1>
          <p className="text-sm text-muted-foreground">
            {c.workflow.name}
            {c.aiAgent && ` · ${c.aiAgent.displayName}`} ·{" "}
            {c.scheduleEnabled ? formatSchedule(c.schedule, tz) : "Within your calling hours"}
          </p>
        </div>
        <StatusBadge status={c.status} />
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Campaign actions">
        {a.start && (
          <Button onClick={() => onAsk("start")} disabled={busy || confirm !== null}>
            <Play /> Start
          </Button>
        )}
        {a.resume && (
          <Button onClick={() => onAction("resume")} disabled={busy}>
            {pendingAction === "resume" ? <Loader2 className="animate-spin" /> : <Play />} Resume
          </Button>
        )}
        {a.pause && (
          <Button variant="outline" onClick={() => onAction("pause")} disabled={busy}>
            {pendingAction === "pause" ? <Loader2 className="animate-spin" /> : <Pause />} Pause
          </Button>
        )}
        {a.stop && (
          <Button
            variant="outline"
            onClick={() => onAsk("stop")}
            disabled={busy || confirm !== null}
          >
            <Square /> Stop
          </Button>
        )}
        {a.edit && (
          <Button asChild variant="ghost">
            <Link to="/campaigns/$campaignId/edit" params={{ campaignId: c.id }}>
              Edit
            </Link>
          </Button>
        )}
      </div>
      {confirm && (
        <ConfirmPanel
          kind={confirm}
          campaign={c}
          tz={tz}
          pending={pendingAction === confirm}
          onConfirm={() => onAction(confirm)}
          onCancel={onCancelConfirm}
        />
      )}
      {actionError && <FormAlert>{actionError}</FormAlert>}
      {c.lastError && (
        <FormAlert>
          <span className="font-medium">Calling platform:</span> {c.lastError}
        </FormAlert>
      )}

      <section aria-label="Progress" className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <h2 className="font-semibold">Progress</h2>
          {c.status === "running" && (
            <span className="text-xs text-muted-foreground">
              Updates every few seconds
              {c.lastSyncedAt && ` · synced ${new Date(c.lastSyncedAt).toLocaleTimeString()}`}
            </span>
          )}
        </div>
        <ProgressBar p={p} />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          {(
            [
              ["Leads", p.total],
              ["Dialled", p.dialed],
              ["Connected", p.connected],
              ["Not connected", p.failed],
              ["Still to call", p.pending],
              ["Skipped", p.skipped],
            ] as const
          ).map(([label, n]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{formatCount(n)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {c.waves.length > 0 && <WavesTable waves={c.waves} />}

      <section aria-label="Settings" className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-2 font-semibold">Settings</h2>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[12rem_1fr]">
          <dt className="text-muted-foreground">Which leads</dt>
          <dd>{describeFilter(c.leadFilter)}</dd>
          <dt className="text-muted-foreground">Wave size</dt>
          <dd>{c.batchSize} leads</dd>
          <dt className="text-muted-foreground">At once</dt>
          <dd>{c.maxConcurrent === null ? "Default" : `${c.maxConcurrent} calls`}</dd>
          <dt className="text-muted-foreground">Retries</dt>
          <dd>
            {c.retry.enabled
              ? `Up to ${c.retry.maxRetries}, ${c.retry.retryDelaySeconds} s apart, on ${
                  [
                    c.retry.onBusy && "busy",
                    c.retry.onNoAnswer && "no answer",
                    c.retry.onVoicemail && "voicemail",
                  ]
                    .filter(Boolean)
                    .join(", ") || "nothing"
                }`
              : "Off"}
          </dd>
          <dt className="text-muted-foreground">Circuit breaker</dt>
          <dd>
            {c.circuitBreaker.enabled
              ? `Auto-pauses above ${c.circuitBreaker.failureThresholdPct} % failures (≥ ${c.circuitBreaker.minCallsInWindow} calls in ${c.circuitBreaker.windowSeconds} s)`
              : "Off"}
          </dd>
        </dl>
      </section>
    </div>
  );
}

function describeFilter(f: Campaign["leadFilter"]): ReactNode {
  const parts = [
    f.stage?.length ? `Stage: ${f.stage.map((s) => STAGE_LABEL[s]).join(", ")}` : null,
    f.temperature?.length
      ? `Temperature: ${f.temperature.map((t) => TEMPERATURE_LABEL[t]).join(", ")}`
      : null,
    f.sourceId?.length ? `${f.sourceId.length} source(s)` : null,
    f.counsellorId?.length ? `${f.counsellorId.length} counsellor(s)` : null,
    f.createdFrom || f.createdTo ? `Created ${f.createdFrom ?? "…"} – ${f.createdTo ?? "…"}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All leads you can see";
}

const WAVE_LABEL: Record<Campaign["waves"][number]["state"], string> = {
  pending: "Preparing",
  created: "Created",
  running: "Calling",
  paused: "Paused",
  completed: "Done",
  failed: "Failed",
};

/** One row per wave (= one platform campaign). Scrolls inside its own box on phones. */
export function WavesTable({ waves }: { waves: Campaign["waves"] }) {
  return (
    <section aria-label="Waves" className="rounded-lg border bg-card p-4 text-sm">
      <h2 className="mb-2 font-semibold">Waves</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">Wave</th>
              <th className="py-1 pr-3 font-medium">Status</th>
              <th className="py-1 pr-3 font-medium">Leads</th>
              <th className="py-1 pr-3 font-medium">Called</th>
              <th className="py-1 font-medium">Failed</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {waves.map((w) => (
              <tr key={w.waveNo} className="border-t">
                <td className="py-2 pr-3">{w.waveNo}</td>
                <td className="py-2 pr-3">{WAVE_LABEL[w.state]}</td>
                <td className="py-2 pr-3">{formatCount(w.totalRows)}</td>
                <td className="py-2 pr-3">{formatCount(w.processedRows)}</td>
                <td className="py-2">{formatCount(w.failedRows)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
