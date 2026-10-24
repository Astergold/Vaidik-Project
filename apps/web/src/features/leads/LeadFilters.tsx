import { useQuery } from "@tanstack/react-query";
import {
  leadsFiltersResponse,
  type LeadsFilterOption,
  type LeadsFiltersResponse,
} from "@vernacular/contracts";
import { ChevronDown, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeadsSearch } from "@/features/leads/leads-search";
import { apiGet } from "@/lib/api";
import type { ErrorMeta } from "@/lib/errors";
import { cn } from "@/lib/utils";

/**
 * Leads-list filter dropdowns (D2-I4-03 stage/temperature, D2-I4-03b source/agent/counsellor).
 * Source/agent/counsellor options come from ONE query of GET /api/leads/filters — never derived from the
 * current page of results.
 */

/** Multi-select dropdown over a fixed option list. */
export function MultiFilter<T extends string>({
  label,
  options,
  labels,
  selected = [],
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected?: readonly string[];
  onChange: (next: T[]) => void;
}) {
  const count = selected.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(count > 0 && "border-primary/50 text-primary")}
        >
          {label}
          {count > 0 && <span className="rounded bg-accent px-1 text-xs">{count}</span>}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o}
            checked={selected.includes(o)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) =>
              onChange(
                on
                  ? options.filter((x) => x === o || selected.includes(x))
                  : options.filter((x) => x !== o && selected.includes(x)),
              )
            }
          >
            {labels[o]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type OptionsState =
  | { kind: "loading" }
  | { kind: "error"; retry: () => void }
  | { kind: "ready"; options: readonly LeadsFilterOption[] };

/** One option-backed filter: skeleton while loading, inline retry on failure, disabled when empty. */
export function EntityFilter({
  label,
  emptyText,
  state,
  selected,
  onChange,
}: {
  label: string;
  emptyText: string;
  state: OptionsState;
  selected?: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  if (state.kind === "loading") {
    return (
      <Skeleton className="h-8 w-28" aria-busy="true" aria-label={`Loading ${label} options`} />
    );
  }
  if (state.kind === "error") {
    return (
      <span
        role="alert"
        className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed px-2 text-xs text-muted-foreground"
      >
        {label}: couldn&apos;t load
        <Button variant="ghost" size="xs" onClick={state.retry}>
          <RotateCw /> Retry
        </Button>
      </span>
    );
  }
  if (state.options.length === 0) {
    return (
      <Button variant="outline" size="sm" disabled>
        {emptyText}
      </Button>
    );
  }
  const ids = state.options.map((o) => o.id);
  const labels = Object.fromEntries(
    state.options.map((o) => [o.id, o.isActive ? o.name : `${o.name} (inactive)`]),
  );
  return (
    <MultiFilter
      label={label}
      options={ids}
      labels={labels}
      selected={selected}
      onChange={onChange}
    />
  );
}

/** The single options query. A failure is shown inside each filter (no global toast). */
export function useLeadFilterOptions() {
  return useQuery({
    queryKey: ["leads", "filters"],
    queryFn: () => apiGet("/api/leads/filters", leadsFiltersResponse),
    staleTime: 5 * 60_000,
    meta: FILTER_OPTIONS_META,
  });
}

/** Failures render inside each filter with a retry; the global toast/redirect policy skips this query. */
export const FILTER_OPTIONS_META: ErrorMeta = { silent: true };

export function optionsStateFor(
  q: { data?: LeadsFiltersResponse; isError: boolean; refetch: () => unknown },
  key: "sources" | "agents" | "counsellors",
): OptionsState {
  if (q.data) return { kind: "ready", options: q.data[key] };
  if (q.isError) return { kind: "error", retry: () => void q.refetch() };
  return { kind: "loading" };
}

export function SourceAgentCounsellorFilters({
  search,
  update,
}: {
  search: LeadsSearch;
  update: (patch: Partial<LeadsSearch>) => void;
}) {
  const q = useLeadFilterOptions();
  const set = (key: "sourceId" | "agentId" | "counsellorId") => (ids: string[]) =>
    update({ [key]: ids.length ? ids : undefined });
  return (
    <>
      <EntityFilter
        label="Source"
        emptyText="No sources yet"
        state={optionsStateFor(q, "sources")}
        selected={search.sourceId}
        onChange={set("sourceId")}
      />
      <EntityFilter
        label="AI agent"
        emptyText="No agents yet"
        state={optionsStateFor(q, "agents")}
        selected={search.agentId}
        onChange={set("agentId")}
      />
      <EntityFilter
        label="Counsellor"
        emptyText="No counsellors yet"
        state={optionsStateFor(q, "counsellors")}
        selected={search.counsellorId}
        onChange={set("counsellorId")}
      />
    </>
  );
}
