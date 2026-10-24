import {
  createImportResponse,
  importMappingBody,
  importPreviewResponse,
  leadImport,
  type FieldMapping,
} from "@vernacular/contracts";
import { isMissingRoute } from "@/lib/api";
import { createCsvImportApi } from "@/features/csv-import/csv-import-api";

/**
 * Lead CSV import calls (D3-I4-03b) against the PROPOSED contract in packages/contracts/src/leads-import.ts, through
 * the shared CSV import api (features/csv-import). A "Route not found" 404 means "service not available".
 */
const api = createCsvImportApi({
  key: "leads-import",
  base: "/api/leads/imports",
  upload: createImportResponse,
  preview: importPreviewResponse,
  job: leadImport,
});

export function useUpload() {
  const m = api.useUpload();
  return {
    ...m,
    mutate: (
      { sourceId, file }: { sourceId: string; file: File },
      opts?: Parameters<typeof m.mutate>[1],
    ) => {
      const form = new FormData();
      form.append("sourceId", sourceId);
      form.append("file", file, file.name); // raw file: the API parses and normalises
      m.mutate(form, opts);
    },
  };
}

export function useSaveMapping(importId: string) {
  const m = api.useSaveMapping(importId);
  return {
    ...m,
    mutate: (fieldMapping: FieldMapping, opts?: Parameters<typeof m.mutate>[1]) =>
      m.mutate(importMappingBody.parse({ fieldMapping }), opts),
  };
}

export const usePreview = api.usePreview;
export const useCommit = api.useCommit;
export const useImportStatus = api.useImportStatus;
export const downloadErrorReport = api.downloadErrorReport;
export { WIZARD_META, errorText, uploadUnavailable } from "@/features/csv-import/csv-import-api";
export { isMissingRoute };
