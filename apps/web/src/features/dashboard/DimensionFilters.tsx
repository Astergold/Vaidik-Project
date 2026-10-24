import { useEffect, useState } from "react";
import type { DashboardResponse } from "@vernacular/contracts";
import type { DashboardSearch } from "@/features/dashboard/dashboard-search";
import { useSources } from "@/features/lead-sources/sources-api";

/**
 * Source + AI agent filters (D3-I4-02). Sources come from Settings → Lead sources (same roles as the
 * dashboard). There is no agents endpoint yet, so agent options are the agents the dashboard has
 * reported so far (kept, so filtering to one agent doesn't empty the list).
 */
export function DimensionFilters({
  search,
  data,
  onChange,
}: {
  search: DashboardSearch;
  data: DashboardResponse | undefined;
  onChange: (patch: Partial<DashboardSearch>) => void;
}) {
  const sources = useSources();
  const [agents, setAgents] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    if (!data) return;
    setAgents((prev) => {
      const fresh = data.byAgent.filter((a) => a.agentId && !prev.has(a.agentId));
      if (fresh.length === 0) return prev;
      const next = new Map(prev);
      for (const a of fresh) if (a.agentId) next.set(a.agentId, a.name);
      return next;
    });
  }, [data]);

  const sourceItems = sources.data?.items ?? [];
  return (
    <>
      {sourceItems.length > 0 && (
        <select
          aria-label="Source"
          value={search.sourceId ?? ""}
          onChange={(e) => onChange({ sourceId: e.target.value || undefined })}
          className="h-8 max-w-48 rounded-md border bg-card px-1.5 text-sm"
        >
          <option value="">All sources</option>
          {sourceItems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {agents.size > 0 && (
        <select
          aria-label="AI agent"
          value={search.agentId ?? ""}
          onChange={(e) => onChange({ agentId: e.target.value || undefined })}
          className="h-8 max-w-48 rounded-md border bg-card px-1.5 text-sm"
        >
          <option value="">All AI agents</option>
          {[...agents].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
