import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { leadsListResponse, MEETING_MODES, type Meeting, type Visit } from "@vernacular/contracts";
import { Bot, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { todayIn } from "@/features/dashboard/dashboard-search";
import { zonedLocalToIso } from "@/features/lead360/stage-form";
import {
  ACTION_LABEL,
  meetingActions,
  needsNote,
  visitActions,
  type OutcomeAction,
} from "@/features/visits/calendar";
import {
  useCreateMeeting,
  useCreateVisit,
  usePatchMeeting,
  usePatchVisit,
  useVisitSlots,
} from "@/features/visits/visits-api";
import { apiGet, ApiCallError, isMissingRoute } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";

/** Shared pieces for visits and meetings (D4-I4-02): cards with per-status actions and the dialogs. */
export const VISIT_STATUS_LABEL: Record<Visit["status"], string> = {
  booked: "Booked",
  rescheduled: "Rescheduled",
  attended: "Attended",
  no_show: "No-show",
  cancelled: "Cancelled",
};
export const MEETING_STATUS_LABEL: Record<Meeting["status"], string> = {
  scheduled: "Scheduled",
  attended: "Attended",
  no_show: "No-show",
  cancelled: "Cancelled",
};
const MODE_LABEL: Record<Meeting["mode"], string> = {
  phone: "Phone",
  video: "Video",
  in_person: "In person",
};
const errText = (err: unknown, fallback: string) =>
  err instanceof ApiCallError && err.message ? err.message : fallback;

type Target = { kind: "visit"; item: Visit } | { kind: "meeting"; item: Meeting };

export function VisitCard({ visit: v, showLead = true }: { visit: Visit; showLead?: boolean }) {
  const tz = useTenantTimeZone();
  const [action, setAction] = useState<OutcomeAction | null>(null);
  return (
    <article
      className="space-y-2 rounded-lg border bg-card p-3"
      aria-label={`Visit ${v.lead.name ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {showLead && <p className="font-medium break-words">{v.lead.name ?? "Unnamed lead"}</p>}
          <p className="text-sm">
            {formatDateTime(v.scheduledAt, tz)} · {v.campus}
          </p>
          {showLead && (
            <p className="text-xs text-muted-foreground tabular-nums">{v.lead.phone ?? "—"}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {v.bookedBy === "ai" ? (
            <Badge variant="outline" title="Booked by the AI agent">
              <Bot /> AI
            </Badge>
          ) : (
            v.createdBy && <Badge variant="outline">{v.createdBy.name}</Badge>
          )}
          <Badge
            variant={v.status === "booked" || v.status === "rescheduled" ? "secondary" : "outline"}
          >
            {VISIT_STATUS_LABEL[v.status]}
          </Badge>
        </div>
      </div>
      {v.outcomeNote && (
        <p className="text-sm text-muted-foreground break-words">“{v.outcomeNote}”</p>
      )}
      <Actions actions={visitActions(v.status)} onPick={setAction} />
      {action && (
        <OutcomeDialog
          target={{ kind: "visit", item: v }}
          action={action}
          onClose={() => setAction(null)}
        />
      )}
    </article>
  );
}

export function MeetingCard({
  meeting: m,
  showLead = true,
}: {
  meeting: Meeting;
  showLead?: boolean;
}) {
  const tz = useTenantTimeZone();
  const [action, setAction] = useState<OutcomeAction | null>(null);
  return (
    <article
      className="space-y-2 rounded-lg border bg-card p-3"
      aria-label={`Meeting ${m.lead.name ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {showLead && <p className="font-medium break-words">{m.lead.name ?? "Unnamed lead"}</p>}
          <p className="text-sm">
            {formatDateTime(m.scheduledAt, tz)} · {m.durationMin} min · {MODE_LABEL[m.mode]}
          </p>
          {m.counsellor && (
            <p className="text-xs text-muted-foreground">with {m.counsellor.name}</p>
          )}
        </div>
        <Badge variant={m.status === "scheduled" ? "secondary" : "outline"}>
          {MEETING_STATUS_LABEL[m.status]}
        </Badge>
      </div>
      {m.note && <p className="text-sm text-muted-foreground break-words">“{m.note}”</p>}
      <Actions actions={meetingActions(m.status)} onPick={setAction} />
      {action && (
        <OutcomeDialog
          target={{ kind: "meeting", item: m }}
          action={action}
          onClose={() => setAction(null)}
        />
      )}
    </article>
  );
}

function Actions({
  actions,
  onPick,
}: {
  actions: OutcomeAction[];
  onPick: (a: OutcomeAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((a) => (
        <Button
          key={a}
          size="xs"
          variant={a === "attended" ? "default" : "outline"}
          onClick={() => onPick(a)}
        >
          {ACTION_LABEL[a]}
        </Button>
      ))}
    </div>
  );
}

/** Reschedule (visits from real slots; meetings any time) or close with a note. The server does any stage move. */
export function OutcomeDialog({
  target,
  action,
  onClose,
}: {
  target: Target;
  action: OutcomeAction;
  onClose: () => void;
}) {
  const tz = useTenantTimeZone();
  const leadId = target.item.lead.id;
  const pv = usePatchVisit(target.item.id, leadId);
  const pm = usePatchMeeting(target.item.id, leadId);
  const m = target.kind === "visit" ? pv : pm;
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(""); // meetings: datetime-local
  const [slot, setSlot] = useState<string | null>(null); // visits: an ISO slot from the API
  const [day, setDay] = useState(todayIn(tz));
  const [error, setError] = useState<string | null>(null);
  const campus = target.kind === "visit" ? target.item.campus : "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (needsNote(action) && note.trim().length < 3)
      return setError("Add a short note (at least 3 characters)");
    if (action === "reschedule") {
      const at = target.kind === "visit" ? slot : zonedLocalToIso(when, tz);
      if (!at)
        return setError(
          target.kind === "visit"
            ? "Pick one of the available slots"
            : "Pick the new date and time",
        );
      setError(null);
      if (target.kind === "visit")
        pv.mutate(
          {
            status: "rescheduled",
            scheduledAt: at,
            ...(note.trim() ? { outcomeNote: note.trim() } : {}),
          },
          { onSuccess: onClose },
        );
      else
        pm.mutate(
          { scheduledAt: at, ...(note.trim() ? { note: note.trim() } : {}) },
          { onSuccess: onClose },
        );
      return;
    }
    setError(null);
    const status = action;
    if (target.kind === "visit")
      pv.mutate(
        { status, ...(note.trim() ? { outcomeNote: note.trim() } : {}) },
        { onSuccess: onClose },
      );
    else
      pm.mutate({ status, ...(note.trim() ? { note: note.trim() } : {}) }, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {ACTION_LABEL[action]} — {target.item.lead.name ?? "lead"}
          </DialogTitle>
          <DialogDescription>
            {target.kind === "visit" && action === "attended"
              ? "The lead moves to Visited automatically."
              : target.kind === "visit" && action === "reschedule"
                ? "Reminders move with the visit (24 h and 2 h before)."
                : `Current: ${formatDateTime(target.item.scheduledAt, tz)}`}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="space-y-3">
          {action === "reschedule" && target.kind === "visit" && (
            <SlotPicker campus={campus} day={day} onDay={setDay} value={slot} onPick={setSlot} />
          )}
          {action === "reschedule" && target.kind === "meeting" && (
            <div className="space-y-1.5">
              <Label htmlFor="meet-when">New time ({tz})</Label>
              <input
                id="meet-when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="outcome-note">{needsNote(action) ? "Note" : "Note (optional)"}</Label>
            <Textarea
              id="outcome-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {m.isError && (
            <FormAlert>
              {isMissingRoute(m.error)
                ? "This isn't available yet."
                : errText(m.error, "Couldn't save.")}
            </FormAlert>
          )}
          <Button type="submit" disabled={m.isPending}>
            {m.isPending && <Loader2 className="animate-spin" />}
            {ACTION_LABEL[action]}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Slots for one day, ONLY from GET /api/visits/slots. Without that endpoint, booking can't happen. */
function SlotPicker({
  campus,
  day,
  onDay,
  value,
  onPick,
}: {
  campus: string;
  day: string;
  onDay: (d: string) => void;
  value: string | null;
  onPick: (iso: string) => void;
}) {
  const tz = useTenantTimeZone();
  const slots = useVisitSlots(campus, day, Boolean(day));
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor="slot-day">Day</Label>
        <Input
          id="slot-day"
          type="date"
          value={day}
          min={todayIn(tz)}
          onChange={(e) => onDay(e.target.value)}
          className="w-44"
        />
      </div>
      {slots.isPending ? (
        <Skeleton className="h-9 w-full" aria-busy="true" aria-label="Loading slots" />
      ) : isMissingRoute(slots.error) ? (
        <p className="text-sm text-muted-foreground" role="note">
          Booking isn&apos;t available yet: free slots come from the scheduling service, which
          hasn&apos;t been switched on.
        </p>
      ) : slots.isError ? (
        <FormAlert>Couldn&apos;t load free slots.</FormAlert>
      ) : slots.data.slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">No free slots on this day.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Free slots">
          {slots.data.slots.map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              role="radio"
              aria-checked={value === s}
              variant={value === s ? "default" : "outline"}
              onClick={() => onPick(s)}
            >
              {new Intl.DateTimeFormat("en-IN", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: tz,
              }).format(new Date(s))}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Find a lead by name/phone with the real GET /api/leads?q=. */
function LeadPicker({
  value,
  onPick,
}: {
  value: { id: string; name: string } | null;
  onPick: (l: { id: string; name: string }) => void;
}) {
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const results = useQuery({
    queryKey: ["leads", { q: term, pageSize: 5 }],
    queryFn: () => apiGet("/api/leads", leadsListResponse, { q: term, page: 1, pageSize: 5 }),
    enabled: term.length >= 2,
  });
  if (value)
    return (
      <p className="text-sm">
        Lead: <span className="font-medium">{value.name}</span>{" "}
        <button
          type="button"
          className="text-primary underline"
          onClick={() => onPick({ id: "", name: "" })}
        >
          change
        </button>
      </p>
    );
  return (
    <div className="space-y-1.5">
      <Label htmlFor="lead-search">Lead</Label>
      <Input
        id="lead-search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search name or phone"
      />
      {results.data && (
        <ul className="max-h-40 overflow-y-auto rounded-md border">
          {results.data.items.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => onPick({ id: l.id, name: l.person.fullName ?? "Unnamed lead" })}
              >
                {l.person.fullName ?? "Unnamed lead"}{" "}
                <span className="text-muted-foreground tabular-nums">{l.person.phone}</span>
              </button>
            </li>
          ))}
          {results.data.items.length === 0 && (
            <li className="px-3 py-1.5 text-sm text-muted-foreground">No match</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function BookVisitDialog({
  lead,
  onClose,
}: {
  lead?: { id: string; name: string };
  onClose: () => void;
}) {
  const tz = useTenantTimeZone();
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(lead ?? null);
  const [campus, setCampus] = useState("Main campus");
  const [day, setDay] = useState(todayIn(tz));
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const create = useCreateVisit();
  const slots = useVisitSlots(campus, day, Boolean(day));
  const slotsOk = slots.isSuccess;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!picked?.id || !slot) return;
    create.mutate(
      {
        leadId: picked.id,
        campus: campus.trim(),
        scheduledAt: slot,
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      { onSuccess: onClose },
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book a campus visit</DialogTitle>
          <DialogDescription>
            The lead moves to Visit booked and gets reminders 24 h and 2 h before.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="space-y-3">
          <LeadPicker
            value={picked?.id ? picked : null}
            onPick={(l) => setPicked(l.id ? l : null)}
          />
          <div className="space-y-1.5">
            <Label htmlFor="visit-campus">Campus</Label>
            <Input
              id="visit-campus"
              value={campus}
              onChange={(e) => setCampus(e.target.value)}
              maxLength={100}
            />
          </div>
          <SlotPicker campus={campus} day={day} onDay={setDay} value={slot} onPick={setSlot} />
          <div className="space-y-1.5">
            <Label htmlFor="visit-note">Note (optional)</Label>
            <Textarea
              id="visit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </div>
          {create.isError && (
            <FormAlert>
              {isMissingRoute(create.error)
                ? "Booking isn't available yet."
                : errText(create.error, "Couldn't book the visit.")}
            </FormAlert>
          )}
          <Button type="submit" disabled={!slotsOk || !picked?.id || !slot || create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />}
            Book visit
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleMeetingDialog({
  lead,
  onClose,
}: {
  lead?: { id: string; name: string };
  onClose: () => void;
}) {
  const tz = useTenantTimeZone();
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(lead ?? null);
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("30");
  const [mode, setMode] = useState<Meeting["mode"]>("phone");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateMeeting();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const at = zonedLocalToIso(when, tz);
    if (!picked?.id) return setError("Choose a lead");
    if (!at) return setError("Pick a date and time");
    setError(null);
    create.mutate(
      {
        leadId: picked.id,
        scheduledAt: at,
        durationMin: Number(duration),
        mode,
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      { onSuccess: onClose },
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule a meeting</DialogTitle>
          <DialogDescription>Times are in {tz}.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="space-y-3">
          <LeadPicker
            value={picked?.id ? picked : null}
            onPick={(l) => setPicked(l.id ? l : null)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="meeting-when">When</Label>
              <input
                id="meeting-when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-mode">How</Label>
              <select
                id="meeting-mode"
                value={mode}
                onChange={(e) =>
                  setMode(MEETING_MODES.find((x) => x === e.target.value) ?? "phone")
                }
                className="h-9 w-full rounded-md border bg-card px-2 text-sm"
              >
                {MEETING_MODES.map((x) => (
                  <option key={x} value={x}>
                    {MODE_LABEL[x]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meeting-duration">Minutes</Label>
            <select
              id="meeting-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="h-9 w-32 rounded-md border bg-card px-2 text-sm"
            >
              {["15", "30", "45", "60"].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meeting-note">Note (optional)</Label>
            <Textarea
              id="meeting-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {create.isError && (
            <FormAlert>
              {isMissingRoute(create.error)
                ? "Scheduling meetings isn't available yet."
                : errText(create.error, "Couldn't schedule.")}
            </FormAlert>
          )}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />}
            Schedule meeting
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
