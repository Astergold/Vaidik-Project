import { useMutation, useQuery } from "@tanstack/react-query";
import type { ImportStatus } from "@vernacular/contracts";
import type { z } from "zod";
import { apiGet, apiGetBlob, apiPost, apiPostForm, apiPut, ApiCallError } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import type { ErrorMeta } from "@/lib/errors";
import { isActive } from "@/features/csv-import/csv-machine";

/**
 * The calls every CSV import makes, for any base path with the same shape (D5-I4-01 generalisation of D3-I4-03b):
 *
 *   POST {base}                 multipart → upload response
 *   PUT  {base}/:id/mapping     mapping body → job
 *   GET  {base}/:id/preview     → preview
 *   POST {base}/:id/commit      {} → job
 *   GET  {base}/:id             → job (polled every 2 s while queued/running)
 *   GET  {base}/:id/errors      → text/csv
 *
 * Errors are shown inside the wizard; only a 401 goes to the global policy (sign-in redirect).
 */
export const WIZARD_META: ErrorMeta = {
  handles: [0, 400, 403, 404, 409, 413, 415, 422, 500, 502, 503, 504],
};

type Base = `/api/${string}`;

export function createCsvImportApi<U, P, J extends { id: string; status: ImportStatus }>(cfg: {
  key: string;
  base: Base;
  upload: z.ZodType<U>;
  preview: z.ZodType<P>;
  job: z.ZodType<J>;
}) {
  const path = (id: string, rest = "") => `${cfg.base}/${id}${rest}` as Base;
  return {
    useUpload: () =>
      useMutation({
        mutationFn: (form: FormData) => apiPostForm(cfg.base, form, cfg.upload),
        meta: WIZARD_META,
      }),
    useSaveMapping: (importId: string) =>
      useMutation({
        mutationFn: (body: unknown) => apiPut(path(importId, "/mapping"), body, cfg.job),
        meta: WIZARD_META,
      }),
    usePreview: (importId: string, enabled: boolean) =>
      useQuery({
        queryKey: [cfg.key, importId, "preview"],
        queryFn: () => apiGet(path(importId, "/preview"), cfg.preview),
        enabled,
        retry: false,
        meta: WIZARD_META,
      }),
    useCommit: (importId: string) =>
      useMutation({
        mutationFn: () => apiPost(path(importId, "/commit"), {}, cfg.job),
        meta: WIZARD_META,
      }),
    /** React Query pauses the polling while the tab is hidden. */
    useImportStatus: (importId: string, enabled: boolean) =>
      useQuery({
        queryKey: [cfg.key, importId],
        queryFn: () => apiGet(path(importId), cfg.job),
        enabled,
        refetchInterval: (q) => (q.state.data && !isActive(q.state.data.status) ? false : 2000),
        refetchIntervalInBackground: false,
        meta: WIZARD_META,
      }),
    downloadErrorReport: async (importId: string, fileName: string) =>
      saveBlob(
        await apiGetBlob(path(importId, "/errors")),
        `${fileName.replace(/\.csv$/i, "")}-errors.csv`,
      ),
  };
}

/** Uploads have no id yet, so any 404 there means the route is missing. */
export const uploadUnavailable = (err: unknown) =>
  err instanceof ApiCallError && err.status === 404;

export const errorText = (err: unknown, fallback: string) => {
  if (!(err instanceof ApiCallError)) return fallback;
  if (err.status === 413) return "The file is too large for the server.";
  if (err.status === 0) return err.message;
  return err.message || fallback;
};
