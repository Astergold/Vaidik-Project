import { useCallback, useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  CORE_STAGES,
  leadsListResponse,
  TEMPERATURES,
  type BulkTarget,
  type CoreStage,
  type Temperature,
} from "@vernacular/contracts";
import { AlertTriangle, ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { useViewerRole } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiFilter, SourceAgentCounsellorFilters } from "@/features/leads/LeadFilters";
import {
  applyFilter,
  hasLeadFilters,
  LEADS_DEFAULTS,
  PAGE_SIZES,
  pageRange,
  toLeadsApiQuery,
  type LeadsSearch,
} from "@/features/leads/leads-search";
import { BulkBar } from "@/features/leads/BulkBar";
import { filtersFromSearch } from "@/features/leads/leads-views-api";
import { LeadsTable, type LeadSelection } from "@/features/leads/LeadsTable";
import { SavedViews } from "@/features/leads/SavedViews";
import { apiGet } from "@/lib/api";
import { formatCount, STAGE_LABEL, TEMPERATURE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Leads list (D2-I4-03): `GET /api/leads`, server-side paging/sort/filter, URL-synced. */
export function LeadsPage() {
  const search = useSearch({ from: "/leads/" });
  const navigate = useNavigate({ from: "/leads/" });
  const update = useCallback(
    (patch: Partial<LeadsSearch>) =>
      void navigate({ search: (prev) => applyFilter(prev, patch), replace: true }),
    [navigate],
  );

  const query = toLeadsApiQuery(search);
  const leads = useQuery({
    queryKey: ["leads", query],
    queryFn: () => apiGet("/api/leads", leadsListResponse, query),
    placeholderData: keepPreviousData,
  });

  const filtered = hasLeadFilters(search);
  const data = leads.data;

  // Bulk selection (D6-I4-04b): managers only; cleared whenever the filters or page change.
  const role = useViewerRole();
  const canBulk = role === "owner" || role === "admin" || role === "admission_head";
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const searchKey = JSON.stringify(search);
  useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, [searchKey]);
  const pageIds = data?.items.map((l) => l.id) ?? [];
  const selection: LeadSelection | undefined = canBulk
    ? {
        selected,
        onToggle: (id, on) => {
          setAllMatching(false);
          setSelected((prev) => {
            const next = new Set(prev);
            if (on) next.add(id);
            else next.delete(id);
            return next;
          });
        },
        onToggleAll: (on) => {
          setAllMatching(false);
          setSelected(on ? new Set(pageIds) : new Set());
        },
      }
    : undefined;
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const count = allMatching ? (data?.total ?? 0) : selected.size;
  const target: BulkTarget = allMatching
    ? { filter: filtersFromSearch(search), expectedCount: data?.total ?? 0 }
    : { leadIds: [...selected] };

  return (
    <div className={cn("mx-auto w-full max-w-7xl min-w-0 space-y-4", count > 0 && "pb-24")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {data ? `${formatCount(data.total)} ${filtered ? "matching" : "in total"}` : " "}
          </p>
        </div>
        <SavedViews search={search} onApply={(s) => void navigate({ search: s, replace: true })} />
      </div>

      <Toolbar search={search} update={update} filtered={filtered} />

      {leads.isPending ? (
        <LoadingRows />
      ) : leads.isError && !data ? (
        <StateCard
          icon={AlertTriangle}
          title="Couldn't load leads"
          tone="error"
          action={
            <Button variant="outline" size="sm" onClick={() => void leads.refetch()}>
              Try again
            </Button>
          }
        >
          Check your connection and try again.
        </StateCard>
      ) : data && data.items.length === 0 ? (
        filtered ? (
          <StateCard
            icon={Search}
            title="No leads match these filters"
            action={
              <Button variant="outline" size="sm" onClick={() => void navigate({ search: {} })}>
                Clear filters
              </Button>
            }
          >
            Try a different name, phone or filter.
          </StateCard>
        ) : (
          <StateCard icon={Users} title="No leads yet">
            Leads appear here as soon as a lead source or import sends one.
          </StateCard>
        )
      ) : data ? (
        <div
          className={cn("space-y-3 transition-opacity", leads.isPlaceholderData && "opacity-60")}
        >
          {canBulk && pageAllSelected && data.total > pageIds.length && (
            <p className="rounded-md border bg-card px-3 py-2 text-sm" role="status">
              {allMatching ? (
                <>
                  All {formatCount(data.total)} matching leads are selected.{" "}
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setAllMatching(false)}
                  >
                    Select only this page
                  </button>
                </>
              ) : (
                <>
                  {formatCount(pageIds.length)} on this page selected.{" "}
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setAllMatching(true)}
                  >
                    Select all {formatCount(data.total)} matching
                  </button>
                </>
              )}
            </p>
          )}
          <LeadsTable items={data.items} selection={selection} />
          <Pagination
            page={search.page ?? LEADS_DEFAULTS.page}
            pageSize={search.pageSize ?? LEADS_DEFAULTS.pageSize}
            total={data.total}
            onPage={(page) =>
              void navigate({
                search: (prev) => ({ ...prev, page: page === 1 ? undefined : page }),
              })
            }
            onPageSize={(pageSize) =>
              update({ pageSize: pageSize === LEADS_DEFAULTS.pageSize ? undefined : pageSize })
            }
          />
        </div>
      ) : null}
      {canBulk && (
        <BulkBar
          count={count}
          target={target}
          onClear={() => {
            setSelected(new Set());
            setAllMatching(false);
          }}
        />
      )}
    </div>
  );
}

function Toolbar({
  search,
  update,
  filtered,
}: {
  search: LeadsSearch;
  update: (patch: Partial<LeadsSearch>) => void;
  filtered: boolean;
}) {
  const [text, setText] = useState(search.q ?? "");
  // Follow the URL when it changes elsewhere (Clear filters, back button).
  useEffect(() => setText(search.q ?? ""), [search.q]);
  // Debounce typing → URL (one request per pause, not per keystroke).
  useEffect(() => {
    const next = text.trim() || undefined;
    if (next === (search.q?.trim() || undefined)) return;
    const t = setTimeout(() => update({ q: next }), 300);
    return () => clearTimeout(t);
  }, [text, search.q, update]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search name, phone or email"
          aria-label="Search leads"
          className="pl-8"
        />
      </div>
      <MultiFilter
        label="Stage"
        options={CORE_STAGES}
        labels={STAGE_LABEL}
        selected={search.stage}
        onChange={(stage: CoreStage[]) => update({ stage: stage.length ? stage : undefined })}
      />
      <MultiFilter
        label="Temperature"
        options={TEMPERATURES}
        labels={TEMPERATURE_LABEL}
        selected={search.temperature}
        onChange={(temperature: Temperature[]) =>
          update({ temperature: temperature.length ? temperature : undefined })
        }
      />
      <SourceAgentCounsellorFilters search={search} update={update} />
      <DateFilter
        from={search.createdFrom}
        to={search.createdTo}
        onChange={(createdFrom, createdTo) => update({ createdFrom, createdTo })}
      />
      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            update({
              q: undefined,
              stage: undefined,
              temperature: undefined,
              createdFrom: undefined,
              createdTo: undefined,
              sourceId: undefined,
              agentId: undefined,
              counsellorId: undefined,
            })
          }
        >
          Clear
        </Button>
      )}
    </div>
  );
}

function DateFilter({
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
      <legend className="sr-only">Created between</legend>
      <Input
        type="date"
        aria-label="Created from"
        value={from ?? ""}
        max={to}
        onChange={(e) => onChange(e.target.value || undefined, to)}
        className="h-8 w-36"
      />
      <span className="text-muted-foreground">–</span>
      <Input
        type="date"
        aria-label="Created to"
        value={to ?? ""}
        min={from}
        onChange={(e) => onChange(from, e.target.value || undefined)}
        className="h-8 w-36"
      />
    </fieldset>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const { from, to, lastPage } = pageRange(page, pageSize, total);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-2 text-sm"
    >
      <p className="text-muted-foreground">
        {formatCount(from)}–{formatCount(to)} of {formatCount(total)}
      </p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          Rows
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="h-8 rounded-md border bg-card px-1.5 text-foreground"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <span className="tabular-nums">
          {page} / {lastPage}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= lastPage}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

function LoadingRows() {
  return (
    <div
      className="space-y-2 rounded-lg border bg-card p-4"
      aria-busy="true"
      aria-label="Loading leads"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
