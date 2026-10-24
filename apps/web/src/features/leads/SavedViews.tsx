import { useState, type FormEvent } from "react";
import { createSavedViewBody, type SavedView } from "@vernacular/contracts";
import { Bookmark, ChevronDown, Loader2, Trash2, Users } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { useViewerRole } from "@/components/RoleGate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LeadsSearch } from "@/features/leads/leads-search";
import {
  filtersFromSearch,
  sameFilters,
  useSavedViews,
  useViewMutations,
} from "@/features/leads/leads-views-api";
import { isMissingRoute } from "@/lib/api";
import { errText } from "@/lib/seam";

/**
 * Views menu on /leads (D6-I4-04b): apply a personal or shared view (replaces the URL filters), save the current
 * filters, delete your own. Shared views can be created by managers only (the API enforces it).
 */
export function SavedViews({
  search,
  onApply,
}: {
  search: LeadsSearch;
  onApply: (s: LeadsSearch) => void;
}) {
  const role = useViewerRole();
  const manager = role === "owner" || role === "admin" || role === "admission_head";
  const q = useSavedViews();
  const m = useViewMutations();
  const [saving, setSaving] = useState(false);
  const current = filtersFromSearch(search);
  const items = q.data?.items ?? [];
  const active = items.find((v) => sameFilters(v.filters, current));
  const mine = items.filter((v) => v.isMine);
  const shared = items.filter((v) => !v.isMine);
  const apply = (v: SavedView) => onApply({ ...v.filters });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label={active ? `Views: ${active.name}` : "Views"}
          >
            <Bookmark />
            <span className="max-w-40 truncate">{active ? active.name : "Views"}</span>
            <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-96 w-64 overflow-y-auto">
          {q.isPending ? (
            <DropdownMenuItem disabled>Loading views…</DropdownMenuItem>
          ) : q.isError ? (
            <DropdownMenuItem disabled>
              {isMissingRoute(q.error) ? "Saved views aren't available yet" : "Couldn't load views"}
            </DropdownMenuItem>
          ) : (
            <>
              {items.length === 0 && (
                <DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>
              )}
              {mine.length > 0 && <DropdownMenuLabel>My views</DropdownMenuLabel>}
              {mine.map((v) => (
                <ViewItem
                  key={v.id}
                  v={v}
                  active={v.id === active?.id}
                  onApply={() => apply(v)}
                  onDelete={() => m.remove.mutate(v.id)}
                />
              ))}
              {shared.length > 0 && <DropdownMenuLabel>Shared with the team</DropdownMenuLabel>}
              {shared.map((v) => (
                <ViewItem key={v.id} v={v} active={v.id === active?.id} onApply={() => apply(v)} />
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSaving(true)}>
                Save current filters as a view…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {m.remove.isError && (
        <span className="text-xs text-destructive">
          {errText(m.remove.error, "Couldn't delete the view.")}
        </span>
      )}
      {saving && (
        <SaveViewDialog
          canShare={manager}
          filters={current}
          m={m}
          onClose={() => setSaving(false)}
        />
      )}
    </>
  );
}

function ViewItem({
  v,
  active,
  onApply,
  onDelete,
}: {
  v: SavedView;
  active: boolean;
  onApply: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <DropdownMenuItem
        className="min-w-0 flex-1"
        onSelect={onApply}
        aria-current={active || undefined}
      >
        <span className="truncate">{v.name}</span>
        {v.isShared && (
          <Users className="ml-auto size-3.5 text-muted-foreground" aria-label="Shared" />
        )}
        {!v.isMine && (
          <span className="ml-1 truncate text-xs text-muted-foreground">{v.owner.name}</span>
        )}
      </DropdownMenuItem>
      {onDelete && (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Delete view ${v.name}`}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

function SaveViewDialog({
  canShare,
  filters,
  m,
  onClose,
}: {
  canShare: boolean;
  filters: ReturnType<typeof filtersFromSearch>;
  m: ReturnType<typeof useViewMutations>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [isShared, setShared] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = createSavedViewBody.safeParse({ entity: "lead", name, filters, isShared });
    if (!r.success) return setProblem(r.error.issues[0]?.message ?? "Name the view");
    setProblem(null);
    m.create.mutate(r.data, { onSuccess: onClose });
  };
  const count = Object.keys(filters).length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Save view</DialogTitle>
        <DialogDescription>
          {count === 0
            ? "No filters are set — this view shows all leads."
            : `Saves the ${count} filter${count === 1 ? "" : "s"} and sort you have now.`}
        </DialogDescription>
        <form noValidate onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="e.g. Hot website leads"
              autoFocus
            />
            {problem && <p className="text-sm text-destructive">{problem}</p>}
          </div>
          {canShare && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setShared(e.target.checked)}
              />
              Share with the whole team
            </label>
          )}
          {m.create.isError && (
            <FormAlert>{errText(m.create.error, "Couldn't save the view.")}</FormAlert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={m.create.isPending}>
              {m.create.isPending && <Loader2 className="animate-spin" />}
              Save view
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
