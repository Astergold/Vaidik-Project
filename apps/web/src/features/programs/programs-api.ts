import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDeadlineBody,
  createFeeBody,
  createProgramBody,
  kbDocument,
  kbDocumentBody,
  kbSearchResponse,
  patchKbDocumentBody,
  patchProgramBody,
  programDetail,
  programsListResponse,
  putEligibilityBody,
  putSeatBody,
  type ProgramDetail,
} from "@vernacular/contracts";
import type { z } from "zod";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import type { ErrorMeta } from "@/lib/errors";

/**
 * Programs + KB (D4-I4-03) against the PROPOSED contract (packages/contracts/src/programs.ts). Not built yet:
 * a "Route not found" 404 is shown as "not available yet". Mutations put the server's program into the cache.
 */
const META: ErrorMeta = { handles: [0, 400, 403, 404, 409, 422, 500, 502, 503, 504] };
export const programKeys = { list: ["programs"] as const };

export const usePrograms = () =>
  useQuery({
    queryKey: programKeys.list,
    queryFn: () => apiGet("/api/programs", programsListResponse),
    retry: false,
    meta: META,
  });

function useStore() {
  const qc = useQueryClient();
  return (p: ProgramDetail) =>
    qc.setQueryData(programKeys.list, (old: z.infer<typeof programsListResponse> | undefined) =>
      old
        ? {
            items: old.items.some((x) => x.id === p.id)
              ? old.items.map((x) => (x.id === p.id ? p : x))
              : [...old.items, p],
          }
        : old,
    );
}

/** One hook per editor action; each returns the refreshed program from the server. */
export function useProgramMutations(id: string | null) {
  const store = useStore();
  const opts = { meta: META, onSuccess: store };
  return {
    create: useMutation({
      mutationFn: (b: z.input<typeof createProgramBody>) =>
        apiPost("/api/programs", createProgramBody.parse(b), programDetail),
      ...opts,
    }),
    patch: useMutation({
      mutationFn: (b: z.input<typeof patchProgramBody>) =>
        apiPatch(`/api/programs/${id}`, patchProgramBody.parse(b), programDetail),
      ...opts,
    }),
    addFee: useMutation({
      mutationFn: (b: z.input<typeof createFeeBody>) =>
        apiPost(`/api/programs/${id}/fees`, createFeeBody.parse(b), programDetail),
      ...opts,
    }),
    setSeat: useMutation({
      mutationFn: (b: z.input<typeof putSeatBody>) =>
        apiPut(`/api/programs/${id}/seat`, putSeatBody.parse(b), programDetail),
      ...opts,
    }),
    addDeadline: useMutation({
      mutationFn: (b: z.input<typeof createDeadlineBody>) =>
        apiPost(`/api/programs/${id}/deadlines`, createDeadlineBody.parse(b), programDetail),
      ...opts,
    }),
    setEligibility: useMutation({
      mutationFn: (b: z.input<typeof putEligibilityBody>) =>
        apiPut(`/api/programs/${id}/eligibility`, putEligibilityBody.parse(b), programDetail),
      ...opts,
    }),
  };
}

/* ---- knowledge base ---- */

export const useKbSearch = (q: string, tag: string) =>
  useQuery({
    queryKey: ["kb", { q, tag }],
    queryFn: () =>
      apiGet("/api/kb", kbSearchResponse, { q: q || undefined, tag: tag || undefined }),
    retry: false,
    meta: META,
  });

export const useKbDocument = (id: string | null) =>
  useQuery({
    queryKey: ["kb", "doc", id],
    queryFn: () => apiGet(`/api/kb/${id}`, kbDocument),
    enabled: Boolean(id),
    retry: false,
    meta: META,
  });

export function useSaveKb(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: z.input<typeof kbDocumentBody>) =>
      id
        ? apiPatch(`/api/kb/${id}`, patchKbDocumentBody.parse(b), kbDocument)
        : apiPost("/api/kb", kbDocumentBody.parse(b), kbDocument),
    meta: META,
    onSuccess: (doc) => {
      qc.setQueryData(["kb", "doc", doc.id], doc);
      void qc.invalidateQueries({ queryKey: ["kb"] });
    },
  });
}
