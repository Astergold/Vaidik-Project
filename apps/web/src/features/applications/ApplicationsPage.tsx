import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { APPLICATION_STATUSES } from "@vernacular/contracts";
import { FileText, FileUp, Loader2, Search, UserX } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate, useCanManage } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  APPLICATION_STATUS_LABEL,
  ApplicationStatusChip,
  formatInr,
  sourceLabel,
} from "@/features/applications/ApplicationParts";
import { useApplications } from "@/features/applications/applications-api";
import {
  hasApplicationFilters,
  toApplicationsQuery,
  type ApplicationsSearch,
  type PaidFilter,
} from "@/features/applications/applications-search";
import { MultiFilter } from "@/features/leads/LeadFilters";
import { usePrograms } from "@/features/programs/programs-api";
import { formatCount, formatDate } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

/** /applications (D5-I4-01): filterable list; filters live in the URL. */
export function ApplicationsPage({
  search,
  onSearch,
}: {
  search: ApplicationsSearch;
  onSearch: (patch: Partial<ApplicationsSearch>) => void;
}) {
  const canManage = useCanManage();
  return (
    <RoleGate page="applications.list">
      <div className="mx-auto w-full max-w-7xl min-w-0 space-y-4">
        <PageHeader
          area="Applications"
          title="Applications"
          description="Form and fee status from the admissions portal, matched to your leads."
          actions={
            <>
              <Button asChild variant="outline">
                <Link to="/applications/unmatched">
                  <UserX /> Unmatched
                </Link>
              </Button>
              {canManage && (
                <Button asChild>
                  <Link to="/applications/import">
                    <FileUp /> Import
                  </Link>
                </Button>
              )}
            </>
          }
        />
        <Filters search={search} onSearch={onSearch} />
        <Results search={search} onClear={() => onSearch(CLEARED)} />
      </div>
    </RoleGate>
  );
}

const CLEARED: Partial<ApplicationsSearch> = {
  status: undefined,
  programId: undefined,
  paid: undefined,
  from: undefined,
  to: undefined,
  q: undefined,
};

const PAID_CHIPS: [PaidFilter | undefined, string][] = [
  [undefined, "All"],
  ["yes", "Fee paid"],
  ["no", "Not paid"],
];

function Filters({
  search,
  onSearch,
}: {
  search: ApplicationsSearch;
  onSearch: (patch: Partial<ApplicationsSearch>) => void;
}) {
  const programs = usePrograms();
  const [q, setQ] = useState(search.q ?? "");
  useEffect(() => setQ(search.q ?? ""), [search.q]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch({ q: q.trim() || undefined });
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div role="group" aria-label="Fee" className="inline-flex rounded-md border bg-card p-0.5">
        {PAID_CHIPS.map(([value, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={search.paid === value}
            onClick={() => onSearch({ paid: value })}
            className={cn(
              "rounded px-2.5 py-1 text-sm font-medium text-muted-foreground",
              search.paid === value && "bg-primary text-primary-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <MultiFilter
        label="Status"
        options={APPLICATION_STATUSES}
        labels={APPLICATION_STATUS_LABEL}
        selected={search.status}
        onChange={(status) => onSearch({ status })}
      />
      {programs.data ? (
        <MultiFilter
          label="Program"
          options={programs.data.items.map((p) => p.id)}
          labels={Object.fromEntries(programs.data.items.map((p) => [p.id, p.name]))}
          selected={search.programId}
          onChange={(programId) => onSearch({ programId })}
        />
      ) : (
        <Button variant="outline" size="sm" disabled>
          {programs.isPending ? "Program…" : "Programs unavailable"}
        </Button>
      )}
      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">Updated from</span>
        <Input
          type="date"
          value={search.from ?? ""}
          onChange={(e) => onSearch({ from: e.target.value || undefined })}
          className="h-8 w-auto"
        />
      </label>
      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">to</span>
        <Input
          type="date"
          value={search.to ?? ""}
          onChange={(e) => onSearch({ to: e.target.value || undefined })}
          className="h-8 w-auto"
        />
      </label>
      <form onSubmit={submit} className="relative min-w-0 flex-1 basis-56" role="search">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Application no., name, phone or email"
          aria-label="Search applications"
          className="h-8 pl-8"
          maxLength={100}
        />
      </form>
    </div>
  );
}

function Results({ search, onClear }: { search: ApplicationsSearch; onClear: () => void }) {
  const tz = useTenantTimeZone();
  const q = useApplications(toApplicationsQuery(search));
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;
  const filtered = hasApplicationFilters(search);
  return (
    <QueryGate
      q={q}
      what="applications"
      service="Applications"
      empty={
        items.length === 0 && (
          <StateCard
            icon={FileText}
            title={filtered ? "No applications match these filters" : "No applications yet"}
            action={
              filtered && (
                <Button variant="outline" size="sm" onClick={onClear}>
                  Clear filters
                </Button>
              )
            }
          >
            {filtered
              ? "Try a wider date range or fewer filters."
              : "Import the admissions portal export to see form and fee status here."}
          </StateCard>
        )
      }
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {formatCount(total)} {filtered ? "matching" : "in total"}
      </p>
      <div className="max-w-full overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Application no.</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead>Paid on</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="min-w-40">
                  <Link
                    to="/leads/$leadId"
                    params={{ leadId: a.lead.id }}
                    className="font-medium hover:underline"
                  >
                    {a.lead.name ?? "Unnamed lead"}
                  </Link>
                  {a.lead.phone && (
                    <span className="block text-xs text-muted-foreground">{a.lead.phone}</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {a.externalApplicationNo ?? "—"}
                </TableCell>
                <TableCell className="min-w-32">{a.program?.name ?? "—"}</TableCell>
                <TableCell>
                  <ApplicationStatusChip status={a.status} />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {formatInr(a.feeAmount)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {a.paidAt ? formatDate(a.paidAt, tz) : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">{sourceLabel(a.source)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(a.updatedAt, tz)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {q.hasNextPage && (
        <Button
          variant="outline"
          onClick={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
        >
          {q.isFetchingNextPage && <Loader2 className="animate-spin" />}
          Load more
        </Button>
      )}
    </QueryGate>
  );
}
