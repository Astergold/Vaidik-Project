import { useEffect, useState, type KeyboardEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { searchResponse } from "@vernacular/contracts";
import { CornerDownLeft, FileText, Loader2, Search, User } from "lucide-react";
import {
  leadItems,
  MATCH_LABEL,
  MIN_SEARCH,
  moveActive,
  pageItems,
  type PaletteItem,
} from "@/components/palette";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { apiGet, isMissingRoute } from "@/lib/api";
import { STAGE_LABEL } from "@/lib/labels";
import { errText, SEAM_META } from "@/lib/seam";
import type { ViewerRole } from "@/lib/sitemap";
import { cn } from "@/lib/utils";

/** Debounced GET /api/search (proposed, Appendix A /search). Only runs from 2 characters and while open. */
function useSearch(term: string, enabled: boolean) {
  const [q, setQ] = useState(term.trim());
  useEffect(() => {
    const t = setTimeout(() => setQ(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => apiGet("/api/search", searchResponse, { q }),
    enabled: enabled && q.length >= MIN_SEARCH,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 30_000,
    meta: SEAM_META,
  });
}

/**
 * ⌘K / Ctrl+K palette (D6-I4-04a): people from the server's search, pages from the sitemap. Keyboard-first:
 * ↑/↓/Home/End move, Enter opens, Esc closes. A listbox with aria-activedescendant, so focus stays in the input.
 */
export function CommandPalette({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: ViewerRole;
}) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const canSearchLeads = role !== "super_admin";
  const search = useSearch(term, open && canSearchLeads);
  const longEnough = term.trim().length >= MIN_SEARCH;
  const people = longEnough && search.data ? leadItems(search.data.results) : [];
  const items: PaletteItem[] = [...people, ...pageItems(role, term)];

  useEffect(() => setActive(0), [term, search.data]);
  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  const go = (item: PaletteItem | undefined) => {
    if (!item) return;
    onOpenChange(false);
    if (item.kind === "lead")
      void navigate({ to: "/leads/$leadId", params: { leadId: item.result.leadId } });
    else void navigate({ to: item.path });
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
      return;
    }
    const next = moveActive(e.key, active, items.length);
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  };
  const optionId = (i: number) => `palette-option-${i}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[15%] max-h-[75dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search leads by name, phone digits, email or application number, or jump to a page.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? optionId(active) : undefined}
            aria-label="Search leads and pages"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKey}
            placeholder={
              canSearchLeads
                ? "Name, phone digits, email, application no. or a page"
                : "Jump to a page"
            }
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            maxLength={100}
          />
          {search.isFetching && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Searching" />
          )}
        </div>
        <div className="max-h-[60dvh] overflow-y-auto p-2">
          {canSearchLeads && longEnough && search.isError && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground" role="status">
              {isMissingRoute(search.error)
                ? "Lead search isn't available yet — pages still work."
                : errText(search.error, "Search failed.")}
            </p>
          )}
          {canSearchLeads && longEnough && search.isSuccess && people.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground" role="status">
              No leads match “{term.trim()}”.
            </p>
          )}
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing matches.</p>
          ) : (
            <ul id="palette-list" role="listbox" aria-label="Results" className="space-y-0.5">
              {items.map((it, i) => (
                <li
                  key={it.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(it)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm",
                    i === active && "bg-accent text-accent-foreground",
                  )}
                >
                  {it.kind === "lead" ? (
                    <>
                      <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {it.result.name ?? "Unnamed lead"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[
                            it.result.phone,
                            it.result.applicationNo,
                            it.result.program,
                            STAGE_LABEL[it.result.stage],
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        by {MATCH_LABEL[it.result.matched]}
                      </span>
                    </>
                  ) : (
                    <>
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{it.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{it.area}</span>
                    </>
                  )}
                  {i === active && (
                    <CornerDownLeft
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
