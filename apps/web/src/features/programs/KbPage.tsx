import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, BookOpen, Loader2, PlugZap, Plus, Search, X } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownView } from "@/features/programs/MarkdownView";
import { useCanMutateCatalog } from "@/features/programs/ProgramsPage";
import {
  useKbDocument,
  useKbSearch,
  usePrograms,
  useSaveKb,
} from "@/features/programs/programs-api";
import { ApiCallError, isMissingRoute } from "@/lib/api";

/** /programs/knowledge-base (D4-I4-03): search with the server's snippet, tag filter, Markdown editor + preview. */
export function KbPage() {
  const { canMutate, readOnly } = useCanMutateCatalog();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [open, setOpen] = useState<string | "new" | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const res = useKbSearch(q, tag);
  const unavailable = isMissingRoute(res.error);
  const tags = [...new Set((res.data?.items ?? []).flatMap((d) => d.tags))].sort();

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Programs
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge base</h1>
          <p className="text-sm text-muted-foreground">
            What the AI agents answer from. Search to see the snippet an agent would cite.
          </p>
        </div>
        {canMutate && !unavailable && (
          <Button onClick={() => setOpen("new")}>
            <Plus /> New article
          </Button>
        )}
      </div>
      {readOnly && (
        <p className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          View only — owners and admins edit articles.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search articles"
            placeholder="Search, e.g. hostel fees"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="pl-8"
          />
        </div>
        {tag && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTag("")}
            aria-label={`Remove tag filter ${tag}`}
          >
            #{tag} <X />
          </Button>
        )}
      </div>
      {tags.length > 0 && !tag && (
        <div className="flex flex-wrap gap-1.5" aria-label="Tags">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {res.isPending ? (
        <Skeleton className="h-40 w-full" aria-busy="true" aria-label="Loading articles" />
      ) : unavailable ? (
        <StateCard icon={PlugZap} title="Knowledge base not available yet">
          Articles need a server feature that hasn&apos;t been switched on yet.
        </StateCard>
      ) : res.isError ? (
        <StateCard
          icon={AlertTriangle}
          title="Couldn't load articles"
          tone="error"
          action={
            <Button variant="outline" size="sm" onClick={() => void res.refetch()}>
              Try again
            </Button>
          }
        >
          {res.error instanceof ApiCallError
            ? res.error.message
            : "Check your connection and try again."}
        </StateCard>
      ) : res.data.items.length === 0 ? (
        <StateCard
          icon={BookOpen}
          title={q || tag ? "No articles match" : "No articles yet"}
          action={
            canMutate &&
            !q &&
            !tag && (
              <Button size="sm" onClick={() => setOpen("new")}>
                <Plus /> New article
              </Button>
            )
          }
        >
          {q || tag
            ? "Try other words or remove the tag."
            : "Write what students ask about most: fees, hostel, scholarships."}
        </StateCard>
      ) : (
        <ul className="space-y-2" aria-label="Articles">
          {res.data.items.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setOpen(d.id)}
                className="w-full rounded-lg border bg-card p-3 text-left hover:bg-accent/40"
              >
                <p className="font-medium break-words">{d.title}</p>
                <p className="mt-1 text-sm text-muted-foreground break-words" data-testid="snippet">
                  {d.snippet}
                </p>
                {d.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.tags.map((t) => (
                      <Badge key={t} variant="outline">
                        #{t}
                      </Badge>
                    ))}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-4 sm:max-w-2xl">
          <SheetTitle>
            {open === "new" ? "New article" : canMutate ? "Edit article" : "Article"}
          </SheetTitle>
          <SheetDescription className="mb-4">
            Markdown: # headings, **bold**, *italic*, - lists, [links](https://…).
          </SheetDescription>
          {open && (
            <KbEditor
              id={open === "new" ? null : open}
              canMutate={canMutate}
              onSaved={() => setOpen(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KbEditor({
  id,
  canMutate,
  onSaved,
}: {
  id: string | null;
  canMutate: boolean;
  onSaved: () => void;
}) {
  const doc = useKbDocument(id);
  const programs = usePrograms();
  const save = useSaveKb(id);
  const [title, setTitle] = useState("");
  const [programId, setProgramId] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!doc.data) return;
    setTitle(doc.data.title);
    setProgramId(doc.data.programId ?? "");
    setTags(doc.data.tags.join(", "));
    setBody(doc.data.body);
  }, [doc.data]);

  if (id && doc.isPending)
    return <Skeleton className="h-64 w-full" aria-busy="true" aria-label="Loading article" />;
  if (id && doc.isError)
    return (
      <FormAlert>
        {isMissingRoute(doc.error)
          ? "Articles aren't available yet."
          : "Couldn't load the article."}
      </FormAlert>
    );
  if (!canMutate) return <MarkdownView source={doc.data?.body ?? ""} />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError("Give the article a title");
    if (!body.trim()) return setError("Write something");
    setError(null);
    save.mutate(
      {
        title: title.trim(),
        programId: programId || null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        body,
      },
      { onSuccess: onSaved },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="kb-title">Title</Label>
        <Input
          id="kb-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="kb-program">Program (optional)</Label>
          <select
            id="kb-program"
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className="h-9 w-full rounded-md border bg-card px-2 text-sm"
          >
            <option value="">All programs</option>
            {(programs.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kb-tags">Tags (comma-separated)</Label>
          <Input
            id="kb-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="fees, hostel"
          />
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="kb-body">Article (Markdown)</Label>
          <Textarea
            id="kb-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            className="font-mono text-xs"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-medium">Preview</p>
          <div className="min-h-40 rounded-md border bg-card p-3" aria-label="Preview">
            <MarkdownView source={body} />
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {save.isError && (
        <FormAlert>
          {isMissingRoute(save.error)
            ? "Saving articles isn't available yet."
            : "Couldn't save the article."}
        </FormAlert>
      )}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending && <Loader2 className="animate-spin" />}
        {id ? "Save article" : "Create article"}
      </Button>
    </form>
  );
}
