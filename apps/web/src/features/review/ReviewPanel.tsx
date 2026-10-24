import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  NEXT_STEPS,
  QUEUE_OUTCOMES,
  TEMPERATURES,
  type CallReview,
  type QueueItem,
  type QueueOutcome,
  type Temperature,
} from "@vernacular/contracts";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { zonedLocalToIso } from "@/features/lead360/stage-form";
import { TemperatureTag } from "@/features/leads/LeadsTable";
import { highlightQuotes } from "@/features/review/highlight";
import { useCallReview, useOverride, useResolve, useVerify } from "@/features/review/review-api";
import { ApiCallError, isMissingRoute } from "@/lib/api";
import {
  formatDateTime,
  formatMinSec,
  NEXT_STEP_LABEL,
  STAGE_LABEL,
  TEMPERATURE_LABEL,
} from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

/** What the panel reports when an item is done, so the next one can open in place. */
export interface ReviewResult {
  leadName: string;
  text: string;
}

const errText = (err: unknown, fallback: string) =>
  err instanceof ApiCallError && err.message ? err.message : fallback;

export const OUTCOME_LABEL: Record<QueueOutcome, string> = {
  callback_scheduled: "Callback scheduled",
  visit_booked: "Campus visit booked",
  meeting_booked: "Meeting booked",
  resolved_on_call: "Resolved on a call",
  no_action_needed: "No action needed",
};

/** The side-panel body for one queue item (D4-I4-01). */
export function ReviewPanel({
  item,
  onDone,
}: {
  item: QueueItem;
  onDone: (r: ReviewResult) => void;
}) {
  const lead = item.lead;
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
          <h2 className="text-lg font-semibold break-words">{lead.name ?? "Unnamed lead"}</h2>
          <TemperatureTag value={lead.temperature} />
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="tabular-nums" data-testid="lead-phone">
            {lead.phone ?? "—"}
          </span>
          {" · "}
          {STAGE_LABEL[lead.stage]}
          {lead.programName && ` · ${lead.programName}`}
        </p>
        {item.reason && <p className="text-sm">{item.reason}</p>}
        <Link
          to="/leads/$leadId"
          params={{ leadId: lead.id }}
          className="text-sm font-medium text-primary hover:underline"
        >
          Open Lead 360
        </Link>
      </header>
      {item.callId ? (
        <CallSection callId={item.callId} item={item} onDone={onDone} />
      ) : (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          No call attached to this item.
        </p>
      )}
      {item.kind !== "review_call" && <ResolveForm item={item} onDone={onDone} />}
    </div>
  );
}

function CallSection({
  callId,
  item,
  onDone,
}: {
  callId: string;
  item: QueueItem;
  onDone: (r: ReviewResult) => void;
}) {
  const tz = useTenantTimeZone();
  const q = useCallReview(callId);
  if (q.isPending)
    return <Skeleton className="h-48 w-full" aria-busy="true" aria-label="Loading call" />;
  if (isMissingRoute(q.error))
    return (
      <FormAlert>
        Call review isn&apos;t available yet — the call service hasn&apos;t been switched on.
      </FormAlert>
    );
  if (q.isError)
    return (
      <FormAlert>
        Couldn&apos;t load the call.{" "}
        <button className="underline" onClick={() => void q.refetch()}>
          Try again
        </button>
      </FormAlert>
    );
  const c = q.data;
  const quotes = [
    ...(c.temperatureQuote ? [{ quote: c.temperatureQuote, label: "temperature" }] : []),
    ...c.objections.map((o) => ({ quote: o.quote, label: "objection" })),
  ];
  const hl = highlightQuotes(c.transcriptText, quotes);

  return (
    <section className="space-y-4" aria-label="Call">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {c.direction === "inbound" ? "Inbound" : "Outbound"} call · {formatMinSec(c.durationS)}
          {c.recordedAt && ` · ${formatDateTime(c.recordedAt, tz)}`}
        </p>
        {c.hasRecording ? (
          <audio
            controls
            preload="none"
            src={`/api/calls/${c.callId}/recording`}
            className="w-full"
            aria-label="Call recording"
          />
        ) : (
          <p className="text-sm text-muted-foreground">Recording not available yet.</p>
        )}
      </div>

      <AiLabels c={c} />

      <div>
        <h3 className="mb-1 text-sm font-semibold">Transcript</h3>
        {c.transcriptText ? (
          <p
            className="max-h-72 overflow-y-auto rounded-md border bg-card p-3 text-sm whitespace-pre-wrap break-words"
            data-testid="transcript"
          >
            {hl.segments.map((s, i) =>
              s.labels.length ? (
                <mark
                  key={i}
                  data-labels={s.labels.join(" ")}
                  className={cn(
                    "rounded-sm px-0.5 text-foreground",
                    s.labels.includes("objection") ? "bg-warning/40" : "bg-accent",
                  )}
                >
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No transcript yet.</p>
        )}
        {hl.notFound.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground" role="note">
            Quote not found in transcript: {hl.notFound.map((q) => `“${q}”`).join(", ")}
          </p>
        )}
      </div>

      {item.kind === "review_call" || c.review.state === "pending" ? (
        <ReviewActions c={c} item={item} onDone={onDone} />
      ) : (
        <ReviewState c={c} />
      )}
    </section>
  );
}

function AiLabels({ c }: { c: CallReview }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 rounded-md border bg-card p-3 text-sm sm:grid-cols-[9rem_1fr]">
      <dt className="text-muted-foreground">AI temperature</dt>
      <dd className="min-w-0">
        <TemperatureTag value={c.temperature} />
        {c.temperatureQuote && (
          <q className="mt-1 block text-xs text-muted-foreground italic">{c.temperatureQuote}</q>
        )}
      </dd>
      <dt className="text-muted-foreground">Next step</dt>
      <dd>{c.nextStep ? NEXT_STEP_LABEL[c.nextStep] : "—"}</dd>
      {c.summary && (
        <>
          <dt className="text-muted-foreground">Summary</dt>
          <dd className="min-w-0 break-words">{c.summary}</dd>
        </>
      )}
      {c.objections.length > 0 && (
        <>
          <dt className="text-muted-foreground">Objections</dt>
          <dd className="min-w-0">
            <ul className="space-y-1">
              {c.objections.map((o, i) => (
                <li key={i} className="break-words">
                  <span className="font-medium">{o.type}</span>: <q className="italic">{o.quote}</q>
                </li>
              ))}
            </ul>
          </dd>
        </>
      )}
      {c.needsCounsellor && (
        <>
          <dt className="text-muted-foreground">Needs counsellor</dt>
          <dd className="min-w-0 break-words">{c.needsCounsellorReason ?? "Yes"}</dd>
        </>
      )}
      {(c.languageDetected || c.analysisModel) && (
        <>
          <dt className="text-muted-foreground">Analysis</dt>
          <dd className="text-xs text-muted-foreground">
            {[c.languageDetected, c.analysisModel].filter(Boolean).join(" · ")}
          </dd>
        </>
      )}
    </dl>
  );
}

function ReviewState({ c }: { c: CallReview }) {
  return (
    <p className="flex items-center gap-2 text-sm" role="status">
      <CheckCircle2 className="size-4 text-primary" aria-hidden />
      {c.review.state === "verified" ? "Verified" : "Overridden"}
      {c.review.temperature && ` · ${TEMPERATURE_LABEL[c.review.temperature]}`}
      {c.review.byName && ` by ${c.review.byName}`}
    </p>
  );
}

/** Verify the AI's label, or override it with a reason. Both insert an observation server-side. */
function ReviewActions({
  c,
  item,
  onDone,
}: {
  c: CallReview;
  item: QueueItem;
  onDone: (r: ReviewResult) => void;
}) {
  const verify = useVerify(c.callId, c.leadId);
  const override = useOverride(c.callId, c.leadId);
  const [overriding, setOverriding] = useState(false);
  const [temp, setTemp] = useState<Temperature | "">("");
  const [step, setStep] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const name = item.lead.name ?? "Lead";
  const busy = verify.isPending || override.isPending;

  const submitOverride = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!temp) errs.temperature = "Choose the correct temperature";
    if (reason.trim().length < 3) errs.reason = "Say why (at least 3 characters)";
    setErrors(errs);
    if (Object.keys(errs).length || !temp) return;
    const nextStep = NEXT_STEPS.find((s) => s === step);
    override.mutate(
      { temperature: temp, reason: reason.trim(), ...(nextStep ? { nextStep } : {}) },
      {
        onSuccess: (r) =>
          onDone({
            leadName: name,
            text: `Overridden to ${TEMPERATURE_LABEL[r.review.temperature ?? temp]}`,
          }),
      },
    );
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      {!overriding ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !c.temperature}
            onClick={() =>
              verify.mutate(undefined, {
                onSuccess: (r) =>
                  onDone({
                    leadName: name,
                    text: `Verified: ${TEMPERATURE_LABEL[r.review.temperature ?? c.temperature ?? "invalid"]}`,
                  }),
              })
            }
          >
            {verify.isPending && <Loader2 className="animate-spin" />}
            Verify{c.temperature ? `: ${TEMPERATURE_LABEL[c.temperature]} is right` : ""}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setOverriding(true)}>
            Override
          </Button>
        </div>
      ) : (
        <form noValidate onSubmit={submitOverride} className="space-y-3" aria-label="Override">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`ov-temp-${c.callId}`}>Correct temperature</Label>
              <select
                id={`ov-temp-${c.callId}`}
                value={temp}
                onChange={(e) => setTemp(TEMPERATURES.find((t) => t === e.target.value) ?? "")}
                className="h-9 w-full rounded-md border bg-card px-2 text-sm"
              >
                <option value="">Choose…</option>
                {TEMPERATURES.map((t) => (
                  <option key={t} value={t}>
                    {TEMPERATURE_LABEL[t]}
                  </option>
                ))}
              </select>
              {errors.temperature && (
                <p className="text-sm text-destructive">{errors.temperature}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ov-step-${c.callId}`}>Next step (optional)</Label>
              <select
                id={`ov-step-${c.callId}`}
                value={step}
                onChange={(e) => setStep(e.target.value)}
                className="h-9 w-full rounded-md border bg-card px-2 text-sm"
              >
                <option value="">Keep</option>
                {NEXT_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {NEXT_STEP_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ov-reason-${c.callId}`}>Reason</Label>
            <Textarea
              id={`ov-reason-${c.callId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
            />
            {errors.reason && <p className="text-sm text-destructive">{errors.reason}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {override.isPending && <Loader2 className="animate-spin" />}
              Save override
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOverriding(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {(verify.isError || override.isError) && (
        <FormAlert>
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="size-3.5" />
            {isMissingRoute(verify.error ?? override.error)
              ? "Saving reviews isn't available yet."
              : errText(verify.error ?? override.error, "Couldn't save the review.")}
          </span>
        </FormAlert>
      )}
    </div>
  );
}

const NEEDS_TIME: readonly QueueOutcome[] = [
  "callback_scheduled",
  "visit_booked",
  "meeting_booked",
];

/** Resolve a needs-counsellor / SLA item: outcome (+ follow-up time) + note. */
function ResolveForm({ item, onDone }: { item: QueueItem; onDone: (r: ReviewResult) => void }) {
  const tz = useTenantTimeZone();
  const resolve = useResolve(item.id, item.callId, item.lead.id);
  const [outcome, setOutcome] = useState<QueueOutcome | "">("");
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!outcome) errs.outcome = "Choose what you did";
    const followUpAt = when ? zonedLocalToIso(when, tz) : null;
    if (outcome && NEEDS_TIME.includes(outcome) && !followUpAt) errs.when = "Pick a date and time";
    if (note.trim().length < 3) errs.note = "Add a short note (at least 3 characters)";
    setErrors(errs);
    if (Object.keys(errs).length || !outcome) return;
    resolve.mutate(
      {
        outcome,
        note: note.trim(),
        ...(followUpAt && NEEDS_TIME.includes(outcome) ? { followUpAt } : {}),
      },
      {
        onSuccess: () =>
          onDone({ leadName: item.lead.name ?? "Lead", text: OUTCOME_LABEL[outcome] }),
      },
    );
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      className="space-y-3 rounded-md border p-3"
      aria-label="Resolve"
    >
      <h3 className="text-sm font-semibold">Outcome</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`out-${item.id}`}>What did you do?</Label>
          <select
            id={`out-${item.id}`}
            value={outcome}
            onChange={(e) => setOutcome(QUEUE_OUTCOMES.find((o) => o === e.target.value) ?? "")}
            className="h-9 w-full rounded-md border bg-card px-2 text-sm"
          >
            <option value="">Choose…</option>
            {QUEUE_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </option>
            ))}
          </select>
          {errors.outcome && <p className="text-sm text-destructive">{errors.outcome}</p>}
        </div>
        {outcome && NEEDS_TIME.includes(outcome) && (
          <div className="space-y-1.5">
            <Label htmlFor={`when-${item.id}`}>When ({tz})</Label>
            <input
              id={`when-${item.id}`}
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
            />
            {errors.when && <p className="text-sm text-destructive">{errors.when}</p>}
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`note-${item.id}`}>Note</Label>
        <Textarea
          id={`note-${item.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
        />
        {errors.note && <p className="text-sm text-destructive">{errors.note}</p>}
      </div>
      {resolve.isError && (
        <FormAlert>
          {isMissingRoute(resolve.error)
            ? "Resolving items isn't available yet."
            : errText(resolve.error, "Couldn't save.")}
        </FormAlert>
      )}
      <Button type="submit" disabled={resolve.isPending}>
        {resolve.isPending && <Loader2 className="animate-spin" />}
        Resolve
      </Button>
    </form>
  );
}
