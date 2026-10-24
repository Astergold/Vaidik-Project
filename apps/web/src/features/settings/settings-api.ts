import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSubStageBody,
  emailSettings,
  generalSettings,
  patchSubStageBody,
  privacySettings,
  putEmailBody,
  putGeneralBody,
  putPrivacyBody,
  reorderSubStagesBody,
  stagesResponse,
  subStage,
  type CoreStage,
  type StagesResponse,
  type SubStage,
} from "@vernacular/contracts";
import type { z } from "zod";
import { apiDelete, apiGet, apiPost, apiPatch, apiPut } from "@/lib/api";
import { SEAM_META } from "@/lib/seam";

/**
 * Settings → general, stages, email, privacy (D6-I4-02) against the PROPOSED contract
 * (packages/contracts/src/tenant-settings.ts). Not built yet: "Route not found" → "not available yet".
 */
export const settingsKeys = {
  general: ["settings", "general"] as const,
  stages: ["settings", "stages"] as const,
  email: ["settings", "email"] as const,
  privacy: ["settings", "privacy"] as const,
};

const read = <T>(key: readonly string[], path: `/api/${string}`, schema: z.ZodType<T>) =>
  ({ queryKey: key, queryFn: () => apiGet(path, schema), retry: false, meta: SEAM_META }) as const;

export const useGeneral = () =>
  useQuery(read(settingsKeys.general, "/api/settings/general", generalSettings));

export function useSaveGeneral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: z.input<typeof putGeneralBody>) =>
      apiPut("/api/settings/general", putGeneralBody.parse(b), generalSettings),
    meta: SEAM_META,
    onSuccess: (g) => {
      qc.setQueryData(settingsKeys.general, g);
      void qc.invalidateQueries({ queryKey: ["me"] }); // name/timezone shown across the app come from /api/me
    },
  });
}

/* ---- stages ---- */

export const useStages = () =>
  useQuery(read(settingsKeys.stages, "/api/settings/stages", stagesResponse));

/** Replace one sub-stage (or add it) in the cached stages, from the server's reply. */
function useStoreSubStage() {
  const qc = useQueryClient();
  return (s: SubStage) =>
    qc.setQueryData<StagesResponse>(settingsKeys.stages, (old) =>
      old
        ? {
            stages: old.stages.map((g) =>
              g.stage !== s.coreStage
                ? g
                : {
                    ...g,
                    subStages: g.subStages.some((x) => x.id === s.id)
                      ? g.subStages.map((x) => (x.id === s.id ? s : x))
                      : [...g.subStages, s],
                  },
            ),
          }
        : old,
    );
}

export function useStageMutations() {
  const qc = useQueryClient();
  const store = useStoreSubStage();
  return {
    add: useMutation({
      mutationFn: (b: z.input<typeof createSubStageBody>) =>
        apiPost("/api/settings/stages/sub-stages", createSubStageBody.parse(b), subStage),
      meta: SEAM_META,
      onSuccess: store,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) =>
        apiPatch(
          `/api/settings/stages/sub-stages/${id}`,
          patchSubStageBody.parse({ name }),
          subStage,
        ),
      meta: SEAM_META,
      onSuccess: store,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete(`/api/settings/stages/sub-stages/${id}`),
      meta: SEAM_META,
      onSuccess: (_v, id) =>
        qc.setQueryData<StagesResponse>(settingsKeys.stages, (old) =>
          old
            ? {
                stages: old.stages.map((g) => ({
                  ...g,
                  subStages: g.subStages.filter((x) => x.id !== id),
                })),
              }
            : old,
        ),
    }),
    reorder: useMutation({
      mutationFn: ({ stage, ids }: { stage: CoreStage; ids: string[] }) =>
        apiPut(
          `/api/settings/stages/${stage}/order`,
          reorderSubStagesBody.parse({ ids }),
          stagesResponse,
        ),
      meta: SEAM_META,
      onSuccess: (s) => qc.setQueryData(settingsKeys.stages, s),
    }),
  };
}

/* ---- email + privacy ---- */

export const useEmailSettings = () =>
  useQuery(read(settingsKeys.email, "/api/settings/email", emailSettings));

export function useEmailMutations() {
  const qc = useQueryClient();
  const store = (e: z.infer<typeof emailSettings>) => qc.setQueryData(settingsKeys.email, e);
  return {
    save: useMutation({
      mutationFn: (b: z.input<typeof putEmailBody>) =>
        apiPut("/api/settings/email", putEmailBody.parse(b), emailSettings),
      meta: SEAM_META,
      onSuccess: store,
    }),
    verify: useMutation({
      mutationFn: () => apiPost("/api/settings/email/verify", {}, emailSettings),
      meta: SEAM_META,
      onSuccess: store,
    }),
  };
}

export const usePrivacy = () =>
  useQuery(read(settingsKeys.privacy, "/api/settings/privacy", privacySettings));

export function useSavePrivacy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: z.input<typeof putPrivacyBody>) =>
      apiPut("/api/settings/privacy", putPrivacyBody.parse(b), privacySettings),
    meta: SEAM_META,
    onSuccess: (p) => qc.setQueryData(settingsKeys.privacy, p),
  });
}
