import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { leadsListResponse, type LeadListItem } from "@vernacular/contracts";
import { AlertTriangle, CalendarClock, Users } from "lucide-react";
import { StateCard } from "@/components/StateCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { todayIn } from "@/features/dashboard/dashboard-search";
import { zonedLocalToIso } from "@/features/lead360/stage-form";
import { TemperatureTag } from "@/features/leads/LeadsTable";
import { QueueBoard } from "@/features/review/QueueBoard";
import { TodaySchedule } from "@/features/workspace/TodaySchedule";
import { apiGet } from "@/lib/api";
import { formatDateTime, NEXT_STEP_LABEL, STAGE_LABEL } from "@/lib/labels";
import { useSession, useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

/** Counsellor home (D4-I4-01): four tabs; queue items open the review side panel in place. */
export const WORKSPACE_TABS = [
  { id: "needs", label: "Needs counsellor" },
  { id: "review", label: "Review calls" },
  { id: "leads", label: "My leads" },
  { id: "today", label: "Today" },
] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]["id"];

export const validateWorkspaceSearch = (s: Record<string, unknown>): { tab?: WorkspaceTab } => {
  const tab = WORKSPACE_TABS.find((t) => t.id === s.tab)?.id;
  return tab && tab !== "needs" ? { tab } : {};
};

export function WorkspacePage({ tab = "needs" }: { tab?: WorkspaceTab }) {
  const navigate = useNavigate();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (id: WorkspaceTab) =>
    void navigate({ to: ".", search: { tab: id === "needs" ? undefined : id }, replace: true });

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + WORKSPACE_TABS.length) % WORKSPACE_TABS.length;
    refs.current[n]?.focus();
    select(WORKSPACE_TABS[n]!.id);
  };

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">My workspace</h1>
      <div
        role="tablist"
        aria-label="Workspace"
        className="flex max-w-full gap-1 overflow-x-auto border-b"
      >
        {WORKSPACE_TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-w-0">
        {tab === "needs" && <QueueBoard kind="needs_counsellor" title="Needs counsellor" />}
        {tab === "review" && <QueueBoard kind="review_call" title="Review calls" />}
        {tab === "leads" && <MyLeads />}
        {tab === "today" && <Today />}
      </div>
    </div>
  );
}

/** Leads the counsellor owns — the real GET /api/leads, filtered to them. */
function useMyLeads(pageSize: number) {
  const { session } = useSession();
  const self = session.status === "ready" ? session.me.user.id : null;
  const query = {
    counsellorId: self ?? undefined,
    sort: "next_step_due_at",
    order: "asc",
    page: 1,
    pageSize,
  };
  return useQuery({
    queryKey: ["leads", query],
    queryFn: () => apiGet("/api/leads", leadsListResponse, query),
    enabled: Boolean(self),
  });
}

function LeadRows({ items, tz }: { items: LeadListItem[]; tz: string }) {
  return (
    <ul className="space-y-2">
      {items.map((l) => (
        <li key={l.id}>
          <Link
            to="/leads/$leadId"
            params={{ leadId: l.id }}
            className="block rounded-lg border bg-card p-3 hover:bg-accent/40"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">{l.person.fullName ?? "Unnamed lead"}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {l.person.phone ?? "—"}
                </p>
              </div>
              <TemperatureTag value={l.temperature} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {STAGE_LABEL[l.stage]}
              {l.nextStep && l.nextStep !== "none" && ` · ${NEXT_STEP_LABEL[l.nextStep]}`}
              {l.nextStepDueAt && ` · due ${formatDateTime(l.nextStepDueAt, tz)}`}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListState({
  q,
  empty,
  children,
}: {
  q: ReturnType<typeof useMyLeads>;
  empty: string;
  children: (items: LeadListItem[]) => ReactNode;
}) {
  if (q.isPending)
    return <Skeleton className="h-40 w-full" aria-busy="true" aria-label="Loading leads" />;
  if (q.isError)
    return (
      <StateCard
        icon={AlertTriangle}
        title="Couldn't load your leads"
        tone="error"
        action={
          <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
            Try again
          </Button>
        }
      >
        Check your connection and try again.
      </StateCard>
    );
  if (q.data.items.length === 0)
    return (
      <StateCard icon={Users} title={empty}>
        Leads assigned to you appear here.
      </StateCard>
    );
  return <>{children(q.data.items)}</>;
}

function MyLeads() {
  const tz = useTenantTimeZone();
  const q = useMyLeads(50);
  return (
    <ListState q={q} empty="No leads assigned to you yet">
      {(items) => <LeadRows items={items} tz={tz} />}
    </ListState>
  );
}

/** Follow-ups due today or overdue (real data). Visits, meetings and tasks join here with D4-I4-02. */
function Today() {
  const tz = useTenantTimeZone();
  const q = useMyLeads(100);
  const endOfToday = zonedLocalToIso(`${todayIn(tz)}T23:59`, tz) ?? "";
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="size-4" aria-hidden /> Follow-ups due today or overdue
        </h2>
        <ListState q={q} empty="No follow-ups due">
          {(items) => {
            const due = items.filter(
              (l) =>
                l.nextStepDueAt &&
                l.nextStep &&
                l.nextStep !== "none" &&
                l.nextStepDueAt <= endOfToday,
            );
            return due.length ? (
              <LeadRows items={due} tz={tz} />
            ) : (
              <StateCard icon={CalendarClock} title="Nothing due today">
                You&apos;re up to date.
              </StateCard>
            );
          }}
        </ListState>
      </section>
      <TodaySchedule today={todayIn(tz)} endOfToday={endOfToday} />
    </div>
  );
}
