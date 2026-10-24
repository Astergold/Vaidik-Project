import { useState, type FormEvent } from "react";
import {
  createExportBody,
  EXPORT_KINDS,
  type ExportJob,
  type ExportKind,
} from "@vernacular/contracts";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadExport, useExports, useRequestExport } from "@/features/reports/reports-api";
import { formatCount, formatDateTime } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";

const KIND_LABEL: Record<ExportKind, string> = {
  leads: "Leads",
  calls: "Calls",
  applications: "Applications",
};
const STATUS: Record<
  ExportJob["status"],
  ["default" | "secondary" | "outline" | "destructive", string]
> = {
  queued: ["outline", "Queued"],
  running: ["outline", "Building…"],
  ready: ["secondary", "Ready"],
  failed: ["destructive", "Failed"],
};

/** /reports/exports (D6-I4-04d): request a CSV (built by a job), watch it, download it. Scoped like the lists. */
export function ExportsPage() {
  return (
    <RoleGate page="reports.exports">
      <div className="mx-auto w-full max-w-4xl min-w-0 space-y-4">
        <PageHeader
          area="Reports"
          title="Exports"
          description="CSV files of leads, calls and applications. Files are kept for a few days."
        />
        <RequestForm />
        <Jobs />
      </div>
    </RoleGate>
  );
}

function RequestForm() {
  const request = useRequestExport();
  const [kind, setKind] = useState<ExportKind>("leads");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = createExportBody.safeParse({ kind, from: from || undefined, to: to || undefined });
    if (!r.success) return setProblem(r.error.issues[0]?.message ?? "Check the dates");
    setProblem(null);
    request.mutate(r.data);
  };
  return (
    <form
      noValidate
      onSubmit={submit}
      className="min-w-0 space-y-3 rounded-lg border bg-card p-4"
      aria-label="New export"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="exp-kind">What</Label>
          <select
            id="exp-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ExportKind)}
            className="h-9 rounded-md border bg-card px-2 text-sm"
          >
            {EXPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="exp-from">From (optional)</Label>
          <Input
            id="exp-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-auto"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="exp-to">To (optional)</Label>
          <Input
            id="exp-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-auto"
          />
        </div>
        <Button type="submit" disabled={request.isPending}>
          {request.isPending ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
          Create CSV
        </Button>
      </div>
      {problem && <p className="text-sm text-destructive">{problem}</p>}
      {request.isError && (
        <FormAlert>{errText(request.error, "Couldn't start the export.")}</FormAlert>
      )}
    </form>
  );
}

function Jobs() {
  const tz = useTenantTimeZone();
  const q = useExports();
  const [error, setError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const items = q.data?.items ?? [];
  const get = (j: ExportJob) => {
    setDownloading(j.id);
    setError(null);
    downloadExport(j)
      .catch((e: unknown) => setError(e))
      .finally(() => setDownloading(null));
  };
  return (
    <section className="min-w-0 space-y-2" aria-labelledby="jobs-h">
      <h2 id="jobs-h" className="text-lg font-semibold">
        Recent exports
      </h2>
      {error ? <FormAlert>{errText(error, "Couldn't download the file.")}</FormAlert> : null}
      <QueryGate
        q={q}
        what="exports"
        service="Reports"
        empty={
          items.length === 0 && (
            <StateCard icon={FileSpreadsheet} title="No exports yet">
              Create one above, or export selected leads from the Leads list.
            </StateCard>
          )
        }
      >
        <ul className="space-y-2">
          {items.map((j) => {
            const [variant, label] = STATUS[j.status];
            return (
              <li
                key={j.id}
                className="flex min-w-0 flex-wrap items-center gap-3 rounded-md border bg-card p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {KIND_LABEL[j.kind]}
                    <Badge variant={variant}>{label}</Badge>
                  </p>
                  <p className="text-xs break-words text-muted-foreground">
                    {j.description} · requested {formatDateTime(j.createdAt, tz)}
                    {j.requestedBy && ` by ${j.requestedBy}`}
                    {j.rowCount !== null && ` · ${formatCount(j.rowCount)} rows`}
                    {j.expiresAt &&
                      j.status === "ready" &&
                      ` · available until ${formatDateTime(j.expiresAt, tz)}`}
                  </p>
                  {j.failureReason && <p className="text-xs text-destructive">{j.failureReason}</p>}
                </div>
                {j.status === "ready" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={downloading === j.id}
                    onClick={() => get(j)}
                    aria-label={`Download ${KIND_LABEL[j.kind]} CSV from ${formatDateTime(j.createdAt, tz)}`}
                  >
                    {downloading === j.id ? <Loader2 className="animate-spin" /> : <Download />}
                    Download
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </QueryGate>
    </section>
  );
}
