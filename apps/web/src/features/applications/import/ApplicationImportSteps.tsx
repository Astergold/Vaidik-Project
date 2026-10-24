import {
  APPLICATION_IMPORT_FIELDS,
  type ApplicationColumnMapping,
  type ApplicationImport,
  type ApplicationImportPreviewResponse,
  type CreateApplicationImportResponse,
} from "@vernacular/contracts";
import { FileUp, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { APPLICATION_STATUS_LABEL, formatInr } from "@/features/applications/ApplicationParts";
import { APP_FIELD_LABEL } from "@/features/applications/import/column-mapping";
import { isFinished, percent, STATUS_LABEL } from "@/features/csv-import/csv-machine";
import {
  FilePicker,
  PreviewFrame,
  ProgressFrame,
  UploadSummary,
  type ProgressView,
} from "@/features/csv-import/CsvSteps";
import { formatCount, formatDate } from "@/lib/labels";
import type { Remote } from "@/lib/remote";
import { cn } from "@/lib/utils";

/** Applications import steps (D5-I4-01), composed from the shared CSV wizard parts. Plain props for tests. */
export function ChooseStep({
  file,
  onFile,
  error,
  uploading,
  onUpload,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  error: string | null;
  uploading: boolean;
  onUpload: () => void;
}) {
  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload the admissions portal export as CSV, with a header row. Each row is matched to a lead
        by application number, then phone, then email. Rows we can&apos;t match go to the Unmatched
        list for you to review.
      </p>
      <FilePicker file={file} onFile={onFile} />
      {error && <FormAlert>{error}</FormAlert>}
      <Button onClick={onUpload} disabled={!file || uploading}>
        {uploading ? <Loader2 className="animate-spin" /> : <FileUp />}
        Upload and continue
      </Button>
    </section>
  );
}

export function MapStep({
  upload,
  mapping,
  onMapping,
  problem,
  error,
  saving,
  onSave,
  onBack,
}: {
  upload: CreateApplicationImportResponse;
  mapping: ApplicationColumnMapping;
  onMapping: (m: ApplicationColumnMapping) => void;
  problem: string | null;
  error: string | null;
  saving: boolean;
  onSave: () => void;
  onBack: () => void;
}) {
  return (
    <section className="space-y-4">
      <UploadSummary {...upload} />
      <div>
        <h2 className="text-sm font-semibold">Which column is which?</h2>
        <p className="text-xs text-muted-foreground">
          Status is required, plus at least one of application no., phone or email. Saved for your
          next import.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {APPLICATION_IMPORT_FIELDS.map((field) => (
          <div key={field} className="space-y-1">
            <label htmlFor={`map-${field}`} className="text-sm font-medium">
              {APP_FIELD_LABEL[field]}
            </label>
            <select
              id={`map-${field}`}
              value={mapping[field] ?? ""}
              onChange={(e) => onMapping({ ...mapping, [field]: e.target.value || undefined })}
              className="h-9 w-full rounded-md border bg-card px-2 text-sm"
            >
              <option value="">— Not in this file —</option>
              {upload.columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {(problem ?? error) && <FormAlert>{problem ?? error}</FormAlert>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          Save mapping and preview
        </Button>
      </div>
    </section>
  );
}

const MATCH_LABEL = {
  application_no: "Application no.",
  phone: "Phone",
  email: "Email",
  none: "No match",
} as const;

export function PreviewStep({
  preview,
  tz,
  error,
  committing,
  onCommit,
  onBack,
}: {
  preview: Remote<ApplicationImportPreviewResponse>;
  tz: string;
  error: string | null;
  committing: boolean;
  onCommit: () => void;
  onBack: () => void;
}) {
  return (
    <PreviewFrame
      preview={preview}
      error={error}
      committing={committing}
      onCommit={onCommit}
      onBack={onBack}
      summary={({ rows, totalRows }) => {
        const bad = rows.filter((r) => r.errors.length > 0).length;
        const unmatched = rows.filter((r) => r.match === "none" && r.errors.length === 0).length;
        return `First ${rows.length} of ${formatCount(totalRows)} rows: ${bad} would be rejected, ${unmatched} would go to Unmatched.`;
      }}
    >
      {({ rows }) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              <TableHead>Application no.</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead>Paid on</TableHead>
              <TableHead>Matched by</TableHead>
              <TableHead>Problems</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.rowNumber} className={cn(r.errors.length > 0 && "bg-destructive/5")}>
                <TableCell className="tabular-nums text-muted-foreground">{r.rowNumber}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.mapped?.externalApplicationNo ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">{r.mapped?.fullName ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.mapped?.status ? APPLICATION_STATUS_LABEL[r.mapped.status] : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatInr(r.mapped?.feeAmount ?? null)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.mapped?.paidAt ? formatDate(r.mapped.paidAt, tz) : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={r.match === "none" ? "outline" : "secondary"}>
                    {MATCH_LABEL[r.match]}
                  </Badge>
                </TableCell>
                <TableCell className="min-w-48 text-xs text-destructive">
                  {r.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PreviewFrame>
  );
}

export function applicationProgressView(job: ApplicationImport): ProgressView {
  const { updated, created, unmatched, failed } = job.counts;
  const finished = isFinished(job.status);
  return {
    label: STATUS_LABEL[job.status],
    pct: percent(updated + created + unmatched + failed, job.totalRows),
    counts: [
      { label: "Updated", value: updated },
      { label: "New applications", value: created },
      { label: "Unmatched", value: unmatched },
      { label: "Failed", value: failed, tone: failed > 0 ? "error" : undefined },
    ],
    finished,
    canDownload: finished && job.errorReportAvailable && failed > 0,
    jobFailed: job.status === "failed",
  };
}

export function ProgressStep(props: {
  status: Remote<ApplicationImport>;
  onDownload: () => void;
  downloading: boolean;
  downloadError: string | null;
  onRetryCommit: () => void;
  retrying: boolean;
  onDone: () => void;
}) {
  return <ProgressFrame {...props} view={applicationProgressView} />;
}
