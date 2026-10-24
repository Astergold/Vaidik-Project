import { describe, expect, it } from "vitest";
import { createImportResponse, leadImport, MAX_IMPORT_BYTES } from "@vernacular/contracts";
import {
  checkFile,
  initialWizard,
  progressSummary,
  wizardReducer,
  type WizardAction,
  type WizardState,
} from "@/features/lead-sources/import/import-machine";
import { isMissingRoute, ApiCallError } from "@/lib/api";

// Test fixtures only (validated against the proposed contract) — the app never fabricates rows.
const upload = createImportResponse.parse({
  importId: "01a14679-0000-7000-8000-000000000001",
  sourceId: "01a14679-1d11-775e-86f3-891dd1d80a60",
  fileName: "leads.csv",
  rowCount: 5000,
  columns: ["Student Name", "Mobile No"],
  sampleRows: [["Asha Rao", "98765 43210"]],
  mapping: {},
});
const run = (...actions: WizardAction[]) =>
  actions.reduce<WizardState>(wizardReducer, initialWizard);

describe("import wizard step machine (D3-I4-03b)", () => {
  it("happy path: choose → map → preview → progress", () => {
    expect(run({ type: "uploaded", upload }).step).toBe("map");
    expect(run({ type: "uploaded", upload }, { type: "mappingSaved" }).step).toBe("preview");
    expect(
      run(
        { type: "uploaded", upload },
        { type: "mappingSaved" },
        { type: "committed", importId: upload.importId },
      ),
    ).toEqual({
      step: "progress",
      upload,
      importId: upload.importId,
    });
  });

  it("can't skip steps", () => {
    expect(run({ type: "mappingSaved" })).toEqual(initialWizard);
    expect(run({ type: "committed", importId: upload.importId })).toEqual(initialWizard);
    expect(run({ type: "uploaded", upload }, { type: "committed", importId: "x" }).step).toBe(
      "map",
    );
  });

  it("a failed commit stays on preview with the error, and is retryable", () => {
    const failed = run(
      { type: "uploaded", upload },
      { type: "mappingSaved" },
      { type: "failed", message: "Network down" },
    );
    expect(failed).toEqual({ step: "preview", upload, error: "Network down" });
    expect(wizardReducer(failed, { type: "committed", importId: upload.importId }).step).toBe(
      "progress",
    );
  });

  it("back goes one step; back from map discards the upload", () => {
    const preview = run({ type: "uploaded", upload }, { type: "mappingSaved" });
    expect(wizardReducer(preview, { type: "back" })).toEqual({ step: "map", upload, error: null });
    expect(run({ type: "uploaded", upload }, { type: "back" })).toEqual(initialWizard);
  });

  it("cancel clears everything from any step", () => {
    for (const s of [
      run({ type: "fileRejected", reason: "x" }),
      run({ type: "uploaded", upload }),
      run(
        { type: "uploaded", upload },
        { type: "mappingSaved" },
        { type: "committed", importId: upload.importId },
      ),
      run({ type: "serviceUnavailable" }),
    ]) {
      expect(wizardReducer(s, { type: "cancel" })).toEqual(initialWizard);
    }
  });

  it("a missing backend route stops the wizard in 'unavailable' (no spinner, no fake rows)", () => {
    expect(run({ type: "serviceUnavailable" })).toEqual({ step: "unavailable" });
    expect(isMissingRoute(new ApiCallError(404, "NOT_FOUND", "Route not found"))).toBe(true);
    expect(isMissingRoute(new ApiCallError(404, "NOT_FOUND", "Import not found"))).toBe(false); // a record, not the service
  });
});

describe("file checks", () => {
  it("accepts a CSV under the limit", () => {
    expect(checkFile({ name: "Leads Oct.CSV", size: 2048, type: "text/csv" })).toBeNull();
    expect(checkFile({ name: "leads.csv", size: 10, type: "" })).toBeNull(); // some OSes send no type
  });
  it("refuses other types, empty and oversized files with a clear message", () => {
    expect(checkFile({ name: "leads.xlsx", size: 10, type: "application/vnd.ms-excel" })).toMatch(
      /\.csv file/,
    );
    expect(checkFile({ name: "leads.csv", size: 0, type: "text/csv" })).toBe("That file is empty.");
    expect(checkFile({ name: "big.csv", size: MAX_IMPORT_BYTES + 1, type: "text/csv" })).toMatch(
      /limit is 10 MB/,
    );
  });
});

describe("progress summary", () => {
  it("counts and percentage from the server's numbers", () => {
    const imp = leadImport.parse({
      id: upload.importId,
      sourceId: upload.sourceId,
      fileName: "leads.csv",
      status: "running",
      totalRows: 5000,
      counts: { imported: 2000, duplicates: 400, failed: 100, pending: 2500 },
      errorReportAvailable: false,
      createdAt: "2026-10-17T00:00:00.000Z",
      finishedAt: null,
    });
    expect(progressSummary(imp)).toMatchObject({ done: 2500, pct: 50, finished: false });
    expect(progressSummary({ ...imp, status: "completed" }).finished).toBe(true);
  });
});

describe("file choice clears a previous rejection", () => {
  it("rejected → valid file → no stale error", () => {
    const rejected = run({ type: "fileRejected", reason: "Choose a .csv file" });
    expect(rejected).toEqual({ step: "choose", error: "Choose a .csv file" });
    expect(wizardReducer(rejected, { type: "fileAccepted" })).toEqual(initialWizard);
  });
});
