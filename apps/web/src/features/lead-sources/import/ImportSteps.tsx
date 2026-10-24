import type { ReactNode } from "react";
import {
  MAX_IMPORT_ROWS,
  PREVIEW_ROWS,
  type CreateImportResponse,
  type ImportPreviewResponse,
  type LeadImport,
  type LeadSource,
} from "@vernacular/contracts";
import { FileUp, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STATUS_LABEL } from "@/features/csv-import/csv-machine";
import {
  FilePicker,
  PreviewFrame,
  ProgressFrame,
  ServiceUnavailable,
  UploadSummary,
  type ProgressView,
} from "@/features/csv-import/CsvSteps";
import { formatBytes, progressSummary } from "@/features/lead-sources/import/import-machine";
import type { MappingDraft } from "@/features/lead-sources/mapping";
import { MappingRows } from "@/features/lead-sources/MappingRows";
import type { FieldErrors } from "@/lib/forms";
import { formatCount } from "@/lib/labels";
import type { Remote } from "@/lib/remote";
import { cn } from "@/lib/utils";
import { MAX_IMPORT_BYTES } from "@vernacular/contracts";

/**
 * Lead CSV import steps (D3-I4-03b), composed from the shared wizard parts in features/csv-import. Plain props, so
 * every state renders in tests without a backend.
 */
export type { Remote };
export { StepIndicator } from "@/features/csv-import/CsvSteps";

export function ChooseStep({
  sources,
  sourceId,
  onSource,
  file,
  onFile,
  error,
  uploading,
  onUpload,
}: {
  sources: Remote<LeadSource[]>;
  sourceId: string;
  onSource: (id: string) => void;
  file: File | null;
  onFile: (f: File | null) => void;
  error: string | null;
  uploading: boolean;
  onUpload: () => void;
}) {
  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload a CSV with a header row: up to {formatCount(MAX_IMPORT_ROWS)} rows and{" "}
        {formatBytes(MAX_IMPORT_BYTES)}. Each row becomes a lead the same way a web form would
        (duplicates are merged, phone numbers are checked by the server).
      </p>
      <div className="space-y-1.5">
        <label htmlFor="import-source" className="text-sm font-medium">
          Lead source
        </label>
        {sources.kind === "loading" ? (
          <Skeleton className="h-9 w-64" aria-busy="true" aria-label="Loading sources" />
        ) : sources.kind === "error" ? (
          <FormAlert>
            Couldn&apos;t load sources.{" "}
            <button className="underline" onClick={sources.retry}>
              Retry
            </button>
          </FormAlert>
        ) : sources.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active lead sources yet. Create one first (e.g. type “CSV import”).
          </p>
        ) : (
          <select
            id="import-source"
            value={sourceId}
            onChange={(e) => onSource(e.target.value)}
            className="h-9 w-full max-w-sm rounded-md border bg-card px-2 text-sm"
          >
            <option value="">Choose a source…</option>
            {sources.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <p className="text-xs text-muted-foreground">
          The column mapping you choose is saved on this source for next time.
        </p>
      </div>
      <FilePicker file={file} onFile={onFile} />
      {error && <FormAlert>{error}</FormAlert>}
      <Button onClick={onUpload} disabled={!file || !sourceId || uploading}>
        {uploading ? <Loader2 className="animate-spin" /> : <FileUp />}
        Upload and continue
      </Button>
    </section>
  );
}

export function MapStep({
  upload,
  draft,
  onDraft,
  errors,
  error,
  saving,
  onSave,
  onBack,
}: {
  upload: CreateImportResponse;
  draft: MappingDraft;
  onDraft: (d: MappingDraft) => void;
  errors: FieldErrors;
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
          Leave a field on “auto” to let us recognise common headers (name, phone, mobile, email,
          city, course…).
        </p>
      </div>
      <MappingRows draft={draft} onChange={onDraft} errors={errors} columns={upload.columns} />
      {error && <FormAlert>{error}</FormAlert>}
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

const PREVIEW_FIELDS = [
  ["fullName", "Name", "full_name"],
  ["phone", "Phone", "phone"],
  ["email", "Email", "email"],
  ["city", "City", "city"],
  ["program", "Program", "program"],
] as const;

export function PreviewStep({
  preview,
  error,
  committing,
  onCommit,
  onBack,
}: {
  preview: Remote<ImportPreviewResponse>;
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
        return `First ${Math.min(PREVIEW_ROWS, rows.length)} of ${formatCount(totalRows)} rows${
          bad > 0 ? `: ${bad} of these would be rejected (highlighted).` : ": all look valid."
        }`;
      }}
    >
      {({ rows }) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              {PREVIEW_FIELDS.map(([, label]) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
              <TableHead>Problems</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const errFor = (field: string) => r.errors.find((e) => e.path === field);
              return (
                <TableRow
                  key={r.rowNumber}
                  className={cn(r.errors.length > 0 && "bg-destructive/5")}
                >
                  <TableCell className="tabular-nums text-muted-foreground">
                    {r.rowNumber}
                  </TableCell>
                  {PREVIEW_FIELDS.map(([key, label, field]) => (
                    <TableCell
                      key={key}
                      className={cn(
                        "whitespace-nowrap",
                        errFor(field) && "font-medium text-destructive",
                      )}
                      aria-invalid={errFor(field) ? true : undefined}
                      title={errFor(field)?.message}
                    >
                      {r.mapped?.[key] ?? <span className="text-muted-foreground">—</span>}
                      <span className="sr-only">{label}</span>
                    </TableCell>
                  ))}
                  <TableCell className="min-w-48 text-xs text-destructive">
                    {r.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </PreviewFrame>
  );
}

export function ProgressStep(props: {
  status: Remote<LeadImport>;
  onDownload: () => void;
  downloading: boolean;
  downloadError: string | null;
  onRetryCommit: () => void;
  retrying: boolean;
  onDone: () => void;
}) {
  return (
    <ProgressFrame
      {...props}
      view={(imp): ProgressView => {
        const p = progressSummary(imp);
        return {
          label: STATUS_LABEL[imp.status],
          pct: p.pct,
          counts: [
            { label: "Imported", value: p.imported },
            { label: "Already leads", value: p.duplicates },
            { label: "Failed", value: p.failed, tone: p.failed > 0 ? "error" : undefined },
            { label: "Still to process", value: p.pending },
          ],
          finished: p.finished,
          canDownload: p.finished && imp.errorReportAvailable && p.failed > 0,
          jobFailed: imp.status === "failed",
        };
      }}
    />
  );
}

export function Unavailable({ action }: { action: ReactNode }) {
  return (
    <ServiceUnavailable action={action}>
      CSV import needs a server feature that hasn&apos;t been switched on yet. Nothing was uploaded
      or imported. Leads can still arrive through the source&apos;s endpoint URL.
    </ServiceUnavailable>
  );
}
