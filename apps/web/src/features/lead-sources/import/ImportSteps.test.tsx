import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createImportResponse, importPreviewResponse, leadImport } from "@vernacular/contracts";
import {
  ChooseStep,
  MapStep,
  PreviewStep,
  ProgressStep,
  Unavailable,
} from "@/features/lead-sources/import/ImportSteps";
import { toDraft } from "@/features/lead-sources/mapping";

/** Server-rendered step states (no DOM library; "no new deps"). Fixtures validate against the proposed contract. */
const noop = () => {};
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const upload = createImportResponse.parse({
  importId: "01a14679-0000-7000-8000-000000000001",
  sourceId: "01a14679-1d11-775e-86f3-891dd1d80a60",
  fileName: "leads.csv",
  rowCount: 5000,
  columns: ["Student Name", "Mobile No", "City"],
  sampleRows: [["Asha Rao", "98765 43210", "Pune"]],
  mapping: {},
});
const status = (over: object) =>
  leadImport.parse({
    id: upload.importId,
    sourceId: upload.sourceId,
    fileName: "leads.csv",
    status: "running",
    totalRows: 5000,
    counts: { imported: 2000, duplicates: 400, failed: 100, pending: 2500 },
    errorReportAvailable: false,
    createdAt: "2026-10-17T00:00:00.000Z",
    finishedAt: null,
    ...over,
  });
const chooseProps = {
  sourceId: "",
  onSource: noop,
  file: null,
  onFile: noop,
  error: null,
  uploading: false,
  onUpload: noop,
};

describe("Choose step (D3-I4-03b)", () => {
  it("loading sources → skeleton", () => {
    expect(html(<ChooseStep {...chooseProps} sources={{ kind: "loading" }} />)).toContain(
      'aria-label="Loading sources"',
    );
  });
  it("no sources → explains, no select", () => {
    const h = html(<ChooseStep {...chooseProps} sources={{ kind: "ready", data: [] }} />);
    expect(h).toContain("No active lead sources yet");
    expect(h).not.toContain('id="import-source"');
  });
  it("sources error → inline retry", () => {
    expect(
      html(<ChooseStep {...chooseProps} sources={{ kind: "error", message: "", retry: noop }} />),
    ).toContain("Retry");
  });
  it("accepts .csv only and shows the limits; upload disabled until source + file", () => {
    const h = html(
      <ChooseStep
        {...chooseProps}
        sources={{ kind: "ready", data: [] }}
        error="That file is empty."
      />,
    );
    expect(h).toContain('accept=".csv,text/csv"');
    expect(h).toContain("50,000 rows and 10 MB");
    expect(h).toContain("That file is empty.");
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>.*Upload and continue/);
  });
});

describe("Map step", () => {
  const props = {
    upload,
    draft: toDraft({}),
    onDraft: noop,
    errors: {},
    error: null,
    saving: false,
    onSave: noop,
    onBack: noop,
  };
  it("shows the detected row and column counts before mapping, plus the sample", () => {
    const h = html(<MapStep {...props} />);
    expect(h).toContain("5,000 rows,");
    expect(h).toContain("3 columns detected");
    expect(h).toContain("Mobile No");
    expect(h).toContain("98765 43210"); // raw value, exactly as uploaded
  });
  it("mapping rows offer the file's columns (reused MappingRows, CSV mode)", () => {
    const h = html(<MapStep {...props} />);
    expect(h).toContain("From column");
    expect(h).toContain('<option value="Student Name">Student Name</option>');
  });
  it("save error is shown inline", () => {
    expect(html(<MapStep {...props} error="Couldn't save the mapping." />)).toContain(
      "Couldn&#x27;t save the mapping.",
    );
  });
});

describe("Preview step", () => {
  const props = { error: null, committing: false, onCommit: noop, onBack: noop };
  it("loading → skeleton; error → retry card; empty → 'No rows to import'", () => {
    expect(html(<PreviewStep {...props} preview={{ kind: "loading" }} />)).toContain(
      'aria-label="Loading preview"',
    );
    expect(
      html(<PreviewStep {...props} preview={{ kind: "error", message: "Boom", retry: noop }} />),
    ).toContain("Couldn&#x27;t build the preview");
    expect(
      html(
        <PreviewStep {...props} preview={{ kind: "ready", data: { rows: [], totalRows: 0 } }} />,
      ),
    ).toContain("No rows to import");
  });
  it("highlights the cell of the field with an error and lists the problem", () => {
    const data = importPreviewResponse.parse({
      totalRows: 5000,
      rows: [
        {
          rowNumber: 1,
          mapped: {
            fullName: "Asha Rao",
            phone: "+919876543210",
            email: null,
            city: "Pune",
            state: null,
            language: null,
            program: null,
            externalId: null,
            consent: true,
          },
          errors: [],
        },
        {
          rowNumber: 2,
          mapped: {
            fullName: "No Phone",
            phone: null,
            email: null,
            city: null,
            state: null,
            language: null,
            program: null,
            externalId: null,
            consent: true,
          },
          errors: [{ path: "phone", message: "PHONE_MISSING" }],
        },
      ],
    });
    const h = html(<PreviewStep {...props} preview={{ kind: "ready", data }} />);
    expect(h).toContain("1 of these would be rejected");
    expect(h).toMatch(/aria-invalid="true"[^>]*title="PHONE_MISSING"/);
    expect(h).toContain("phone: PHONE_MISSING");
    expect(h).toContain("Import 5,000 rows");
  });
  it("a failed commit is retryable from the same step", () => {
    const data = importPreviewResponse.parse({
      totalRows: 1,
      rows: [{ rowNumber: 1, mapped: null, errors: [] }],
    });
    const h = html(
      <PreviewStep {...props} error="The import didn't start." preview={{ kind: "ready", data }} />,
    );
    expect(h).toContain("Retry import");
  });
});

describe("Progress step", () => {
  const props = {
    onDownload: noop,
    downloading: false,
    downloadError: null,
    onRetryCommit: noop,
    retrying: false,
    onDone: noop,
  };
  it("loading and error states", () => {
    expect(html(<ProgressStep {...props} status={{ kind: "loading" }} />)).toContain(
      "Loading import status",
    );
    expect(
      html(<ProgressStep {...props} status={{ kind: "error", message: "x", retry: noop }} />),
    ).toContain("keeps running on the server");
  });
  it("running: counts and progress from the server, no report yet", () => {
    const h = html(<ProgressStep {...props} status={{ kind: "ready", data: status({}) }} />);
    expect(h).toContain("Importing… · 50%");
    expect(h).toContain('aria-valuenow="50"');
    for (const n of ["2,000", "400", "100", "2,500"]) expect(h).toContain(n);
    expect(h).not.toContain("Download error report");
  });
  it("completed with failures → download the error report", () => {
    const h = html(
      <ProgressStep
        {...props}
        status={{
          kind: "ready",
          data: status({
            status: "completed",
            errorReportAvailable: true,
            counts: { imported: 4950, duplicates: 0, failed: 50, pending: 0 },
            finishedAt: "2026-10-17T00:05:00.000Z",
          }),
        }}
      />,
    );
    expect(h).toContain("Download error report");
    expect(h).toContain("Done");
  });
  it("job failed → retry", () => {
    expect(
      html(
        <ProgressStep {...props} status={{ kind: "ready", data: status({ status: "failed" }) }} />,
      ),
    ).toContain("Retry import");
  });
});

describe("Service not available (404 'Route not found')", () => {
  it("says so plainly, with no spinner and no rows", () => {
    const h = html(<Unavailable action={<button>Back</button>} />);
    expect(h).toContain("Import service not available yet");
    expect(h).toContain("Nothing was uploaded or imported");
    expect(h).not.toContain("aria-busy");
    expect(h).not.toContain("<table");
  });
});
