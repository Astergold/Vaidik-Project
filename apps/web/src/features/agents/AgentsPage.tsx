import { useState, type FormEvent } from "react";
import { createAgentBody, type Agent } from "@vernacular/contracts";
import { AlertTriangle, Bot, Loader2, PlugZap, Plus } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAgents,
  useCreateAgent,
  usePatchAgent,
  usePutCounsellors,
  useWorkflowOptions,
} from "@/features/agents/agents-api";
import { EntityFilter, optionsStateFor, useLeadFilterOptions } from "@/features/leads/LeadFilters";
import { ApiCallError, isMissingRoute } from "@/lib/api";
import { useSession } from "@/lib/session";

/** Settings-ish page at /ai/agents (D4-I4-04). Tenant-facing names only — nothing about the voice provider. */
export const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["hi", "Hindi"],
  ["mr", "Marathi"],
  ["gu", "Gujarati"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["kn", "Kannada"],
  ["bn", "Bengali"],
];
const languageLabel = (code: string) => LANGUAGES.find(([c]) => c === code)?.[1] ?? code;
const errText = (err: unknown, fallback: string) =>
  err instanceof ApiCallError && err.message ? err.message : fallback;

export function AgentsPage() {
  const { session } = useSession();
  const role = session.status === "ready" ? session.viewerRole : null;
  const canEdit = role === "owner" || role === "admin";
  const q = useAgents();
  const [editing, setEditing] = useState<Agent | "new" | null>(null);
  const unavailable = isMissingRoute(q.error);

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">AI</p>
          <h1 className="text-2xl font-semibold tracking-tight">AI agents</h1>
          <p className="text-sm text-muted-foreground">
            The voices that call your leads, and which counsellors they work with.
          </p>
        </div>
        {canEdit && !unavailable && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> New agent
          </Button>
        )}
      </div>
      {role === "admission_head" && (
        <p className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          View only — owners and admins manage agents.
        </p>
      )}

      {q.isPending ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading agents">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : unavailable ? (
        <StateCard icon={PlugZap} title="Agent service not available yet">
          Managing agents needs a server feature that hasn&apos;t been switched on yet.
        </StateCard>
      ) : q.isError ? (
        <StateCard
          icon={AlertTriangle}
          title="Couldn't load agents"
          tone="error"
          action={
            <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
              Try again
            </Button>
          }
        >
          {errText(q.error, "Check your connection and try again.")}
        </StateCard>
      ) : q.data.items.length === 0 ? (
        <StateCard
          icon={Bot}
          title="No AI agents yet"
          action={
            canEdit && (
              <Button size="sm" onClick={() => setEditing("new")}>
                <Plus /> New agent
              </Button>
            )
          }
        >
          An agent calls your leads in a chosen language and voice.
        </StateCard>
      ) : (
        <ul className="space-y-3">
          {q.data.items.map((a) => (
            <li key={a.id}>
              <AgentCard agent={a} canEdit={canEdit} onEdit={() => setEditing(a)} />
            </li>
          ))}
        </ul>
      )}

      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-4 sm:max-w-md">
          <SheetTitle>{editing === "new" ? "New agent" : "Edit agent"}</SheetTitle>
          <SheetDescription className="mb-4">
            Tenant-facing name, language and voice.
          </SheetDescription>
          {editing && (
            <AgentEditor
              agent={editing === "new" ? null : editing}
              onSaved={() => setEditing(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AgentCard({
  agent: a,
  canEdit,
  onEdit,
}: {
  agent: Agent;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const patch = usePatchAgent(a.id);
  return (
    <article className="space-y-3 rounded-lg border bg-card p-4" aria-label={a.displayName}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold break-words">{a.displayName}</h2>
          <p className="text-sm text-muted-foreground">
            {languageLabel(a.language)}
            {a.voice && ` · ${a.voice}`}
          </p>
        </div>
        {canEdit ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              role="switch"
              aria-checked={a.isActive}
              checked={a.isActive}
              disabled={patch.isPending}
              onChange={(e) => patch.mutate({ isActive: e.target.checked })}
            />
            {a.isActive ? "Active" : "Off"}
          </label>
        ) : (
          <Badge variant={a.isActive ? "secondary" : "outline"}>
            {a.isActive ? "Active" : "Off"}
          </Badge>
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Counsellors</p>
        <ul className="flex flex-wrap gap-1.5" aria-label={`Counsellors for ${a.displayName}`}>
          {a.counsellors.length === 0 && (
            <li className="text-sm text-muted-foreground">None allocated</li>
          )}
          {a.counsellors.map((c) => (
            <li key={c.id}>
              <Badge variant="outline">{c.name}</Badge>
            </li>
          ))}
        </ul>
      </div>
      {patch.isError && (
        <p className="text-sm text-destructive">
          {errText(patch.error, "Couldn't update the agent.")}
        </p>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Allocation agent={a} />
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </div>
      )}
    </article>
  );
}

/** Pick counsellors (options from the real GET /api/leads/filters) and save the full list. */
export function Allocation({ agent: a }: { agent: Agent }) {
  const options = useLeadFilterOptions();
  const put = usePutCounsellors(a.id);
  const [draft, setDraft] = useState<string[] | null>(null);
  const selected = draft ?? a.counsellors.map((c) => c.id);
  const dirty =
    draft !== null &&
    [...draft].sort().join() !==
      a.counsellors
        .map((c) => c.id)
        .sort()
        .join();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EntityFilter
        label="Allocate counsellors"
        emptyText="No counsellors yet"
        state={optionsStateFor(options, "counsellors")}
        selected={selected}
        onChange={setDraft}
      />
      {dirty && (
        <Button
          size="sm"
          disabled={put.isPending}
          onClick={() => put.mutate(selected, { onSuccess: () => setDraft(null) })}
        >
          {put.isPending && <Loader2 className="animate-spin" />}
          Save allocation
        </Button>
      )}
      {put.isError && (
        <span className="text-sm text-destructive">{errText(put.error, "Couldn't save.")}</span>
      )}
    </div>
  );
}

function AgentEditor({ agent: a, onSaved }: { agent: Agent | null; onSaved: () => void }) {
  const isNew = a === null;
  const create = useCreateAgent();
  const patch = usePatchAgent(a?.id ?? "new");
  const workflows = useWorkflowOptions(isNew);
  const [name, setName] = useState(a?.displayName ?? "");
  const [language, setLanguage] = useState(a?.language ?? "en");
  const [voice, setVoice] = useState(a?.voice ?? "");
  // The DOM only ever holds list positions; the opaque option id stays in memory.
  const [workflowIdx, setWorkflowIdx] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = isNew ? create : patch;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const workflowOptionId =
      workflowIdx === "" ? "" : (workflows.data?.items[Number(workflowIdx)]?.id ?? "");
    if (isNew) {
      const r = createAgentBody.safeParse({
        displayName: name,
        language,
        voice: voice || undefined,
        workflowOptionId,
        isActive: true,
      });
      if (!r.success)
        return setErrors(
          Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])),
        );
      setErrors({});
      create.mutate(r.data, { onSuccess: onSaved });
    } else {
      if (!name.trim()) return setErrors({ displayName: "Give the agent a name" });
      setErrors({});
      patch.mutate(
        { displayName: name.trim(), language, voice: voice.trim() || null },
        { onSuccess: onSaved },
      );
    }
  };

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="agent-name">Name</Label>
        <Input
          id="agent-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Asha (English)"
          maxLength={80}
        />
        {errors.displayName && <p className="text-sm text-destructive">{errors.displayName}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="agent-language">Language</Label>
        <select
          id="agent-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="h-9 w-full rounded-md border bg-card px-2 text-sm"
        >
          {LANGUAGES.map(([c, l]) => (
            <option key={c} value={c}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="agent-voice">Voice (optional)</Label>
        <Input
          id="agent-voice"
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          placeholder="e.g. Female, warm"
          maxLength={80}
        />
      </div>
      {isNew && (
        <div className="space-y-1.5">
          <Label htmlFor="agent-workflow">Voice workflow template</Label>
          {workflows.isPending ? (
            <Skeleton className="h-9 w-full" aria-busy="true" aria-label="Loading templates" />
          ) : workflows.isError ? (
            <FormAlert>
              {isMissingRoute(workflows.error)
                ? "Templates aren't available yet."
                : "Couldn't load templates."}
            </FormAlert>
          ) : (
            <select
              id="agent-workflow"
              value={workflowIdx}
              onChange={(e) => setWorkflowIdx(e.target.value)}
              className="h-9 w-full rounded-md border bg-card px-2 text-sm"
            >
              <option value="">Choose a template…</option>
              {workflows.data.items.map((w, i) => (
                <option key={i} value={String(i)}>
                  {w.label}
                </option>
              ))}
            </select>
          )}
          {errors.workflowOptionId && (
            <p className="text-sm text-destructive">{errors.workflowOptionId}</p>
          )}
        </div>
      )}
      {m.isError && (
        <FormAlert>
          {isMissingRoute(m.error)
            ? "Saving agents isn't available yet."
            : errText(m.error, "Couldn't save.")}
        </FormAlert>
      )}
      <Button type="submit" disabled={m.isPending}>
        {m.isPending && <Loader2 className="animate-spin" />}
        {isNew ? "Create agent" : "Save"}
      </Button>
    </form>
  );
}
