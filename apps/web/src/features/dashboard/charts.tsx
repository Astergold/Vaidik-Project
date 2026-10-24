import { useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { formatCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Plain-CSS charts for the dashboard (D2-I4-04), following the dataviz mark specs: bars <= 20px,
 * 4px rounded data-end / square baseline, 2px surface gaps, recessive chrome, text in text tokens,
 * per-mark hover + focus tooltip, and a table view so no value is hover-only.
 */
export interface Datum {
  key: string;
  label: string;
  value: number;
  /** Token class for the mark (e.g. `bg-temp-hot`). Defaults to the brand primary. */
  color?: string;
}

interface Tip {
  x: number;
  y: number;
  value: string;
  label: string;
}

/** Tooltip state for one chart; marks call `show` on pointer move and focus. */
function useTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const showAtPointer = (e: PointerEvent<HTMLElement>, t: Omit<Tip, "x" | "y">) => {
    const box = ref.current?.getBoundingClientRect();
    if (box) setTip({ ...t, x: e.clientX - box.left, y: e.clientY - box.top });
  };
  const showAtMark = (e: FocusEvent<HTMLElement>, t: Omit<Tip, "x" | "y">) => {
    const box = ref.current?.getBoundingClientRect();
    const mark = e.currentTarget.getBoundingClientRect();
    if (box) setTip({ ...t, x: mark.left - box.left + mark.width / 2, y: mark.top - box.top });
  };
  const hide = () => setTip(null);
  const layer = tip && (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
      style={{ left: tip.x, top: tip.y }}
    >
      <span className="block text-sm font-semibold tabular-nums">{tip.value}</span>
      <span className="text-muted-foreground">{tip.label}</span>
    </div>
  );
  return { ref, showAtPointer, showAtMark, hide, layer };
}

/** Horizontal bars, one series, value at the tip. Sorted by the caller (pipeline order for stages). */
export function BarList({ data, unit, caption }: { data: Datum[]; unit: string; caption: string }) {
  const tip = useTooltip();
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure className="space-y-3">
      <div ref={tip.ref} className="relative space-y-1.5" onPointerLeave={tip.hide}>
        {data.map((d) => {
          const t = {
            value: `${countOf(d.value, unit)}`,
            label: `${d.label} · ${pct(d.value, total)}`,
          };
          return (
            <div
              key={d.key}
              tabIndex={0}
              aria-label={`${d.label}: ${countOf(d.value, unit)}`}
              onPointerMove={(e) => tip.showAtPointer(e, t)}
              onFocus={(e) => tip.showAtMark(e, t)}
              onBlur={tip.hide}
              className="group grid grid-cols-[minmax(5.5rem,8rem)_1fr] items-center gap-3 rounded-sm py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate text-sm text-muted-foreground">{d.label}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "h-4 rounded-r-[4px] transition-opacity group-hover:opacity-80",
                    d.color ?? "bg-primary",
                    d.value === 0 && "hidden",
                  )}
                  style={{ width: `${(d.value / max) * 85}%` }}
                />
                <span className="text-sm tabular-nums">{formatCount(d.value)}</span>
              </span>
            </div>
          );
        })}
        {tip.layer}
      </div>
      <TableView caption={caption} unit={unit} data={data} />
    </figure>
  );
}

/** One horizontal stacked bar (part-to-whole) with a legend that carries labels, counts and shares. */
export function StackedBar({
  data,
  unit,
  caption,
}: {
  data: Datum[];
  unit: string;
  caption: string;
}) {
  const tip = useTooltip();
  const total = data.reduce((s, d) => s + d.value, 0);
  const shown = data.filter((d) => d.value > 0);
  return (
    <figure className="space-y-4">
      <div ref={tip.ref} className="relative" onPointerLeave={tip.hide}>
        {total === 0 ? (
          <div className="h-5 rounded-[4px] bg-muted" aria-label={`No ${unit}`} />
        ) : (
          // gap-[2px] over the card surface = the 2px surface gap between segments.
          <div className="flex h-5 gap-[2px] overflow-hidden rounded-[4px]">
            {shown.map((d) => {
              const t = {
                value: `${countOf(d.value, unit)}`,
                label: `${d.label} · ${pct(d.value, total)}`,
              };
              return (
                <div
                  key={d.key}
                  tabIndex={0}
                  aria-label={`${d.label}: ${countOf(d.value, unit)}, ${pct(d.value, total)}`}
                  onPointerMove={(e) => tip.showAtPointer(e, t)}
                  onFocus={(e) => tip.showAtMark(e, t)}
                  onBlur={tip.hide}
                  className={cn(
                    "min-w-[3px] outline-none hover:opacity-80 focus-visible:opacity-80",
                    d.color,
                  )}
                  style={{ flexGrow: d.value, flexBasis: 0 }}
                />
              );
            })}
          </div>
        )}
        {tip.layer}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span className={cn("size-2.5 rounded-[2px]", d.color)} aria-hidden />
            <span>{d.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {formatCount(d.value)} · {pct(d.value, total)}
            </span>
          </li>
        ))}
      </ul>
      <TableView caption={caption} unit={unit} data={data} />
    </figure>
  );
}

/** The same numbers as a table, for screen readers, CVD, and anyone who wants exact values. */
function TableView({ caption, unit, data }: { caption: string; unit: string; data: Datum[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        Show as table
      </summary>
      <div className="mt-2 max-w-full overflow-x-auto">
        <table className="w-full max-w-md text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Category</th>
              <th className="py-1 text-right font-medium capitalize">{unit}</th>
              <th className="py-1 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.map((d) => (
              <tr key={d.key} className="border-t">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right">{formatCount(d.value)}</td>
                <td className="py-1 text-right">{pct(d.value, total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border bg-card p-4 md:p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const pct = (part: number, total: number) =>
  total > 0 ? `${Math.round((part / total) * 1000) / 10}%` : "0%";

/** "1 lead", "14 leads" (units are passed in the plural). */
const countOf = (n: number, unitPlural: string) =>
  `${formatCount(n)} ${n === 1 ? unitPlural.replace(/s$/, "") : unitPlural}`;
