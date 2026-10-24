import { useState, type ReactNode } from "react";
import { VISIT_STATUSES, MEETING_STATUSES, type Meeting, type Visit } from "@vernacular/contracts";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  PlugZap,
  Plus,
} from "lucide-react";
import { StateCard } from "@/components/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, todayIn } from "@/features/dashboard/dashboard-search";
import { MultiFilter } from "@/features/leads/LeadFilters";
import { optionalDate, optionalEnum, optionalList, optionalString } from "@/lib/search";
import { addMonths, bucketByDay, monthGrid, monthOf, weekKeys } from "@/features/visits/calendar";
import {
  BookVisitDialog,
  MEETING_STATUS_LABEL,
  MeetingCard,
  ScheduleMeetingDialog,
  VISIT_STATUS_LABEL,
  VisitCard,
} from "@/features/visits/VisitParts";
import {
  useMeetings,
  useVisits,
  type MeetingsFilter,
  type VisitsFilter,
} from "@/features/visits/visits-api";
import { ApiCallError, isMissingRoute } from "@/lib/api";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

/** /visits, /meetings, /calendar (D4-I4-02). Lists and calendar share the cards and dialogs in VisitParts. */

type Q = { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
/** Loading / not-available / error gate shared by every list. */
export function Gate({ q, what, children }: { q: Q; what: string; children: ReactNode }) {
  if (q.isPending)
    return <Skeleton className="h-40 w-full" aria-busy="true" aria-label={`Loading ${what}`} />;
  if (isMissingRoute(q.error))
    return (
      <StateCard icon={PlugZap} title="Scheduling not available yet">
        {`${what[0]!.toUpperCase()}${what.slice(1)} need a server feature that hasn't been switched on yet.`}
      </StateCard>
    );
  if (q.isError)
    return (
      <StateCard
        icon={AlertTriangle}
        title={`Couldn't load ${what}`}
        tone="error"
        action={
          <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
            Try again
          </Button>
        }
      >
        {q.error instanceof ApiCallError ? q.error.message : "Check your connection and try again."}
      </StateCard>
    );
  return <>{children}</>;
}

/* ---- /visits ---- */

export type VisitsSearch = VisitsFilter;
export const validateVisitsSearch = (s: Record<string, unknown>): VisitsSearch => ({
  status: optionalList(s.status, VISIT_STATUSES),
  campus: optionalString(s.campus)?.slice(0, 100),
  from: optionalDate(s.from),
  to: optionalDate(s.to),
  bookedBy: optionalEnum(s.bookedBy, ["ai", "user"] as const),
});

export function VisitsPage({
  search,
  onSearch,
}: {
  search: VisitsSearch;
  onSearch: (patch: Partial<VisitsSearch>) => void;
}) {
  const q = useVisits(search);
  const [booking, setBooking] = useState(false);
  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
      <PageHead
        title="Campus visits"
        action={
          <Button onClick={() => setBooking(true)}>
            <Plus /> Book visit
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <MultiFilter
          label="Status"
          options={VISIT_STATUSES}
          labels={VISIT_STATUS_LABEL}
          selected={search.status}
          onChange={(status) => onSearch({ status: status.length ? status : undefined })}
        />
        <Input
          aria-label="Campus"
          placeholder="Campus"
          defaultValue={search.campus ?? ""}
          onBlur={(e) => onSearch({ campus: e.target.value.trim() || undefined })}
          className="h-8 w-40"
        />
        <DateRange
          from={search.from}
          to={search.to}
          onChange={(from, to) => onSearch({ from, to })}
        />
        <select
          aria-label="Booked by"
          value={search.bookedBy ?? ""}
          onChange={(e) =>
            onSearch({ bookedBy: optionalEnum(e.target.value, ["ai", "user"] as const) })
          }
          className="h-8 rounded-md border bg-card px-1.5 text-sm"
        >
          <option value="">Booked by anyone</option>
          <option value="ai">Booked by AI</option>
          <option value="user">Booked by a person</option>
        </select>
      </div>
      <Gate q={q} what="visits">
        {q.data?.items.length === 0 ? (
          <StateCard icon={CalendarDays} title="No visits">
            Booked campus visits appear here.
          </StateCard>
        ) : (
          <ul className="space-y-2">
            {q.data?.items.map((v) => (
              <li key={v.id}>
                <VisitCard visit={v} />
              </li>
            ))}
          </ul>
        )}
      </Gate>
      {booking && <BookVisitDialog onClose={() => setBooking(false)} />}
    </div>
  );
}

/* ---- /meetings ---- */

export type MeetingsSearch = MeetingsFilter;
export const validateMeetingsSearch = (s: Record<string, unknown>): MeetingsSearch => ({
  status: optionalList(s.status, MEETING_STATUSES),
  from: optionalDate(s.from),
  to: optionalDate(s.to),
});

export function MeetingsPage({
  search,
  onSearch,
}: {
  search: MeetingsSearch;
  onSearch: (patch: Partial<MeetingsSearch>) => void;
}) {
  const q = useMeetings(search);
  const [scheduling, setScheduling] = useState(false);
  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
      <PageHead
        title="Meetings"
        action={
          <Button onClick={() => setScheduling(true)}>
            <Plus /> Schedule meeting
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <MultiFilter
          label="Status"
          options={MEETING_STATUSES}
          labels={MEETING_STATUS_LABEL}
          selected={search.status}
          onChange={(status) => onSearch({ status: status.length ? status : undefined })}
        />
        <DateRange
          from={search.from}
          to={search.to}
          onChange={(from, to) => onSearch({ from, to })}
        />
      </div>
      <Gate q={q} what="meetings">
        {q.data?.items.length === 0 ? (
          <StateCard icon={CalendarDays} title="No meetings">
            Scheduled meetings with students and parents appear here.
          </StateCard>
        ) : (
          <ul className="space-y-2">
            {q.data?.items.map((m) => (
              <li key={m.id}>
                <MeetingCard meeting={m} />
              </li>
            ))}
          </ul>
        )}
      </Gate>
      {scheduling && <ScheduleMeetingDialog onClose={() => setScheduling(false)} />}
    </div>
  );
}

/* ---- /calendar ---- */

export const CAL_VIEWS = ["month", "week", "day"] as const;
export type CalendarSearch = { view?: (typeof CAL_VIEWS)[number]; date?: string };
export const validateCalendarSearch = (s: Record<string, unknown>): CalendarSearch => ({
  view: optionalEnum(s.view, CAL_VIEWS),
  date: optionalDate(s.date),
});

type Ev = { at: string; kind: "visit"; v: Visit } | { at: string; kind: "meeting"; m: Meeting };

export function CalendarPage({
  search,
  onSearch,
}: {
  search: CalendarSearch;
  onSearch: (patch: CalendarSearch) => void;
}) {
  const tz = useTenantTimeZone();
  const view = search.view ?? "month";
  const date = search.date ?? todayIn(tz);
  const grid = monthGrid(monthOf(date));
  const range =
    view === "month"
      ? { from: grid[0]![0]!.key, to: grid.at(-1)!.at(-1)!.key }
      : view === "week"
        ? { from: weekKeys(date)[0]!, to: weekKeys(date)[6]! }
        : { from: date, to: date };
  const visits = useVisits(range);
  const meetings = useMeetings(range);
  const events: Ev[] = [
    ...(visits.data?.items ?? []).map((v) => ({ at: v.scheduledAt, kind: "visit" as const, v })),
    ...(meetings.data?.items ?? []).map((m) => ({
      at: m.scheduledAt,
      kind: "meeting" as const,
      m,
    })),
  ];
  const byDay = bucketByDay(events, tz);
  const step = (n: number) =>
    onSearch({
      view,
      date:
        view === "month"
          ? `${addMonths(monthOf(date), n)}-01`
          : addDays(date, view === "week" ? 7 * n : n),
    });
  const title =
    view === "month"
      ? new Intl.DateTimeFormat("en-IN", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${date}T00:00:00Z`))
      : view === "week"
        ? `Week of ${fmtDay(range.from)}`
        : fmtDay(date);

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-4">
      <PageHead title="Calendar" />
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="View"
          className="hidden rounded-md border bg-card p-0.5 md:inline-flex"
        >
          {CAL_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => onSearch({ view: v, date })}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground",
                view === v && "bg-primary text-primary-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <Button variant="outline" size="icon-sm" aria-label="Previous" onClick={() => step(-1)}>
          <ChevronLeft />
        </Button>
        <span className="min-w-0 text-sm font-medium">{title}</span>
        <Button variant="outline" size="icon-sm" aria-label="Next" onClick={() => step(1)}>
          <ChevronRight />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onSearch({ view, date: todayIn(tz) })}>
          Today
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{tz}</span>
      </div>
      <Gate q={visits} what="visits">
        {view === "month" && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full table-fixed border-collapse text-xs" aria-label="Month">
              <thead>
                <tr>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <th key={d} className="p-1 text-left font-medium text-muted-foreground">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((week) => (
                  <tr key={week[0]!.key}>
                    {week.map((d) => {
                      const evs = byDay.get(d.key) ?? [];
                      return (
                        <td
                          key={d.key}
                          className={cn(
                            "h-24 border p-1 align-top",
                            !d.inMonth && "bg-muted/40 text-muted-foreground",
                            d.key === date && "ring-2 ring-ring ring-inset",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onSearch({ view, date: d.key })}
                            className="mb-1 text-xs font-medium"
                            aria-label={`${fmtDay(d.key)}: ${evs.length} events`}
                          >
                            {Number(d.key.slice(8))}
                          </button>
                          <ul className="space-y-0.5">
                            {evs.slice(0, 3).map((e, i) => (
                              <li
                                key={i}
                                className="truncate rounded bg-accent px-1 text-accent-foreground"
                              >
                                {time(e.at, tz)}{" "}
                                {e.kind === "visit" ? e.v.lead.name : e.m.lead.name}
                              </li>
                            ))}
                            {evs.length > 3 && (
                              <li className="text-muted-foreground">+{evs.length - 3} more</li>
                            )}
                          </ul>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view === "week" && (
          <div className="hidden gap-2 md:grid md:grid-cols-7">
            {weekKeys(date).map((k) => (
              <section key={k} className="min-w-0 space-y-1">
                <h2 className="text-xs font-medium text-muted-foreground">{fmtDay(k)}</h2>
                {(byDay.get(k) ?? []).map((e, i) => (
                  <p
                    key={i}
                    className="truncate rounded bg-accent px-1 text-xs text-accent-foreground"
                  >
                    {time(e.at, tz)} {e.kind === "visit" ? e.v.lead.name : e.m.lead.name}
                  </p>
                ))}
              </section>
            ))}
          </div>
        )}
        {/* Agenda for the selected day: always on phones, under the grid on desktop. */}
        <section aria-label={`Agenda ${fmtDay(date)}`} className="space-y-2">
          <div className="flex items-center justify-between gap-2 md:hidden">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous day"
              onClick={() => onSearch({ view, date: addDays(date, -1) })}
            >
              <ChevronLeft />
            </Button>
            <h2 className="text-sm font-semibold">{fmtDay(date)}</h2>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next day"
              onClick={() => onSearch({ view, date: addDays(date, 1) })}
            >
              <ChevronRight />
            </Button>
          </div>
          <h2 className="hidden text-sm font-semibold md:block">{fmtDay(date)}</h2>
          {(byDay.get(date) ?? []).length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nothing scheduled.
            </p>
          ) : (
            <ul className="space-y-2">
              {(byDay.get(date) ?? []).map((e, i) => (
                <li key={i}>
                  {e.kind === "visit" ? <VisitCard visit={e.v} /> : <MeetingCard meeting={e.m} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Gate>
    </div>
  );
}

const fmtDay = (key: string) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00Z`));
const time = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(
    new Date(iso),
  );

function PageHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Visits &amp; calendar
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {action}
    </div>
  );
}

function DateRange({
  from,
  to,
  onChange,
}: {
  from?: string;
  to?: string;
  onChange: (from?: string, to?: string) => void;
}) {
  return (
    <fieldset className="flex items-center gap-1 text-sm">
      <legend className="sr-only">Date range</legend>
      <Input
        type="date"
        aria-label="From"
        value={from ?? ""}
        max={to}
        onChange={(e) => onChange(e.target.value || undefined, to)}
        className="h-8 w-36"
      />
      <span className="text-muted-foreground">–</span>
      <Input
        type="date"
        aria-label="To"
        value={to ?? ""}
        min={from}
        onChange={(e) => onChange(from, e.target.value || undefined)}
        className="h-8 w-36"
      />
    </fieldset>
  );
}

/** Lead 360 right panel: this lead's visits and meetings, with booking and outcomes (D4-I4-02 U4). */
export function LeadVisitsPanel({ lead }: { lead: { id: string; name: string } }) {
  const visits = useVisits({ leadId: lead.id });
  const meetings = useMeetings({ leadId: lead.id });
  const [booking, setBooking] = useState<"visit" | "meeting" | null>(null);
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Visits and meetings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden /> Visits &amp;
          meetings
        </h2>
        <div className="flex gap-1.5">
          <Button size="xs" variant="outline" onClick={() => setBooking("visit")}>
            Book visit
          </Button>
          <Button size="xs" variant="outline" onClick={() => setBooking("meeting")}>
            Meeting
          </Button>
        </div>
      </div>
      <Gate q={visits} what="visits">
        {visits.data?.items.length === 0 && meetings.data?.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No visits or meetings yet.</p>
        ) : (
          <ul className="space-y-2">
            {visits.data?.items.map((v) => (
              <li key={v.id}>
                <VisitCard visit={v} showLead={false} />
              </li>
            ))}
            {meetings.data?.items.map((m) => (
              <li key={m.id}>
                <MeetingCard meeting={m} showLead={false} />
              </li>
            ))}
          </ul>
        )}
      </Gate>
      {booking === "visit" && <BookVisitDialog lead={lead} onClose={() => setBooking(null)} />}
      {booking === "meeting" && (
        <ScheduleMeetingDialog lead={lead} onClose={() => setBooking(null)} />
      )}
    </section>
  );
}
