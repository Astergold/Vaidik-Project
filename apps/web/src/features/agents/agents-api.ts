import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  agent,
  agentsListResponse,
  createAgentBody,
  patchAgentBody,
  putAgentCounsellorsBody,
  workflowOptionsResponse,
  type Agent,
} from "@vernacular/contracts";
import type { z } from "zod";
import { apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import type { ErrorMeta } from "@/lib/errors";

/**
 * AI agents (D4-I4-04) against the PROPOSED contract (packages/contracts/src/agents.ts). Not built yet:
 * a "Route not found" 404 is shown as "not available yet". Mutations replace the cache from the server reply.
 */
const META: ErrorMeta = { handles: [0, 400, 403, 404, 409, 422, 500, 502, 503, 504] };
export const agentKeys = { list: ["agents"] as const, workflows: ["agents", "workflows"] as const };

export const useAgents = () =>
  useQuery({
    queryKey: agentKeys.list,
    queryFn: () => apiGet("/api/agents", agentsListResponse),
    retry: false,
    meta: META,
  });

export const useWorkflowOptions = (enabled: boolean) =>
  useQuery({
    queryKey: agentKeys.workflows,
    queryFn: () => apiGet("/api/agents/workflows", workflowOptionsResponse),
    enabled,
    retry: false,
    meta: META,
  });

/** Put the server's version of one agent into the cached list (never an optimistic guess). */
function useReplaceInList() {
  const qc = useQueryClient();
  return (a: Agent) =>
    qc.setQueryData(agentKeys.list, (old: z.infer<typeof agentsListResponse> | undefined) =>
      old
        ? {
            items: old.items.some((x) => x.id === a.id)
              ? old.items.map((x) => (x.id === a.id ? a : x))
              : [...old.items, a],
          }
        : old,
    );
}

export function useCreateAgent() {
  const replace = useReplaceInList();
  return useMutation({
    mutationFn: (body: z.input<typeof createAgentBody>) =>
      apiPost("/api/agents", createAgentBody.parse(body), agent),
    meta: META,
    onSuccess: replace,
  });
}

export function usePatchAgent(id: string) {
  const replace = useReplaceInList();
  return useMutation({
    mutationFn: (body: z.input<typeof patchAgentBody>) =>
      apiPatch(`/api/agents/${id}`, patchAgentBody.parse(body), agent),
    meta: META,
    onSuccess: replace,
  });
}

export function usePutCounsellors(id: string) {
  const replace = useReplaceInList();
  return useMutation({
    mutationFn: (counsellorIds: string[]) =>
      apiPut(
        `/api/agents/${id}/counsellors`,
        putAgentCounsellorsBody.parse({ counsellorIds }),
        agent,
      ),
    meta: META,
    onSuccess: replace,
  });
}
