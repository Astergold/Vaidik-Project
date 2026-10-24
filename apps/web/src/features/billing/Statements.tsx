import { useState } from "react";
import type { Statement } from "@vernacular/contracts";
import { Download, FileText, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { QueryGate } from "@/components/QueryGate";
import { StateCard } from "@/components/StateCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadStatement, useStatements } from "@/features/billing/billing-api";
import { formatPaise } from "@/lib/money";
import { errText } from "@/lib/seam";

const periodLabel = (p: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${p}-01T00:00:00Z`),
  );

/** Monthly statements with CSV/PDF downloads (D6-I4-03). Totals are the server's; files come via apiGetBlob. */
export function Statements() {
  const q = useStatements();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const items = q.data?.items ?? [];
  const download = (s: Statement, format: "csv" | "pdf") => {
    setBusy(`${s.id}:${format}`);
    setError(null);
    downloadStatement(s.id, s.period, format)
      .catch((e: unknown) => setError(e))
      .finally(() => setBusy(null));
  };
  return (
    <section className="min-w-0 space-y-2" aria-labelledby="statements-h">
      <h2 id="statements-h" className="text-lg font-semibold">
        Statements
      </h2>
      {error ? <FormAlert>{errText(error, "Couldn't download the statement.")}</FormAlert> : null}
      <QueryGate
        q={q}
        what="statements"
        service="Billing"
        empty={
          items.length === 0 && (
            <StateCard icon={FileText} title="No statements yet">
              A statement is created after each month ends.
            </StateCard>
          )
        }
      >
        <div className="max-w-full overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Plan fee</TableHead>
                <TableHead className="text-right">Usage</TableHead>
                <TableHead className="text-right">Overage</TableHead>
                <TableHead className="text-right">Top-ups</TableHead>
                <TableHead className="text-right">Total due</TableHead>
                <TableHead>
                  <span className="sr-only">Download</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {periodLabel(s.period)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(s.totals.planFeePaise)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(s.totals.usagePaise)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(s.totals.overagePaise)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(s.totals.topUpsPaise)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPaise(s.totals.totalDuePaise)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {s.formats.map((f) => (
                      <Button
                        key={f}
                        size="xs"
                        variant="outline"
                        className="ml-1"
                        disabled={busy !== null}
                        onClick={() => download(s, f)}
                        aria-label={`Download ${periodLabel(s.period)} as ${f.toUpperCase()}`}
                      >
                        {busy === `${s.id}:${f}` ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Download />
                        )}
                        {f.toUpperCase()}
                      </Button>
                    ))}
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
