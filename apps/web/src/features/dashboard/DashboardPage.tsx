import type { ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  CORE_STAGES,
  dashboardResponse,
  TEMPERATURES,
  type DashboardResponse,
} from "@vernacular/contracts";
import { AlertTriangle, Info, Lock } from "lucide-react";
import { StateCard } from "@/components/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarList, ChartCard, StackedBar, type Datum } from "@/features/dashboard/charts";
import {
  activePreset,
  formatPercent,
  formatRange,
  presetRange,
  PRESETS,
  share,
  toDashboardQuery,
  type DashboardSearch,
} from "@/features/dashboard/dashboard-search";
import { DimensionFilters } from "@/features/dashboard/DimensionFilters";
import { ApiCallError, apiGet } from "@/lib/api";
import {
  formatCount,
  formatMinSec,
  STAGE_LABEL,
  TEMPERATURE_DOT,
  TEMPERATURE_LABEL,
} from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Dashboard (D2-I4-04, D3-I4-02): every number comes from `GET /api/dashboard` as-is (no client maths
 * beyond display shares), scoped by one filter row: date range, source, AI agent.
 */
export function DashboardPage() {
  const search = useSearch({ from: "/dashboard" });
  const navigate = useNavigate({ from: "/dashboard" });
  const tz = useTenantTimeZone();
  const query = toDashboardQuery(search);
  const setSearch = (patch: Partial<DashboardSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const dash = useQuery({
    queryKey: ["dashboard", query],
    queryFn: () => apiGet("/api/dashboard", dashboardResponse, query),
    placeholderData: keepPreviousData,
    // 403 (role) and 422 (range) are explained on the page; 401/5xx still use the global policy.
    meta: { handles: [403, 422] },
  });
  const err = dash.error instanceof ApiCallError ? dash.error : null;

  if (err?.status === 403) {
    return (
      <Page>
        <StateCard icon={Lock} title="Not available for your role">
          The dashboard is for owners, admins and admission heads.{" "}
          <Link to="/leads" className="font-medium text-primary hover:underline">
            Go to your leads
          </Link>
        </StateCard>
      </Page>
    );
  }

  const data = dash.data;
  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${formatRange(data.range.from, data.range.to)} · ${data.range.timezone}` : " "}
          </p>
        </div>
      </div>

      <RangeFilter
        from={search.from}
        to={search.to}
        preset={activePreset(search, tz)}
        onPreset={(days) =>
          setSearch(days === 30 ? { from: undefined, to: undefined } : presetRange(days, tz))
        }
        onCustom={(from, to) => setSearch({ from, to })}
      >
        <DimensionFilters search={search} data={data} onChange={setSearch} />
      </RangeFilter>

      {err?.status === 422 ? (
        <StateCard icon={AlertTriangle} title="That date range doesn't work" tone="error">
          {err.message}. Pick a range of at most a year, with the start before the end.
        </StateCard>
      ) : dash.isPending ? (
        <Loading />
      ) : !data ? (
        <StateCard
          icon={AlertTriangle}
          title="Couldn't load the dashboard"
          tone="error"
          action={
            <Button variant="outline" size="sm" onClick={() => void dash.refetch()}>
              Try again
            </Button>
          }
        >
          Check your connection and try again.
        </StateCard>
      ) : (
        <div className={cn("space-y-4 transition-opacity", dash.isPlaceholderData && "opacity-60")}>
          {data.totals.leads === 0 && data.calls.inRange === 0 && (
            <p className="flex items-center gap-2 rounded-lg border border-dashed bg-card px-3 py-2 text-sm text-muted-foreground">
              <Info className="size-4 shrink-0" aria-hidden />
              No leads were created and no calls were placed in this range.
            </p>
          )}
          <Kpis data={data} />
          <Charts data={data} />
        </div>
      )}
    </Page>
  );
}

const Page = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto w-full max-w-7xl space-y-4">{children}</div>
);

function RangeFilter({
  from,
  to,
  preset,
  onPreset,
  onCustom,
  children,
}: {
  from?: string;
  to?: string;
  preset: number | null;
  onPreset: (days: number) => void;
  onCustom: (from?: string, to?: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Date range"
        className="inline-flex rounded-md border bg-card p-0.5"
      >
        {PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            aria-pressed={preset === p.days}
            onClick={() => onPreset(p.days)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium text-muted-foreground",
              preset === p.days && "bg-primary text-primary-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <fieldset className="flex items-center gap-1 text-sm">
        <legend className="sr-only">Custom range</legend>
        <Input
          type="date"
          aria-label="From"
          value={from ?? ""}
          max={to}
          onChange={(e) => onCustom(e.target.value || undefined, to)}
          className="h-8 w-36"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="date"
          aria-label="To"
          value={to ?? ""}
          min={from}
          onChange={(e) => onCustom(from, e.target.value || undefined)}
          className="h-8 w-36"
        />
      </fieldset>
      {children}
    </div>
  );
}

function Kpis({ data }: { data: DashboardResponse }) {
  const c = data.calls;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="New leads" value={formatCount(data.totals.leads)} note="created in range" />
      <Stat
        label="Calls today"
        value={formatCount(c.today)}
        note={`${formatCount(c.inRange)} in range`}
      />
      <Stat
        label="Connect rate"
        value={formatPercent(c.connectRate)}
        note={`${formatCount(c.connected)} of ${formatCount(c.inRange)} calls`}
      />
      <Stat
        label="Avg talk time"
        value={formatMinSec(c.avgDurationS)}
        note="connected calls in range"
      />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Charts({ data }: { data: DashboardResponse }) {
  const byStage = new Map(data.funnel.map((f) => [f.stage, f.count]));
  const stages: Datum[] = CORE_STAGES.map((s) => ({
    key: s,
    label: STAGE_LABEL[s],
    value: byStage.get(s) ?? 0,
  }));
  const byTemp = new Map(data.temperature.map((t) => [t.value, t.count]));
  const temps: Datum[] = [...TEMPERATURES, "unrated" as const].map((t) => ({
    key: t,
    label: TEMPERATURE_LABEL[t],
    value: byTemp.get(t) ?? 0,
    color: TEMPERATURE_DOT[t],
  }));
  const leads = data.totals.leads;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <ChartCard
            title="Leads by stage"
            subtitle="Leads created in range, by their current stage"
          >
            <BarList data={stages} unit="leads" caption="Leads by current stage" />
          </ChartCard>
        </div>
        <div className="min-w-0 lg:col-span-2">
          <ChartCard title="Temperature" subtitle="Latest AI rating of leads created in range">
            <StackedBar data={temps} unit="leads" caption="Leads by temperature" />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="By source">
          <DataTable
            empty="No leads from any source in this range."
            head={["Source", "Leads", "Hot", "Applied"]}
            rows={data.bySource.map((s) => ({
              key: s.sourceId ?? `none-${s.name}`,
              cells: [
                s.name,
                formatCount(s.leads),
                `${formatCount(s.hot)} · ${formatPercent(share(s.hot, s.leads))}`,
                formatCount(s.applied),
              ],
            }))}
          />
        </ChartCard>
        <ChartCard title="By AI agent">
          <DataTable
            empty="No AI agent activity in this range."
            head={["Agent", "Leads", "Calls", "Connected", "Avg talk"]}
            rows={data.byAgent.map((a) => ({
              key: a.agentId ?? `none-${a.name}`,
              cells: [
                a.name,
                formatCount(a.leads),
                formatCount(a.calls),
                `${formatCount(a.connected)} · ${formatPercent(a.calls ? share(a.connected, a.calls) : null)}`,
                formatMinSec(a.avgDurationS),
              ],
            }))}
          />
        </ChartCard>
      </div>
      <p className="text-xs text-muted-foreground">
        {formatCount(leads)} leads in range. Connected = completed call with at least 15 s of talk
        time.
      </p>
    </>
  );
}

function DataTable({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: { key: string; cells: string[] }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {head.map((h, i) => (
              <TableHead key={h} className={cn(i > 0 && "text-right")}>
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              {r.cells.map((c, i) => (
                <TableCell key={head[i]} className={cn(i > 0 && "text-right tabular-nums")}>
                  {c}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-80 lg:col-span-3" />
        <Skeleton className="h-80 lg:col-span-2" />
      </div>
    </div>
  );
}
