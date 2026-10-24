// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  applicationImport,
  applicationImportPreviewResponse,
  createApplicationImportResponse,
} from "@vernacular/contracts";
import { applicationProgressView } from "@/features/applications/import/ApplicationImportSteps";
import { ApplicationsImport } from "@/features/applications/import/ApplicationsImport";
import { checkMapping, suggestMapping } from "@/features/applications/import/column-mapping";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract.
const IMPORT_ID = "01a14679-0000-7000-8000-0000000000a1";
const upload = createApplicationImportResponse.parse({
  importId: IMPORT_ID,
  fileName: "portal.csv",
  rowCount: 120,
  columns: ["Application No", "Candidate Name", "Mobile", "Status", "Amount Paid", "Payment Date"],
  sampleRows: [["APP-1", "Asha Rao", "98xxxxxx10", "Fee Paid", "50000", "2026-10-01"]],
  mapping: {},
});
const preview = applicationImportPreviewResponse.parse({
  totalRows: 120,
  rows: [
    {
      rowNumber: 1,
      mapped: {
        externalApplicationNo: "APP-1",
        fullName: "Asha Rao",
        phone: null,
        email: null,
        program: null,
        status: "fee_paid",
        feeAmount: 50000,
        paidAt: "2026-10-01T05:00:00.000Z",
      },
      match: "application_no",
      errors: [],
    },
    {
      rowNumber: 2,
      mapped: null,
      match: "none",
      errors: [{ path: "status", message: "Unknown status" }],
    },
  ],
});
const job = (over: object = {}) =>
  applicationImport.parse({
    id: IMPORT_ID,
    fileName: "portal.csv",
    status: "running",
    totalRows: 120,
    counts: { updated: 30, created: 10, unmatched: 15, failed: 5, pending: 60 },
    errorReportAvailable: false,
    createdAt: "2026-10-17T00:00:00.000Z",
    finishedAt: null,
    ...over,
  });
const csv = () =>
  new File(["Application No,Status\nAPP-1,Fee Paid\n"], "portal.csv", { type: "text/csv" });

describe("applications column mapping (D5-I4-01)", () => {
  it("suggests from common headers; the saved mapping wins when its column still exists", () => {
    expect(suggestMapping(upload.columns, {})).toEqual({
      external_application_no: "Application No",
      full_name: "Candidate Name",
      phone: "Mobile",
      status: "Status",
      fee_amount: "Amount Paid",
      paid_at: "Payment Date",
    });
    expect(suggestMapping(upload.columns, { phone: "Gone", status: "Mobile" }).status).toBe(
      "Mobile",
    );
  });

  it("mirrors the API rules", () => {
    expect(checkMapping({ phone: "Mobile" })).toEqual({
      ok: false,
      message: "Map the status column",
    });
    expect(checkMapping({ status: "Status" }).ok).toBe(false);
    expect(checkMapping({ status: "Status", phone: "Status" })).toEqual({
      ok: false,
      message: "Each column can be used for one field only",
    });
    expect(checkMapping({ status: "Status", email: "Email" }).ok).toBe(true);
  });

  it("progress counts come straight from the server", () => {
    const v = applicationProgressView(job());
    expect(v.pct).toBe(50);
    expect(v.counts.map((c) => c.value)).toEqual([30, 10, 15, 5]);
    expect(v.finished).toBe(false);
    expect(
      applicationProgressView(job({ status: "completed", errorReportAvailable: true })).canDownload,
    ).toBe(true);
  });
});

describe("ApplicationsImport wizard", () => {
  it("404 seam: a missing upload route stops in 'not available yet' (nothing uploaded, no rows)", async () => {
    mockApi({});
    renderUI(<ApplicationsImport />, { role: "admin" });
    await userEvent.upload(screen.getByLabelText("CSV file"), csv());
    await userEvent.click(screen.getByRole("button", { name: /Upload and continue/ }));
    expect(await screen.findByText("Import service not available yet")).toBeTruthy();
    expect(document.querySelector("table")).toBeNull();
  });

  it("upload → map (pre-filled) → preview with match column → import → server counts", async () => {
    const calls = mockApi({
      "POST /api/applications/import": () => ({ status: 201, body: upload }),
      [`PUT /api/applications/import/${IMPORT_ID}/mapping`]: () => ({
        body: job({ status: "mapped" }),
      }),
      [`GET /api/applications/import/${IMPORT_ID}/preview`]: () => ({ body: preview }),
      [`POST /api/applications/import/${IMPORT_ID}/commit`]: () => ({
        status: 202,
        body: job({ status: "queued" }),
      }),
      [`GET /api/applications/import/${IMPORT_ID}`]: () => ({ body: job() }),
    });
    renderUI(<ApplicationsImport />, { role: "admin" });
    await userEvent.upload(screen.getByLabelText("CSV file"), csv());
    await userEvent.click(screen.getByRole("button", { name: /Upload and continue/ }));
    expect(await screen.findByText(/120 rows, 6 columns detected/)).toBeTruthy();
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("Status");
    await userEvent.click(screen.getByRole("button", { name: "Save mapping and preview" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
      mapping: {
        external_application_no: "Application No",
        full_name: "Candidate Name",
        phone: "Mobile",
        status: "Status",
        fee_amount: "Amount Paid",
        paid_at: "Payment Date",
      },
    });
    expect(await screen.findByText(/1 would be rejected, 0 would go to Unmatched/)).toBeTruthy();
    expect(screen.getByText("Unknown status", { exact: false })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Import 120 rows" }));
    expect(await screen.findByText("Importing… · 50%")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review 15 unmatched rows" })).toBeTruthy();
  });

  it("counsellors don't get the wizard", () => {
    mockApi({});
    renderUI(<ApplicationsImport />, { role: "counsellor" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(screen.queryByLabelText("CSV file")).toBeNull();
  });
});
