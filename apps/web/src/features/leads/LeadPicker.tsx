import { useEffect, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { leadsListResponse, type LeadListItem } from "@vernacular/contracts";
import { Loader2, Search } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { STAGE_LABEL } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { cn } from "@/lib/utils";

/** Search real leads (GET /api/leads?q=, name / phone digits / email), debounced. */
export function useLeadSearch(term: string) {
  const [q, setQ] = useState(term.trim());
  useEffect(() => {
    const t = setTimeout(() => setQ(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);
  return useQuery({
    queryKey: ["leads", "picker", q],
    queryFn: () => apiGet("/api/leads", leadsListResponse, { q, pageSize: 10 }),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
    retry: false,
    meta: { handles: [0, 400, 403, 422, 500, 502, 503, 504] },
  });
}

/**
 * Pick one lead and confirm (D5-I4-01 link an unmatched application; reusable). The search uses the existing leads
 * API; the action itself is the caller's mutation, and the dialog closes only when it succeeds.
 */
export function LeadPicker({
  open,
  onOpenChange,
  title,
  description,
  initialQuery = "",
  confirmLabel,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  initialQuery?: string;
  confirmLabel: string;
  pending: boolean;
  error: unknown;
  onConfirm: (lead: LeadListItem) => void;
}) {
  const [term, setTerm] = useState(initialQuery);
  const [picked, setPicked] = useState<LeadListItem | null>(null);
  const results = useLeadSearch(term);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Name, phone digits or email"
            aria-label="Search leads"
            className="pl-8"
            maxLength={100}
          />
        </div>
        <div className="min-h-24">
          {term.trim().length < 2 ? (
            <p className="text-sm text-muted-foreground">Type at least 2 characters.</p>
          ) : results.isPending ? (
            <Skeleton className="h-24 w-full" aria-busy="true" aria-label="Searching leads" />
          ) : results.isError ? (
            <FormAlert>{errText(results.error, "Couldn't search leads.")}</FormAlert>
          ) : results.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads match.</p>
          ) : (
            <ul className="space-y-1" role="listbox" aria-label="Matching leads">
              {results.data.items.map((l) => (
                <li key={l.id} role="option" aria-selected={picked?.id === l.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(l)}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-accent",
                      picked?.id === l.id && "border-primary bg-accent",
                    )}
                  >
                    <span className="block font-medium break-words">
                      {l.person.fullName ?? "Unnamed lead"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {[l.person.phone, l.program?.name, STAGE_LABEL[l.stage]]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error ? <FormAlert>{errText(error, "That didn't work. Try again.")}</FormAlert> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button disabled={!picked || pending} onClick={() => picked && onConfirm(picked)}>
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
