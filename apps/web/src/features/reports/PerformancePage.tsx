import { useState } from "react";
import type { PerformanceRow } from "@vernacular/contracts";
import { ArrowDown, ArrowUpDown, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addDays, todayIn } from "@/features/dashboard/dashboard-search";
import { usePerformance } from "@/features/reports/reports-api";
import { formatCount } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

type SortKey = Exclude<keyof PerformanceRow, "counsellor">;
const COLUMNS: [SortKey, string][] = [
  ["callsReviewed", "Calls reviewed"],
  ["overrides", "Overrides"],
  ["queueResolved", "Queue resolved"],
  ["slaBreaches", "SLA breaches"],
  ["visitsBooked", "Visits booked"],
  ["visitsAttended", "Visits attended"],
  ["conversions", "Conversions"],
  ["medianResponseMinutes", "Median response"],
];

/** Server rows ordered by a column (null last); purely presentational. */
export function sortRows(rows: PerformanceRow[], key: SortKey): PerformanceRow[] {
  const asc = key === "slaBreaches" || key === "medianResponseMinutes"; // lower is better
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === null) return 1;
    if (y === null) return -1;
    return asc ? x - y : y - x;
  });
}

const fmtMinutes = (m: number | null) =>
  m === null ? "—" : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`;

/** /reports/performance (D6-I4-04d): per counsellor, for a period. */
export function PerformancePage() {
  return (
    <RoleGate page="reports.performance">
      <View />
    </RoleGate>
  );
}

function View() {
  const tz = useTenantTimeZone();
  const today = todayIn(tz);
  const [range, setRange] = useState({ from: addDays(today, -29), to: today });
  const [sort, setSort] = useState<SortKey>("conversions");
  const q = usePerformance(range.from, range.to);
  const rows = q.data ? sortRows(q.data.rows, sort) : [];
  const presets: [string, { from: string; to: string }][] = [
    ["Last 7 days", { from: addDays(today, -6), to: today }],
    ["Last 30 days", { from: addDays(today, -29), to: today }],
    ["This month", { from: `${today.slice(0, 8)}01`, to: today }],
  ];
  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 space-y-4">
      <PageHeader
        area="Reports"
        title="Counsellor performance"
        description="Reviews, queue work, visits and conversions per counsellor."
      />
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Period"
          className="inline-flex rounded-md border bg-card p-0.5"
        >
          {presets.map(([label, r]) => {
            const on = r.from === range.from && r.to === range.to;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded px-2.5 py-1 text-sm font-medium text-muted-foreground",
                  on && "bg-primary text-primary-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <Input
          type="date"
          aria-label="From"
          value={range.from}
          max={range.to}
          onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })}
          className="h-8 w-auto"
        />
        <Input
          type="date"
          aria-label="To"
          value={range.to}
          min={range.from}
          onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })}
          className="h-8 w-auto"
        />
      </div>
      <QueryGate
        q={q}
        what="performance"
        service="Reports"
        empty={
          rows.length === 0 && (
            <StateCard icon={Users} title="No counsellor activity in this period">
              Try a longer period.
            </StateCard>
          )
        }
      >
        <div className="max-w-full overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Counsellor</TableHead>
                {COLUMNS.map(([key, label]) => (
                  <TableHead
                    key={key}
                    className="text-right"
                    aria-sort={sort === key ? "descending" : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => setSort(key)}
                      className={cn(
                        "inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground",
                        sort === key && "text-foreground",
                      )}
                    >
                      {label}
                      {sort === key ? (
                        <ArrowDown className="size-3.5" aria-hidden />
                      ) : (
                        <ArrowUpDown className="size-3.5" aria-hidden />
                      )}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.counsellor.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {r.counsellor.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(r.callsReviewed)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(r.overrides)}
                    {r.callsReviewed > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {Math.round((r.overrides / r.callsReviewed) * 100)}%
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(r.queueResolved)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      r.slaBreaches > 0 && "font-medium text-destructive",
                    )}
                  >
                    {formatCount(r.slaBreaches)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(r.visitsBooked)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(r.visitsAttended)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCount(r.conversions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtMinutes(r.medianResponseMinutes)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </QueryGate>
    </div>
  );
}
