import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CALL_STATUSES,
  callsResponse,
  type CallListItem,
  type CallStatus,
} from "@vernacular/contracts";
import { Loader2, PhoneCall, Play, Search, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
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
import { describeRejection } from "@/features/lead360/reject-codes";
import { MultiFilter } from "@/features/leads/LeadFilters";
import { TemperatureTag } from "@/features/leads/LeadsTable";
import { apiGet, type QueryValue } from "@/lib/api";
import { formatCount, formatDateTime, formatMinSec } from "@/lib/labels";
import { SEAM_META } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";

export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  reserved: "Queued",
  dialing: "Dialling",
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
  no_answer: "No answer",
  busy: "Busy",
  rejected: "Blocked",
};
const dispositionLabel = (d: string) => d.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

interface Filters {
  status?: CallStatus[];
  disposition?: string[];
  from?: string;
  to?: string;
  q?: string;
}

const useCalls = (f: Filters) => {
  const query: Record<string, QueryValue> = { ...f, limit: 50 };
  return useInfiniteQuery({
    queryKey: ["calls", "list", query],
    queryFn: ({ pageParam }) =>
      apiGet("/api/calls", callsResponse, { ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
    meta: SEAM_META,
  });
};

/**
 * /calls (D6-I4-04e): every call the viewer may see (scoped by the server) with status, outcome, length, the AI's
 * temperature and the recording. Recordings play through <audio src="/api/calls/:id/recording">: the browser
 * follows the API's 302 to a short-lived URL (no download through JS).
 */
export function CallsPage() {
  return (
    <RoleGate page="calls.list">
      <View />
    </RoleGate>
  );
}

function View() {
  const [filters, setFilters] = useState<Filters>({});
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: term.trim() || undefined })), 300);
    return () => clearTimeout(t);
  }, [term]);
  const q = useCalls(filters);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const dispositions = q.data?.pages[0]?.dispositions ?? [];
  const filtered = Boolean(
    filters.status?.length ||
    filters.disposition?.length ||
    filters.from ||
    filters.to ||
    filters.q,
  );
  const set = (patch: Filters) => setFilters((f) => ({ ...f, ...patch }));
  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 space-y-4">
      <PageHeader
        area="Calls"
        title="Calls"
        description="Every AI and counsellor call, with outcome and recording."
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Name or phone digits"
            aria-label="Search calls"
            className="h-8 pl-8"
            maxLength={100}
          />
        </div>
        <MultiFilter
          label="Status"
          options={CALL_STATUSES}
          labels={CALL_STATUS_LABEL}
          selected={filters.status}
          onChange={(status) => set({ status: status.length ? status : undefined })}
        />
        {dispositions.length > 0 && (
          <MultiFilter
            label="Outcome"
            options={dispositions}
            labels={Object.fromEntries(dispositions.map((d) => [d, dispositionLabel(d)]))}
            selected={filters.disposition}
            onChange={(disposition) =>
              set({ disposition: disposition.length ? disposition : undefined })
            }
          />
        )}
        <Input
          type="date"
          aria-label="From"
          value={filters.from ?? ""}
          max={filters.to}
          onChange={(e) => set({ from: e.target.value || undefined })}
          className="h-8 w-auto"
        />
        <Input
          type="date"
          aria-label="To"
          value={filters.to ?? ""}
          min={filters.from}
          onChange={(e) => set({ to: e.target.value || undefined })}
          className="h-8 w-auto"
        />
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters({});
              setTerm("");
            }}
          >
            Clear
          </Button>
        )}
      </div>
      <QueryGate
        q={q}
        what="calls"
        service="Calls"
        empty={
          items.length === 0 && (
            <StateCard
              icon={PhoneCall}
              title={filtered ? "No calls match these filters" : "No calls yet"}
            >
              {filtered
                ? "Try a wider date range."
                : "Calls appear here as soon as the AI dials a lead."}
            </StateCard>
          )
        }
      >
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {formatCount(q.data?.pages[0]?.total ?? 0)} {filtered ? "matching" : "in total"}
        </p>
        <div className="max-w-full overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Length</TableHead>
                <TableHead>AI temp.</TableHead>
                <TableHead>Recording</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <CallRow key={c.id} c={c} />
              ))}
            </TableBody>
          </Table>
        </div>
        {q.hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
          >
            {q.isFetchingNextPage && <Loader2 className="animate-spin" />}
            Load more
          </Button>
        )}
      </QueryGate>
    </div>
  );
}

function CallRow({ c }: { c: CallListItem }) {
  const tz = useTenantTimeZone();
  const [playing, setPlaying] = useState(false);
  const blocked = c.rejectCode ? describeRejection(c.rejectCode, null, tz) : null;
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {formatDateTime(c.startedAt ?? c.createdAt, tz)}
      </TableCell>
      <TableCell className="min-w-36">
        <Link
          to="/leads/$leadId"
          params={{ leadId: c.lead.id }}
          className="font-medium hover:underline"
        >
          {c.lead.name ?? "Unnamed lead"}
        </Link>
        {c.lead.phone && (
          <span className="block text-xs text-muted-foreground tabular-nums">{c.lead.phone}</span>
        )}
      </TableCell>
      <TableCell className="min-w-28">
        {c.agent?.displayName ?? <span className="text-muted-foreground">Counsellor</span>}
        {c.campaign && (
          <span className="block text-xs text-muted-foreground">{c.campaign.name}</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Badge
          variant={
            c.status === "completed"
              ? "secondary"
              : c.status === "rejected" || c.status === "failed"
                ? "destructive"
                : "outline"
          }
        >
          {CALL_STATUS_LABEL[c.status]}
        </Badge>
        {blocked && (
          <span className="block font-mono text-xs text-muted-foreground" title={blocked.detail}>
            {blocked.code}
          </span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {c.disposition ? dispositionLabel(c.disposition) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatMinSec(c.durationS)}</TableCell>
      <TableCell>
        {c.temperature ? (
          <TemperatureTag value={c.temperature} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="min-w-28">
        {!c.hasRecording ? (
          <span className="text-muted-foreground">—</span>
        ) : playing ? (
          <span className="flex items-center gap-1">
            <audio
              controls
              autoPlay
              preload="none"
              src={`/api/calls/${c.id}/recording`}
              className="h-8 w-56 max-w-full"
              aria-label={`Recording of the call with ${c.lead.name ?? "this lead"}`}
            />
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Close player"
              onClick={() => setPlaying(false)}
            >
              <X />
            </Button>
          </span>
        ) : (
          <Button
            size="xs"
            variant="outline"
            onClick={() => setPlaying(true)}
            aria-label={`Play recording of the call with ${c.lead.name ?? "this lead"}`}
          >
            <Play /> Play
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
