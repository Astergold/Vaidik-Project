import { useState } from "react";
import { USAGE_KINDS, type WalletResponse } from "@vernacular/contracts";
import { BarChart3 } from "lucide-react";
import { QueryGate } from "@/components/QueryGate";
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
import { useUsage } from "@/features/billing/billing-api";
import { byDay, KIND_LABEL, KIND_UNIT, monthStart, totalsByKind } from "@/features/billing/usage";
import { BarList, ChartCard } from "@/features/dashboard/charts";
import { addDays, formatDateKey, todayIn } from "@/features/dashboard/dashboard-search";
import { formatCount } from "@/lib/labels";
import { formatPaise } from "@/lib/money";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

/** Current plan: fee, included vs used this period, overage rates (D6-I4-03). */
export function PlanCard({ w }: { w: WalletResponse }) {
  if (!w.plan)
    return (
      <section className="min-w-0 rounded-lg border bg-card p-4" aria-label="Plan">
        <p className="text-sm text-muted-foreground">No plan assigned yet — contact Laveric.</p>
      </section>
    );
  const p = w.plan;
  const meters: [string, number, number, string][] = [
    ["Call minutes", w.currentPeriod.usedMinutes, p.includedMinutes, "min"],
    ["WhatsApp messages", w.currentPeriod.usedWhatsapp, p.includedWhatsapp, "msgs"],
  ];
  return (
    <section className="min-w-0 space-y-3 rounded-lg border bg-card p-4" aria-label="Plan">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{p.name}</h2>
        <p className="text-sm text-muted-foreground">
          {formatPaise(p.monthlyFeePaise)}/month · {formatDateKey(w.currentPeriod.from, false)} –{" "}
          {formatDateKey(w.currentPeriod.to, false)}
        </p>
      </div>
      {meters.map(([label, used, included, unit]) => {
        const pct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 100;
        const over = used > included;
        return (
          <div key={label} className="space-y-1">
            <p className="flex flex-wrap justify-between gap-2 text-sm">
              <span>{label}</span>
              <span className={cn("tabular-nums", over && "font-medium text-destructive")}>
                {formatCount(Math.round(used))} of {formatCount(included)} {unit}
                {over && ` · ${formatCount(Math.round(used - included))} over`}
              </span>
            </p>
            <div
              className="h-2 rounded-full bg-muted"
              role="progressbar"
              aria-label={`${label} used`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div
                className={cn("h-2 rounded-full", over ? "bg-destructive" : "bg-primary")}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Overage: {formatPaise(p.overage.callMinutePaise)}/min ·{" "}
        {formatPaise(p.overage.whatsappPaise)}/message · {formatPaise(p.overage.analystRunPaise)}
        /analysis
      </p>
    </section>
  );
}

/** Usage by kind and by day for a period; amounts are the server's prices (D6-I4-03). */
export function UsageSection() {
  const tz = useTenantTimeZone();
  const today = todayIn(tz);
  const [range, setRange] = useState({ from: monthStart(today), to: today });
  const q = useUsage(range.from, range.to);
  const totals = q.data ? totalsByKind(q.data.totals) : [];
  const days = q.data ? byDay(q.data.days) : [];
  const charged = totals.reduce((s, t) => s + t.amountPaise, 0);
  const presets: [string, { from: string; to: string }][] = [
    ["This month", { from: monthStart(today), to: today }],
    ["Last 30 days", { from: addDays(today, -29), to: today }],
  ];
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="usage-h">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="usage-h" className="text-lg font-semibold">
          Usage
        </h2>
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
      </div>
      <QueryGate
        q={q}
        what="usage"
        service="Billing"
        empty={
          days.length === 0 && (
            <StateCard icon={BarChart3} title="No usage in this period">
              Calls, WhatsApp messages and analyses will show here as they happen.
            </StateCard>
          )
        }
      >
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Charged by kind"
            subtitle={`${formatPaise(charged)} in total (beyond your plan's included amounts)`}
          >
            <BarList
              unit="rupees"
              caption="Amount charged by usage kind"
              data={totals.map((t) => ({
                key: t.kind,
                label: KIND_LABEL[t.kind],
                value: Math.round(t.amountPaise / 100),
              }))}
            />
          </ChartCard>
          <section className="min-w-0 rounded-lg border bg-card p-4" aria-label="Totals">
            <h3 className="mb-2 text-sm font-semibold">Totals</h3>
            <dl className="space-y-1.5 text-sm">
              {totals.map((t) => (
                <div key={t.kind} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{KIND_LABEL[t.kind]}</dt>
                  <dd className="tabular-nums">
                    {formatCount(Math.round(t.quantity * 10) / 10)} {KIND_UNIT[t.kind]} ·{" "}
                    {formatPaise(t.amountPaise)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        <div className="max-w-full overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                {USAGE_KINDS.map((k) => (
                  <TableHead key={k} className="text-right">
                    {KIND_LABEL[k]}
                  </TableHead>
                ))}
                <TableHead className="text-right">Charged</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((d) => (
                <TableRow key={d.date}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateKey(d.date, false)}
                  </TableCell>
                  {USAGE_KINDS.map((k) => (
                    <TableCell key={k} className="text-right tabular-nums">
                      {d.quantity[k] === undefined
                        ? "—"
                        : formatCount(Math.round(d.quantity[k]! * 10) / 10)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(d.amountPaise)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </QueryGate>
    </section>
  );
}
