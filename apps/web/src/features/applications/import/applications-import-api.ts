import {
  applicationImport,
  applicationImportMappingBody,
  applicationImportPreviewResponse,
  createApplicationImportResponse,
  type ApplicationColumnMapping,
} from "@vernacular/contracts";
import { createCsvImportApi } from "@/features/csv-import/csv-import-api";

/**
 * Applications CSV import (D5-I4-01) against the PROPOSED contract (packages/contracts/src/applications.ts), through
 * the shared CSV import api. The browser sends the raw file; the server parses, matches and updates statuses.
 */
const api = createCsvImportApi({
  key: "applications-import",
  base: "/api/applications/import",
  upload: createApplicationImportResponse,
  preview: applicationImportPreviewResponse,
  job: applicationImport,
});

export function useUploadApplications() {
  const m = api.useUpload();
  return {
    ...m,
    mutate: (file: File, opts?: Parameters<typeof m.mutate>[1]) => {
      const form = new FormData();
      form.append("file", file, file.name);
      m.mutate(form, opts);
    },
  };
}

export function useSaveApplicationMapping(importId: string) {
  const m = api.useSaveMapping(importId);
  return {
    ...m,
    mutate: (mapping: ApplicationColumnMapping, opts?: Parameters<typeof m.mutate>[1]) =>
      m.mutate(applicationImportMappingBody.parse({ mapping }), opts),
  };
}

export const useApplicationPreview = api.usePreview;
export const useCommitApplications = api.useCommit;
export const useApplicationImportStatus = api.useImportStatus;
export const downloadApplicationErrors = api.downloadErrorReport;
