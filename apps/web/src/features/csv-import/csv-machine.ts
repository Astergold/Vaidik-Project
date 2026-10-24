import { MAX_IMPORT_BYTES, type ImportStatus } from "@vernacular/contracts";

/**
 * Shared CSV import wizard state (D3-I4-03b, generalised in D5-I4-01). Pure reducer over any upload response `U`:
 * steps, back/cancel, retryable failures and the "service not available" stop. Network calls live in the consumer's
 * api module (see csv-import-api.ts); their outcomes are dispatched here. Consumers: lead CSV import, applications.
 *
 *   choose ──upload ok──▶ map ──mapping saved──▶ preview ──commit ok──▶ progress
 *     ▲                    │◀────────── back ─────────│                    │
 *     └──────── cancel (any step, clears everything) ◀───────────────────┘
 *   any 404 "Route not found" ──▶ unavailable (backend not deployed)
 */
export type CsvWizardState<U> =
  | { step: "choose"; error: string | null }
  | { step: "map"; upload: U; error: string | null }
  | { step: "preview"; upload: U; error: string | null }
  | { step: "progress"; upload: U; importId: string }
  | { step: "unavailable" };

export type CsvWizardAction<U> =
  | { type: "fileRejected"; reason: string }
  | { type: "fileAccepted" }
  | { type: "uploaded"; upload: U }
  | { type: "mappingSaved" }
  | { type: "committed"; importId: string }
  | { type: "failed"; message: string }
  | { type: "back" }
  | { type: "cancel" }
  | { type: "serviceUnavailable" };

export const initialCsvWizard = {
  step: "choose",
  error: null,
} as const satisfies CsvWizardState<unknown>;

export function csvWizardReducer<U>(
  s: CsvWizardState<U>,
  a: CsvWizardAction<U>,
): CsvWizardState<U> {
  if (a.type === "cancel") return initialCsvWizard; // cancelling clears the upload, mapping and errors
  if (a.type === "serviceUnavailable") return { step: "unavailable" };
  switch (s.step) {
    case "choose":
      if (a.type === "fileAccepted") return { step: "choose", error: null };
      if (a.type === "fileRejected" || a.type === "failed")
        return { step: "choose", error: a.type === "failed" ? a.message : a.reason };
      if (a.type === "uploaded") return { step: "map", upload: a.upload, error: null };
      return s;
    case "map":
      if (a.type === "mappingSaved") return { step: "preview", upload: s.upload, error: null };
      if (a.type === "failed") return { ...s, error: a.message };
      if (a.type === "back") return initialCsvWizard;
      return s;
    case "preview":
      if (a.type === "committed")
        return { step: "progress", upload: s.upload, importId: a.importId };
      // A failed commit stays on preview with the error, so "Import" can simply be pressed again.
      if (a.type === "failed") return { ...s, error: a.message };
      if (a.type === "back") return { step: "map", upload: s.upload, error: null };
      return s;
    case "progress":
    case "unavailable":
      return s;
  }
}

export const STEP_ORDER = ["choose", "map", "preview", "progress"] as const;
export type CsvStep = (typeof STEP_ORDER)[number];
export const STEP_LABEL: Record<CsvStep, string> = {
  choose: "Upload",
  map: "Map columns",
  preview: "Preview",
  progress: "Import",
};

/** Client-side file checks before uploading. The server re-checks (and owns parsing). */
export function checkFile(
  file: { name: string; size: number; type: string },
  maxBytes: number = MAX_IMPORT_BYTES,
): string | null {
  const isCsv =
    /\.csv$/i.test(file.name) && (file.type === "" || /csv|excel|plain/i.test(file.type));
  if (!isCsv) return "Choose a .csv file (export it from Excel or Google Sheets as CSV).";
  if (file.size === 0) return "That file is empty.";
  if (file.size > maxBytes)
    return `That file is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}. Split it into smaller files.`;
  return null;
}

export const formatBytes = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`
    : `${Math.ceil(n / 1024)} KB`;

/** Poll while the job is moving; stop once it's finished. */
export const isActive = (s: ImportStatus) => s === "queued" || s === "running";

/** Finished = the job has stopped (completed or failed), not merely waiting for a mapping. */
export const isFinished = (s: ImportStatus) => !isActive(s) && s !== "uploaded" && s !== "mapped";

export const percent = (done: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

export const STATUS_LABEL: Record<ImportStatus, string> = {
  uploaded: "Waiting",
  mapped: "Waiting",
  queued: "Queued",
  running: "Importing…",
  completed: "Finished",
  failed: "The import job failed",
};
