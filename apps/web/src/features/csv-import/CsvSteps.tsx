import type { ReactNode } from "react";
import { AlertTriangle, Download, Loader2, PlugZap, RotateCw } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { StateCard } from "@/components/StateCard";
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
import {
  formatBytes,
  STEP_LABEL,
  STEP_ORDER,
  type CsvStep,
} from "@/features/csv-import/csv-machine";
import { formatCount } from "@/lib/labels";
import type { Remote } from "@/lib/remote";
import { cn } from "@/lib/utils";

/**
 * Presentational building blocks shared by every CSV import wizard (lead sources, applications). Plain props, so
 * each step renders in tests without a backend. Consumers add what is specific to them (source picker, mapping UI,
 * preview columns, counts).
 */
export function StepIndicator({ current }: { current: CsvStep }) {
  const idx = STEP_ORDER.indexOf(current);
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Import steps">
      {STEP_ORDER.map((s, i) => (
        <li
          key={s}
          aria-current={i === idx ? "step" : undefined}
          className={cn(
            "flex items-center gap-1.5",
            i === idx ? "font-semibold" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "grid size-5 place-items-center rounded-full border text-xs",
              i <= idx && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {i + 1}
          </span>
          {STEP_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}

export function FilePicker({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="import-file" className="text-sm font-medium">
        CSV file
      </label>
      <input
        id="import-file"
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        className="block w-full max-w-sm text-sm file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5 file:text-sm"
      />
      {file && (
        <p className="text-xs text-muted-foreground">
          {file.name} · {formatBytes(file.size)}
        </p>
      )}
    </div>
  );
}

/** What the server detected in the file, before mapping. */
export function UploadSummary({
  fileName,
  rowCount,
  columns,
  sampleRows,
}: {
  fileName: string;
  rowCount: number;
  columns: string[];
  sampleRows: string[][];
}) {
  return (
    <>
      <p className="text-sm" role="status">
        <span className="font-medium">{fileName}</span>: {formatCount(rowCount)} rows,{" "}
        {columns.length} columns detected.
      </p>
      {sampleRows.length > 0 && (
        <div className="max-w-full overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap">
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleRows.map((r, i) => (
                <TableRow key={i}>
                  {columns.map((c, j) => (
                    <TableCell key={c} className="whitespace-nowrap text-xs">
                      {r[j] ?? ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

/** Loading / error / no rows around a consumer-specific preview table, plus Back and Import. */
export function PreviewFrame<P extends { rows: unknown[]; totalRows: number }>({
  preview,
  summary,
  error,
  committing,
  onCommit,
  onBack,
  children,
}: {
  preview: Remote<P>;
  summary: (data: P) => string;
  error: string | null;
  committing: boolean;
  onCommit: () => void;
  onBack: () => void;
  children: (data: P) => ReactNode;
}) {
  if (preview.kind === "loading") {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading preview">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (preview.kind === "error") {
    return (
      <StateCard
        icon={AlertTriangle}
        title="Couldn't build the preview"
        tone="error"
        action={
          <Button variant="outline" size="sm" onClick={preview.retry}>
            <RotateCw /> Try again
          </Button>
        }
      >
        {preview.message}
      </StateCard>
    );
  }
  if (preview.data.rows.length === 0) {
    return (
      <StateCard
        icon={AlertTriangle}
        title="No rows to import"
        action={
          <Button variant="outline" size="sm" onClick={onBack}>
            Back to mapping
          </Button>
        }
      >
        The file has a header but no data rows.
      </StateCard>
    );
  }
  return (
    <section className="space-y-4">
      <p className="text-sm" role="status">
        {summary(preview.data)}
      </p>
      <div className="max-w-full overflow-x-auto rounded-md border bg-card">
        {children(preview.data)}
      </div>
      {error && <FormAlert>{error}</FormAlert>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onBack} disabled={committing}>
          Back to mapping
        </Button>
        <Button onClick={onCommit} disabled={committing}>
          {committing && <Loader2 className="animate-spin" />}
          {error ? "Retry import" : `Import ${formatCount(preview.data.totalRows)} rows`}
        </Button>
      </div>
    </section>
  );
}

export interface CountDef {
  label: string;
  value: number;
  tone?: "error";
}
export interface ProgressView {
  label: string;
  pct: number;
  counts: CountDef[];
  finished: boolean;
  /** Offer the error report (finished, with failures, report ready). */
  canDownload: boolean;
  jobFailed: boolean;
}

/** Job status from the server: progress bar, counts, error report, retry, done. */
export function ProgressFrame<J>({
  status,
  view,
  onDownload,
  downloading,
  downloadError,
  onRetryCommit,
  retrying,
  onDone,
}: {
  status: Remote<J>;
  view: (job: J) => ProgressView;
  onDownload: () => void;
  downloading: boolean;
  downloadError: string | null;
  onRetryCommit: () => void;
  retrying: boolean;
  onDone: () => void;
}) {
  if (status.kind === "loading")
    return <Skeleton className="h-32 w-full" aria-busy="true" aria-label="Loading import status" />;
  if (status.kind === "error") {
    return (
      <StateCard
        icon={AlertTriangle}
        title="Couldn't get the import status"
        tone="error"
        action={
          <Button variant="outline" size="sm" onClick={status.retry}>
            <RotateCw /> Try again
          </Button>
        }
      >
        {status.message} The import keeps running on the server.
      </StateCard>
    );
  }
  const v = view(status.data);
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium" role="status">
          {v.label} · {v.pct}%
        </p>
        <div
          className="mt-2 h-2 rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={v.pct}
          aria-label="Import progress"
        >
          <div
            className="h-2 rounded-full bg-primary transition-[width]"
            style={{ width: `${v.pct}%` }}
          />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {v.counts.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{c.label}</dt>
            <dd className={cn("text-xl font-semibold", c.tone === "error" && "text-destructive")}>
              {formatCount(c.value)}
            </dd>
          </div>
        ))}
      </dl>
      {downloadError && <FormAlert>{downloadError}</FormAlert>}
      <div className="flex flex-wrap gap-2">
        {v.canDownload && (
          <Button variant="outline" onClick={onDownload} disabled={downloading}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            Download error report
          </Button>
        )}
        {v.jobFailed && (
          <Button onClick={onRetryCommit} disabled={retrying}>
            {retrying ? <Loader2 className="animate-spin" /> : <RotateCw />}
            Retry import
          </Button>
        )}
        {v.finished && <Button onClick={onDone}>Done</Button>}
      </div>
    </section>
  );
}

export function ServiceUnavailable({
  action,
  children,
}: {
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <StateCard icon={PlugZap} title="Import service not available yet" action={action}>
      {children}
    </StateCard>
  );
}
