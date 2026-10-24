import { useState } from "react";
import { SEAT_BUCKETS, type ProgramDetail, type SeatBucket } from "@vernacular/contracts";
import { GraduationCap, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInr } from "@/features/applications/ApplicationParts";
import { todayIn } from "@/features/dashboard/dashboard-search";
import {
  academicYearOf,
  nextYear,
  seatFor,
  tuitionFor,
  upcomingDeadlines,
} from "@/features/programs/matrix";
import { usePrograms, useProgramMutations } from "@/features/programs/programs-api";
import { BUCKET_LABEL, useCanMutateCatalog } from "@/features/programs/ProgramsPage";
import { formatDate } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

const DEADLINE_LABEL: Record<string, string> = {
  application: "Applications",
  fee_payment: "Fee payment",
  documents: "Documents",
  admission_close: "Admissions close",
};
const BUCKET_VARIANT: Record<SeatBucket, "secondary" | "outline" | "destructive"> = {
  open: "secondary",
  limited: "outline",
  closed: "destructive",
};

/**
 * /programs/matrix (D6-I4-04d): every program × the academic year's seat bucket (categorical only), tuition and the
 * next deadlines. Owners/admins flip a bucket inline (PUT /api/programs/:id/seat, D4 contract); heads read.
 */
export function MatrixPage() {
  return (
    <RoleGate page="programs.matrix">
      <View />
    </RoleGate>
  );
}

function View() {
  const tz = useTenantTimeZone();
  const current = academicYearOf(todayIn(tz));
  const [year, setYear] = useState(current);
  const { canMutate } = useCanMutateCatalog();
  const q = usePrograms();
  const items = [...(q.data?.items ?? [])].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name),
  );
  const nowIso = new Date().toISOString();
  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-4">
      <PageHeader
        area="Programs"
        title="Seats & deadlines"
        description="What the AI agents say about availability: open, limited or closed — never a seat count."
        actions={
          <div
            role="group"
            aria-label="Academic year"
            className="inline-flex rounded-md border bg-card p-0.5"
          >
            {[current, nextYear(current)].map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={year === y}
                onClick={() => setYear(y)}
                className={cn(
                  "rounded px-2.5 py-1 text-sm font-medium text-muted-foreground",
                  year === y && "bg-primary text-primary-foreground",
                )}
              >
                {y}
              </button>
            ))}
          </div>
        }
      />
      {!canMutate && (
        <p className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          View only — owners and admins change seat availability.
        </p>
      )}
      <QueryGate
        q={q}
        what="programs"
        service="Programs"
        empty={
          items.length === 0 && (
            <StateCard icon={GraduationCap} title="No programs yet">
              Add programs under Programs first.
            </StateCard>
          )
        }
      >
        <div className="max-w-full overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Program</TableHead>
                <TableHead>Seats {year}</TableHead>
                <TableHead className="text-right">Tuition</TableHead>
                <TableHead>Next deadlines</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id} className={p.isActive ? undefined : "text-muted-foreground"}>
                  <TableCell className="min-w-40">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.code ?? "No code"}
                      {!p.isActive && " · inactive"}
                    </p>
                  </TableCell>
                  <TableCell className="min-w-56">
                    <SeatCell program={p} year={year} canMutate={canMutate} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatInr(tuitionFor(p, year))}
                  </TableCell>
                  <TableCell className="min-w-48">
                    {upcomingDeadlines(p, nowIso).length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {upcomingDeadlines(p, nowIso).map((d) => (
                          <li key={d.id} className="text-sm">
                            {DEADLINE_LABEL[d.kind] ?? d.kind} ·{" "}
                            <span className="whitespace-nowrap">{formatDate(d.dueAt, tz)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
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

function SeatCell({
  program: p,
  year,
  canMutate,
}: {
  program: ProgramDetail;
  year: string;
  canMutate: boolean;
}) {
  const m = useProgramMutations(p.id);
  const bucket = seatFor(p, year);
  if (!canMutate)
    return bucket ? (
      <Badge variant={BUCKET_VARIANT[bucket]}>{BUCKET_LABEL[bucket]}</Badge>
    ) : (
      <span className="text-muted-foreground">Not set</span>
    );
  return (
    <div className="space-y-1">
      <div
        role="group"
        aria-label={`Seats for ${p.name}`}
        className="inline-flex flex-wrap rounded-md border p-0.5"
      >
        {SEAT_BUCKETS.map((b) => (
          <button
            key={b}
            type="button"
            aria-pressed={bucket === b}
            disabled={m.setSeat.isPending}
            onClick={() => bucket !== b && m.setSeat.mutate({ academicYear: year, bucket: b })}
            className={cn(
              "rounded px-2 py-0.5 text-xs font-medium text-muted-foreground",
              bucket === b &&
                (b === "closed"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-primary text-primary-foreground"),
            )}
          >
            {BUCKET_LABEL[b]}
          </button>
        ))}
        {m.setSeat.isPending && (
          <Loader2 className="ml-1 size-3.5 animate-spin self-center" aria-label="Saving" />
        )}
      </div>
      {m.setSeat.isError && (
        <p className="text-xs text-destructive">{errText(m.setSeat.error, "Couldn't save.")}</p>
      )}
    </div>
  );
}
