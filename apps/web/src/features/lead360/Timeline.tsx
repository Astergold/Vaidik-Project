import { useState, type FormEvent, type ReactNode } from "react";
import type { TimelineEvent } from "@vernacular/contracts";
import {
  AlertTriangle,
  ArrowRight,
  FileAudio,
  FileText,
  Flame,
  Loader2,
  PhoneIncoming,
  PhoneOutgoing,
  StickyNote,
} from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TemperatureTag } from "@/features/leads/LeadsTable";
import { useAddNote, useTimeline } from "@/features/lead360/lead360-api";
import { flattenTimeline, groupByDay, humanize } from "@/features/lead360/timeline-paging";
import { ApiCallError } from "@/lib/api";
import { formatMinSec, stageLabel } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";

/** Newest-first activity with "Load older activity" (cursor from the API, passed back verbatim). */
export function Timeline({ leadId }: { leadId: string }) {
  const tz = useTenantTimeZone();
  const q = useTimeline(leadId, true);
  const events = q.data ? flattenTimeline(q.data.pages) : [];

  return (
    <section aria-labelledby="timeline-h" className="space-y-4">
      <h2 id="timeline-h" className="text-base font-semibold">
        Activity
      </h2>
      <NoteComposer leadId={leadId} />

      {q.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading activity">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <div className="rounded-lg border border-destructive/40 bg-card p-4 text-sm">
          <p className="font-medium">Couldn&apos;t load the activity.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void q.refetch()}>
            Try again
          </Button>
        </div>
      ) : events.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          No activity yet. Calls, stage changes and notes will appear here.
        </p>
      ) : (
        <>
          {groupByDay(events, tz).map((g) => (
            <div key={g.day}>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {g.label}
              </h3>
              <ol className="space-y-2">
                {g.events.map((e) => (
                  <li key={e.id}>
                    <EventCard event={e} tz={tz} />
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {q.hasNextPage && (
            <Button
              variant="outline"
              className="w-full"
              disabled={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              {q.isFetchingNextPage && <Loader2 className="animate-spin" />}
              Load older activity
            </Button>
          )}
          {q.isFetchNextPageError && (
            <p className="text-sm text-destructive">Couldn&apos;t load more. Try again.</p>
          )}
        </>
      )}
    </section>
  );
}

function EventCard({ event: e, tz }: { event: TimelineEvent; tz: string }) {
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(e.at));
  switch (e.type) {
    case "call": {
      const d = e.data;
      const Icon = d.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
      return (
        <Card
          icon={<Icon className="size-4" />}
          time={time}
          title={`${d.direction === "inbound" ? "Inbound" : "Outbound"} call · ${humanize(d.status)}`}
          meta={[d.durationS ? formatMinSec(d.durationS) : null, d.agentName]
            .filter(Boolean)
            .join(" · ")}
        >
          {d.disposition && <p>{humanize(d.disposition)}</p>}
          {(d.hasRecording || d.hasTranscript) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {d.hasRecording && (
                <Button size="xs" variant="outline" disabled aria-describedby={`na-${e.id}`}>
                  <FileAudio /> Play recording
                </Button>
              )}
              {d.hasTranscript && (
                <Button size="xs" variant="outline" disabled aria-describedby={`na-${e.id}`}>
                  <FileText /> View transcript
                </Button>
              )}
              <span id={`na-${e.id}`} className="text-xs text-muted-foreground">
                Not available yet
              </span>
            </div>
          )}
        </Card>
      );
    }
    case "stage_change": {
      const d = e.data;
      const by =
        d.actorName ??
        {
          user: "a team member",
          ai: "the AI agent",
          system: "the system",
          integration: "an integration",
        }[d.actor];
      return (
        <Card
          icon={<ArrowRight className="size-4" />}
          time={time}
          title={
            d.from
              ? `${stageLabel(d.from)} → ${stageLabel(d.to)}`
              : `Created as ${stageLabel(d.to)}`
          }
          meta={`by ${by}`}
        >
          {d.reason && <p className="whitespace-pre-wrap">“{d.reason}”</p>}
        </Card>
      );
    }
    case "note": {
      const d = e.data;
      return (
        <Card
          icon={<StickyNote className="size-4" />}
          time={time}
          title={d.kind === "outcome" ? "Outcome" : d.kind === "comment" ? "Comment" : "Note"}
          meta={d.authorName ? `by ${d.authorName}` : undefined}
        >
          <p className="whitespace-pre-wrap break-words text-foreground">{d.body}</p>
        </Card>
      );
    }
    case "temperature": {
      const d = e.data;
      const by =
        d.observerName ??
        { ai_analyst: "AI analyst", counsellor: "a counsellor", system: "the system" }[d.source];
      return (
        <Card
          icon={<Flame className="size-4" />}
          time={time}
          title="Temperature"
          meta={`rated by ${by}`}
        >
          <TemperatureTag value={d.value} />
          {d.quote && (
            <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-foreground italic">
              “{d.quote}”
            </blockquote>
          )}
          {d.reason && <p className="mt-1">{d.reason}</p>}
        </Card>
      );
    }
  }
}

function Card({
  icon,
  title,
  meta,
  time,
  children,
}: {
  icon: ReactNode;
  title: string;
  meta?: string;
  time: string;
  children?: ReactNode;
}) {
  return (
    <article className="flex gap-3 rounded-lg border bg-card p-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="font-medium text-foreground">{title}</p>
          <time className="text-xs whitespace-nowrap">{time}</time>
        </div>
        {meta && <p className="text-xs">{meta}</p>}
        {children && <div className="mt-1">{children}</div>}
      </div>
    </article>
  );
}

function NoteComposer({ leadId }: { leadId: string }) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"note" | "outcome">("note");
  const [error, setError] = useState<string | null>(null);
  const add = useAddNote(leadId);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return setError("Write something first");
    setError(null);
    add.mutate(
      { body: body.trim(), kind },
      {
        onSuccess: () => setBody(""),
        onError: (err) =>
          setError(err instanceof ApiCallError ? err.message : "Couldn't save the note"),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-2 rounded-lg border bg-card p-3">
      <Label htmlFor="note-body" className="sr-only">
        Add a note
      </Label>
      <Textarea
        id="note-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a note about this lead…"
        maxLength={4000}
        rows={2}
        aria-invalid={error ? true : undefined}
      />
      {error && (
        <FormAlert>
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="size-3.5" /> {error}
          </span>
        </FormAlert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value === "outcome" ? "outcome" : "note")}
            className="h-8 rounded-md border bg-card px-1.5 text-foreground"
          >
            <option value="note">Note</option>
            <option value="outcome">Outcome</option>
          </select>
        </label>
        <Button type="submit" size="sm" disabled={add.isPending}>
          {add.isPending && <Loader2 className="animate-spin" />}
          Add note
        </Button>
      </div>
    </form>
  );
}
