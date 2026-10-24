import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import type { LeadListItem } from "@vernacular/contracts";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LEADS_DEFAULTS, nextSort, type LeadSort } from "@/features/leads/leads-search";
import {
  formatDate,
  formatDateTime,
  NEXT_STEP_LABEL,
  STAGE_LABEL,
  TEMPERATURE_DOT,
  TEMPERATURE_LABEL,
} from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Leads table (desktop) and card list (< lg) — D2-I4-03. Server-side paging/sorting: the URL owns that
 * state, so the table only uses the core row model. Phones render exactly as the API sends them
 * (already masked for counsellors).
 */
const features = tableFeatures({});
const col = createColumnHelper<typeof features, LeadListItem>();

const columns = col.columns([
  col.accessor((l) => l.person.fullName, {
    id: "name",
    header: () => <SortHeader field="full_name">Name</SortHeader>,
    cell: ({ row }) => <NameCell lead={row.original} />,
  }),
  col.accessor((l) => l.person.phone, {
    id: "phone",
    header: "Phone",
    cell: ({ getValue }) => <span className="tabular-nums">{getValue() ?? "—"}</span>,
  }),
  col.accessor("stage", {
    header: "Stage",
    cell: ({ row }) => <StageBadge lead={row.original} />,
  }),
  col.accessor("temperature", {
    header: "Temp.",
    cell: ({ row }) => <TemperatureTag value={row.original.temperature} />,
  }),
  col.accessor("nextStep", {
    id: "nextStep",
    header: () => <SortHeader field="next_step_due_at">Next step</SortHeader>,
    cell: ({ row }) => <NextStepCell lead={row.original} />,
  }),
  col.accessor((l) => l.owner?.name ?? l.aiAgent?.displayName ?? null, {
    id: "owner",
    header: "Owner",
    cell: ({ row }) => <OwnerCell lead={row.original} />,
  }),
  col.accessor((l) => l.source?.name ?? null, {
    id: "source",
    header: "Source",
    cell: ({ getValue }) => getValue() ?? <Muted>—</Muted>,
  }),
  col.accessor("callCount", {
    header: "Calls",
    cell: ({ row }) => <CallsCell lead={row.original} />,
  }),
  col.accessor("createdAt", {
    header: () => <SortHeader field="created_at">Created</SortHeader>,
    cell: ({ getValue }) => <When iso={getValue()} />,
  }),
]);

/** Row selection for bulk actions (D6-I4-04b); omitted for roles without bulk actions. */
export interface LeadSelection {
  selected: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
}

export function LeadsTable({
  items,
  selection,
}: {
  items: LeadListItem[];
  selection?: LeadSelection;
}) {
  const table = useTable({ features, columns, data: items });
  const allOn = items.length > 0 && items.every((l) => selection?.selected.has(l.id));
  const someOn = !allOn && items.some((l) => selection?.selected.has(l.id));
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border bg-card lg:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {selection && (
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all leads on this page"
                      checked={allOn}
                      ref={(el) => {
                        if (el) el.indeterminate = someOn;
                      }}
                      onChange={(e) => selection.onToggleAll(e.target.checked)}
                    />
                  </TableHead>
                )}
                {group.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={selection?.selected.has(row.original.id) ? "selected" : undefined}
              >
                {selection && (
                  <TableCell className="align-top">
                    <SelectBox lead={row.original} selection={selection} />
                  </TableCell>
                )}
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="align-top">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 lg:hidden" aria-label="Leads">
        {items.map((lead) => (
          <li key={lead.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                {selection && <SelectBox lead={lead} selection={selection} />}
                <NameCell lead={lead} />
              </div>
              <TemperatureTag value={lead.temperature} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="tabular-nums">{lead.person.phone ?? "—"}</span>
              <StageBadge lead={lead} />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <NextStepCell lead={lead} />
              <span>
                Created <When iso={lead.createdAt} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function SelectBox({ lead, selection }: { lead: LeadListItem; selection: LeadSelection }) {
  return (
    <input
      type="checkbox"
      className="mt-1 shrink-0"
      aria-label={`Select ${lead.person.fullName ?? "unnamed lead"}`}
      checked={selection.selected.has(lead.id)}
      onChange={(e) => selection.onToggle(lead.id, e.target.checked)}
    />
  );
}

function SortHeader({ field, children }: { field: LeadSort; children: string }) {
  const search = useSearch({ from: "/leads/" });
  const navigate = useNavigate({ from: "/leads/" });
  const active = (search.sort ?? LEADS_DEFAULTS.sort) === field;
  const order = search.order ?? LEADS_DEFAULTS.order;
  const Icon = !active ? ArrowUpDown : order === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => void navigate({ search: (prev) => ({ ...prev, ...nextSort(prev, field) }) })}
      className={cn(
        "-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground",
        active && "text-foreground",
      )}
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : undefined}
    >
      {children}
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}

function NameCell({ lead }: { lead: LeadListItem }) {
  const sub = [lead.program?.name, lead.person.city].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <Link
        to="/leads/$leadId"
        params={{ leadId: lead.id }}
        className="font-medium text-foreground hover:text-primary hover:underline"
      >
        {lead.person.fullName ?? "Unnamed lead"}
      </Link>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function StageBadge({ lead }: { lead: LeadListItem }) {
  const closed = lead.stage === "lost" || lead.stage === "invalid";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge
        variant={closed ? "outline" : "secondary"}
        className={cn(closed && "text-muted-foreground")}
      >
        {STAGE_LABEL[lead.stage]}
      </Badge>
      {lead.subStage && <span className="text-xs text-muted-foreground">{lead.subStage}</span>}
    </span>
  );
}

export function TemperatureTag({ value }: { value: LeadListItem["temperature"] }) {
  const key = value ?? "unrated";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span className={cn("size-2 rounded-full", TEMPERATURE_DOT[key])} aria-hidden />
      <span className={cn(!value && "text-muted-foreground")}>{TEMPERATURE_LABEL[key]}</span>
    </span>
  );
}

function NextStepCell({ lead }: { lead: LeadListItem }) {
  if (!lead.nextStep || lead.nextStep === "none") return <Muted>—</Muted>;
  return (
    <span>
      {NEXT_STEP_LABEL[lead.nextStep]}
      {lead.nextStepDueAt && (
        <span className="text-muted-foreground">
          {" · "}
          <When iso={lead.nextStepDueAt} withTime />
        </span>
      )}
    </span>
  );
}

function OwnerCell({ lead }: { lead: LeadListItem }) {
  if (lead.owner) return <span>{lead.owner.name}</span>;
  if (lead.aiAgent)
    return <span className="text-muted-foreground">AI · {lead.aiAgent.displayName}</span>;
  return <Muted>Unassigned</Muted>;
}

function CallsCell({ lead }: { lead: LeadListItem }) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      {lead.callCount}
      {lead.lastCallAt && (
        <span className="block text-xs text-muted-foreground">
          last <When iso={lead.lastCallAt} />
        </span>
      )}
    </span>
  );
}

function When({ iso, withTime }: { iso: string; withTime?: boolean }) {
  const tz = useTenantTimeZone();
  return (
    <time dateTime={iso} className="whitespace-nowrap">
      {withTime ? formatDateTime(iso, tz) : formatDate(iso, tz)}
    </time>
  );
}

const Muted = ({ children }: { children: string }) => (
  <span className="text-muted-foreground">{children}</span>
);
