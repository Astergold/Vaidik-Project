import type { SearchResult } from "@vernacular/contracts";
import { navFor, type AppPath, type ViewerRole } from "@/lib/sitemap";

/**
 * Command palette model (D6-I4-04a). Pure: page shortcuts come from the sitemap for the viewer's role (no data);
 * people come only from the server's search results.
 */
export type PaletteItem =
  | { kind: "page"; id: string; title: string; area: string; path: AppPath }
  | { kind: "lead"; id: string; result: SearchResult };

export const MIN_SEARCH = 2;

export function pageItems(role: ViewerRole, query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  const pages = navFor(role).flatMap((g) => g.items);
  return pages
    .filter((p) => !q || p.title.toLowerCase().includes(q) || p.area.toLowerCase().includes(q))
    .slice(0, q ? 6 : 8)
    .map((p) => ({
      kind: "page" as const,
      id: `page:${p.path}`,
      title: p.title,
      area: p.area,
      path: p.path,
    }));
}

export const leadItems = (results: SearchResult[]): PaletteItem[] =>
  results.map((r) => ({ kind: "lead" as const, id: `lead:${r.leadId}`, result: r }));

/** ↑/↓ wrap around; Home/End jump. Returns the new active index. */
export function moveActive(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowUp") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** ⌘K on Mac, Ctrl+K elsewhere (either works everywhere). */
export const isPaletteShortcut = (e: { key: string; metaKey: boolean; ctrlKey: boolean }) =>
  (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";

export const MATCH_LABEL: Record<SearchResult["matched"], string> = {
  name: "name",
  phone: "phone",
  email: "email",
  application_no: "application no.",
};
