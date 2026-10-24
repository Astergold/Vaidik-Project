import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { complianceReport, VIOLATION_KINDS, type ComplianceReport } from "@vernacular/contracts";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addDays, formatDateKey, todayIn } from "@/features/dashboard/dashboard-search";
import { apiGet } from "@/lib/api";
import { formatCount, formatDateTime } from "@/lib/labels";
import { SEAM_META } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

export const VIOLATION_LABEL: Record<ComplianceReport["violations"][number]["kind"], string> = {
  outside_window: "Outside calling hours",
  no_consent: "No consent",
  suppressed: "Suppressed number",
  over_cap: "Over attempt caps",
};

const useComplianceReport = (date: string) =>
  useQuery({
    queryKey: ["compliance", date],
    queryFn: () => apiGet("/api/admin/compliance-report", complianceReport, { date }),
    retry: false,
    meta: SEAM_META,
  });

/** /ai/compliance (D6-I4-04e): the nightly A5 audit of calls against the calling rules. Green when clean. */
export function CompliancePage() {
  return (
    <RoleGate page="ai.compliance">
      <View />
    </RoleGate>
  );
}

function View() {
  const tz = useTenantTimeZone();
  const [date, setDate] = useState(() => addDays(todayIn(tz), -1));
  const q = useComplianceReport(date);
  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
      <PageHeader
        area="AI"
        title="Compliance report"
        description="Every night we check the day's calls against calling hours, consent, the do-not-call lists and attempt caps."
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Night of</span>
            <Input
              type="date"
              value={date}
              max={todayIn(tz)}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="h-8 w-auto"
            />
          </label>
        }
      />
      <QueryGate q={q} what="the compliance report" service="Compliance report">
        {q.data && <Report r={q.data} tz={tz} />}
      </QueryGate>
    </div>
  );
}

function Report({ r, tz }: { r: ComplianceReport; tz: string }) {
  const clean = r.violations.length === 0;
  const counts = VIOLATION_KINDS.map(
    (k) => [k, r.violations.filter((v) => v.kind === k).length] as const,
  );
  return (
    <>
      <section
        aria-label="Summary"
        className={cn(
          "flex min-w-0 items-start gap-3 rounded-lg border p-4",
          clean ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5",
        )}
      >
        {clean ? (
          <ShieldCheck className="size-6 shrink-0 text-primary" aria-hidden />
        ) : (
          <ShieldAlert className="size-6 shrink-0 text-destructive" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="text-lg font-semibold">
            {clean
              ? "0 violations"
              : `${formatCount(r.violations.length)} violation${r.violations.length === 1 ? "" : "s"}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatCount(r.checkedCalls)} calls checked for {formatDateKey(r.date)} · generated{" "}
            {formatDateTime(r.generatedAt, tz)}
          </p>
        </div>
      </section>
      {!clean && (
        <>
          <ul className="flex flex-wrap gap-2" aria-label="By rule">
            {counts.map(([k, n]) => (
              <li
                key={k}
                className={cn(
                  "rounded-md border bg-card px-3 py-1.5 text-sm",
                  n > 0 && "border-destructive/40",
                )}
              >
                {VIOLATION_LABEL[k]}: <span className="font-semibold tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
          <div className="max-w-full overflow-x-auto rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>What happened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.violations.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(v.occurredAt, tz)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{VIOLATION_LABEL[v.kind]}</TableCell>
                    <TableCell className="min-w-32">
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: v.lead.id }}
                        className="font-medium hover:underline"
                      >
                        {v.lead.name ?? "Unnamed lead"}
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-48 break-words">{v.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
