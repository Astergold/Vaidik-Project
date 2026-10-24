import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  extractionRule,
  extractionRuleBody,
  extractionRulesResponse,
  llmSettings,
  putLlmBody,
  type ExtractionRule,
  type ExtractionRuleBody,
  type PutLlmBody,
} from "@vernacular/contracts";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { SEAM_META } from "@/lib/seam";

/**
 * Settings → LLM provider + extraction rules (D6-I4-02) against the PROPOSED contract
 * (packages/contracts/src/llm.ts). Keys are write-only: they go out in a PUT and never come back.
 */
export const llmKeys = {
  settings: ["settings", "llm"] as const,
  rules: ["settings", "extraction-rules"] as const,
};

export const useLlmSettings = () =>
  useQuery({
    queryKey: llmKeys.settings,
    queryFn: () => apiGet("/api/settings/llm", llmSettings),
    retry: false,
    meta: SEAM_META,
  });

export function useSaveLlm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: PutLlmBody) => apiPut("/api/settings/llm", putLlmBody.parse(b), llmSettings),
    meta: SEAM_META,
    onSuccess: (s) => qc.setQueryData(llmKeys.settings, s),
  });
}

export const useExtractionRules = () =>
  useQuery({
    queryKey: llmKeys.rules,
    queryFn: () => apiGet("/api/settings/extraction-rules", extractionRulesResponse),
    retry: false,
    meta: SEAM_META,
  });

export function useRuleMutations() {
  const qc = useQueryClient();
  const set = (fn: (items: ExtractionRule[]) => ExtractionRule[]) =>
    qc.setQueryData(llmKeys.rules, (old: { items: ExtractionRule[] } | undefined) =>
      old ? { items: fn(old.items) } : old,
    );
  const upsert = (r: ExtractionRule) =>
    set((items) =>
      items.some((x) => x.id === r.id) ? items.map((x) => (x.id === r.id ? r : x)) : [...items, r],
    );
  return {
    save: useMutation({
      mutationFn: ({ id, body }: { id: string | null; body: ExtractionRuleBody }) =>
        id
          ? apiPatch(
              `/api/settings/extraction-rules/${id}`,
              extractionRuleBody.parse(body),
              extractionRule,
            )
          : apiPost(
              "/api/settings/extraction-rules",
              extractionRuleBody.parse(body),
              extractionRule,
            ),
      meta: SEAM_META,
      onSuccess: upsert,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiDelete(`/api/settings/extraction-rules/${id}`),
      meta: SEAM_META,
      onSuccess: (_v, id) => set((items) => items.filter((x) => x.id !== id)),
    }),
  };
}
