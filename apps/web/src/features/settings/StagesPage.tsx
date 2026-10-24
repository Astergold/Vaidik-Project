import { useState, type FormEvent } from "react";
import { createSubStageBody, type CoreStage, type SubStage } from "@vernacular/contracts";
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStageMutations, useStages } from "@/features/settings/settings-api";
import { STAGE_LABEL } from "@/lib/labels";
import { errText } from "@/lib/seam";

/**
 * /settings/stages (D6-I4-02): the 11 core stages are fixed (handbook §7.1); tenants add sub-stages under any of them.
 * Every change shows what the server returned; a sub-stage in use can't be deleted.
 */
export function StagesPage() {
  return (
    <RoleGate page="settings.stages">
      <div className="mx-auto w-full max-w-4xl min-w-0 space-y-4">
        <PageHeader
          area="Settings"
          title="Stages & sub-stages"
          description="Core stages are the same for everyone. Add your own sub-stages to track finer steps, e.g. Interested → Waiting for JEE result."
        />
        <Loaded />
      </div>
    </RoleGate>
  );
}

function Loaded() {
  const q = useStages();
  const m = useStageMutations();
  const errors = [m.add, m.rename, m.remove, m.reorder].filter((x) => x.isError);
  return (
    <QueryGate q={q} what="stages" service="Settings">
      {errors.map((x, i) => (
        <p key={i} role="alert" className="text-sm text-destructive">
          {errText(x.error, "That didn't work. Try again.")}
        </p>
      ))}
      <ol className="space-y-3" aria-label="Core stages">
        {q.data?.stages.map((g, i) => (
          <li key={g.stage}>
            <StageCard index={i + 1} stage={g.stage} subStages={g.subStages} m={m} />
          </li>
        ))}
      </ol>
    </QueryGate>
  );
}

type M = ReturnType<typeof useStageMutations>;

function StageCard({
  index,
  stage,
  subStages,
  m,
}: {
  index: number;
  stage: CoreStage;
  subStages: SubStage[];
  m: M;
}) {
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const sorted = [...subStages].sort((a, b) => a.sortOrder - b.sortOrder);
  const busy = m.add.isPending && m.add.variables?.coreStage === stage;
  const add = (e: FormEvent) => {
    e.preventDefault();
    const r = createSubStageBody.safeParse({ coreStage: stage, name });
    if (!r.success) return setProblem(r.error.issues[0]?.message ?? "Name the sub-stage");
    setProblem(null);
    m.add.mutate(r.data, { onSuccess: () => setName("") });
  };
  const move = (i: number, dir: -1 | 1) => {
    const ids = sorted.map((s) => s.id);
    const j = i + dir;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    m.reorder.mutate({ stage, ids });
  };
  return (
    <section
      className="min-w-0 space-y-2 rounded-lg border bg-card p-4"
      aria-label={STAGE_LABEL[stage]}
    >
      <h2 className="text-sm font-semibold">
        <span className="mr-2 text-muted-foreground tabular-nums">{index}.</span>
        {STAGE_LABEL[stage]}
      </h2>
      {sorted.length > 0 && (
        <ul className="space-y-1" aria-label={`Sub-stages of ${STAGE_LABEL[stage]}`}>
          {sorted.map((s, i) => (
            <SubStageRow
              key={s.id}
              s={s}
              first={i === 0}
              last={i === sorted.length - 1}
              onMove={(d) => move(i, d)}
              m={m}
            />
          ))}
        </ul>
      )}
      <form onSubmit={add} noValidate className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New sub-stage"
          aria-label={`New sub-stage under ${STAGE_LABEL[stage]}`}
          maxLength={60}
          className="h-8 min-w-0 flex-1 basis-48"
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
          Add
        </Button>
      </form>
      {problem && <p className="text-sm text-destructive">{problem}</p>}
    </section>
  );
}

function SubStageRow({
  s,
  first,
  last,
  onMove,
  m,
}: {
  s: SubStage;
  first: boolean;
  last: boolean;
  onMove: (d: -1 | 1) => void;
  m: M;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  const inUse = s.leadCount > 0;
  return (
    <li className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm">
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            m.rename.mutate({ id: s.id, name }, { onSuccess: () => setEditing(false) });
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={`Rename ${s.name}`}
            maxLength={60}
            className="h-7 min-w-0 flex-1"
            autoFocus
          />
          <Button type="submit" size="icon-xs" variant="ghost" aria-label="Save name">
            <Check />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Cancel rename"
            onClick={() => {
              setEditing(false);
              setName(s.name);
            }}
          >
            <X />
          </Button>
        </form>
      ) : (
        <span className="min-w-0 flex-1 break-words">
          {s.name}
          <span className="ml-2 text-xs text-muted-foreground">{s.leadCount} leads</span>
        </span>
      )}
      <div className="flex items-center gap-0.5">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Move ${s.name} up`}
          disabled={first || m.reorder.isPending}
          onClick={() => onMove(-1)}
        >
          <ArrowUp />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Move ${s.name} down`}
          disabled={last || m.reorder.isPending}
          onClick={() => onMove(1)}
        >
          <ArrowDown />
        </Button>
        {!editing && (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Rename ${s.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
        )}
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={inUse ? `${s.name} is in use and can't be deleted` : `Delete ${s.name}`}
          title={inUse ? "Move its leads to another sub-stage first" : undefined}
          disabled={inUse || m.remove.isPending}
          onClick={() => m.remove.mutate(s.id)}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}
