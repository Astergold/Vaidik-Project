import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Accessible tab list (no dependency): roving focus with ←/→/Home/End. The caller renders the panel with
 * `tabPanelProps(id, value)` so tabs and panel are linked for screen readers.
 */
export function Tabs<T extends string>({
  id,
  label,
  value,
  items,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  items: readonly { value: T; label: string; badge?: string }[];
  onChange: (v: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const last = items.length - 1;
    const next =
      e.key === "ArrowRight"
        ? i === last
          ? 0
          : i + 1
        : e.key === "ArrowLeft"
          ? i === 0
            ? last
            : i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(items[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex max-w-full gap-1 overflow-x-auto border-b"
    >
      {items.map((t, i) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.value}`}
            aria-selected={selected}
            aria-controls={`${id}-panel-${t.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
              selected && "border-primary text-foreground",
            )}
          >
            {t.label}
            {t.badge && (
              <span className="ml-1.5 rounded bg-accent px-1 text-xs text-accent-foreground">
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export const tabPanelProps = (id: string, value: string) => ({
  role: "tabpanel" as const,
  id: `${id}-panel-${value}`,
  "aria-labelledby": `${id}-tab-${value}`,
  tabIndex: 0,
});
