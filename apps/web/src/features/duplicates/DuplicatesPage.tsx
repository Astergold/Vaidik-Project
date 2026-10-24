import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { DuplicateCandidate, DuplicatePerson, MergeResult } from "@vernacular/contracts";
import { CheckCircle2, GitMerge, Loader2, X } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate, useViewerRole } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDismissDuplicate, useDuplicates, useMerge } from "@/features/duplicates/duplicates-api";
import { formatCount, formatDate, STAGE_LABEL } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

const REASON: Record<DuplicateCandidate["reason"], string> = {
  same_phone: "Same phone number",
  same_email: "Same email",
  same_application_no: "Same application number",
  similar_name_phone: "Similar name and phone",
};
const KIND: Record<DuplicatePerson["identifiers"][number]["kind"], string> = {
  phone: "Phone",
  email: "Email",
  application_no: "Application no.",
  external_id: "Provider id",
};
const personLabel = (p: DuplicatePerson) => p.fullName ?? "Unnamed person";

/** Suggested survivor: more leads, then more calls (the user can switch). */
export const suggestSurvivor = (c: DuplicateCandidate): "a" | "b" =>
  c.b.leads.length > c.a.leads.length ||
  (c.b.leads.length === c.a.leads.length && c.b.callCount > c.a.callCount)
    ? "b"
    : "a";

/** /leads/duplicates (D6-I4-04c): suspected duplicate people side by side; managers merge (keeping every call) or dismiss. */
export function DuplicatesPage() {
  return (
    <RoleGate page="leads.duplicates">
      <div className="mx-auto w-full max-w-6xl min-w-0 space-y-4">
        <PageHeader
          area="Leads"
          title="Duplicates"
          description="People who look like the same student. Merging keeps every call, note and identifier."
        />
        <List />
      </div>
    </RoleGate>
  );
}

function List() {
  const q = useDuplicates();
  const [done, setDone] = useState<string | null>(null);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <QueryGate
      q={q}
      what="duplicates"
      service="Duplicates"
      empty={
        items.length === 0 && (
          <>
            {done && <Done text={done} />}
            <StateCard icon={CheckCircle2} title="No suspected duplicates">
              The nightly check found nothing to review.
            </StateCard>
          </>
        )
      }
    >
      {done && <Done text={done} />}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {formatCount(q.data?.pages[0]?.total ?? 0)} to review
      </p>
      <ul className="space-y-4">
        {items.map((c) => (
          <li key={c.id}>
            <PairCard c={c} onDone={setDone} />
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
        >
          {q.isFetchingNextPage && <Loader2 className="animate-spin" />}
          Load more
        </Button>
      )}
    </QueryGate>
  );
}

function Done({ text }: { text: string }) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
    >
      <CheckCircle2 className="size-4 text-primary" aria-hidden /> {text}
    </p>
  );
}

const mergedText = (name: string, r: MergeResult) =>
  `Merged into ${name}: ${r.moved.leads} lead(s), ${r.moved.calls} call(s), ${r.moved.identifiers} identifier(s) and ${r.moved.notes} note(s) moved.`;

function PairCard({ c, onDone }: { c: DuplicateCandidate; onDone: (msg: string) => void }) {
  const tz = useTenantTimeZone();
  const role = useViewerRole();
  const canMerge = role === "owner" || role === "admin" || role === "admission_head";
  const [keep, setKeep] = useState<"a" | "b">(() => suggestSurvivor(c));
  const [confirming, setConfirming] = useState(false);
  const merge = useMerge(c.id);
  const dismiss = useDismissDuplicate(c.id);
  const survivor = keep === "a" ? c.a : c.b;
  const merged = keep === "a" ? c.b : c.a;
  return (
    <article
      className="min-w-0 space-y-3 rounded-lg border bg-card p-4"
      aria-label={`${personLabel(c.a)} and ${personLabel(c.b)}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{REASON[c.reason]}</Badge>
        <span className="text-xs text-muted-foreground">
          {Math.round(c.score * 100)}% likely · found {formatDate(c.detectedAt, tz)}
        </span>
      </div>
      <div
        role={canMerge ? "radiogroup" : undefined}
        aria-label={canMerge ? "Which record to keep" : undefined}
        className="grid min-w-0 gap-3 md:grid-cols-2"
      >
        {(["a", "b"] as const).map((side) => (
          <PersonColumn
            key={side}
            p={c[side]}
            canMerge={canMerge}
            kept={keep === side}
            onKeep={() => setKeep(side)}
            name={`keep-${c.id}`}
          />
        ))}
      </div>
      {(merge.isError || dismiss.isError) && (
        <FormAlert>{errText(merge.error ?? dismiss.error, "That didn't work.")}</FormAlert>
      )}
      {canMerge ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setConfirming(true)}>
            <GitMerge /> Merge into {personLabel(survivor)}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={dismiss.isPending}
            onClick={() =>
              dismiss.mutate(undefined, { onSuccess: () => onDone("Marked as different people.") })
            }
          >
            {dismiss.isPending ? <Loader2 className="animate-spin" /> : <X />}
            Not the same person
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ask your admission head to merge or dismiss this pair.
        </p>
      )}
      {confirming && (
        <Dialog open onOpenChange={(o) => !o && !merge.isPending && setConfirming(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogTitle>
              Merge {personLabel(merged)} into {personLabel(survivor)}?
            </DialogTitle>
            <DialogDescription>
              {personLabel(merged)}&apos;s {merged.leads.length} lead(s), {merged.callCount}{" "}
              call(s), phone numbers, emails, consent and notes move to {personLabel(survivor)}. No
              call is deleted. Both records are written to the audit log. This can&apos;t be undone.
            </DialogDescription>
            {merge.isError && <FormAlert>{errText(merge.error, "Couldn't merge.")}</FormAlert>}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirming(false)}
                disabled={merge.isPending}
              >
                Cancel
              </Button>
              <Button
                disabled={merge.isPending}
                onClick={() =>
                  merge.mutate(
                    { survivorId: survivor.id, mergedId: merged.id },
                    { onSuccess: (r) => onDone(mergedText(personLabel(survivor), r)) },
                  )
                }
              >
                {merge.isPending && <Loader2 className="animate-spin" />}
                Merge
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </article>
  );
}

function PersonColumn({
  p,
  canMerge,
  kept,
  onKeep,
  name,
}: {
  p: DuplicatePerson;
  canMerge: boolean;
  kept: boolean;
  onKeep: () => void;
  name: string;
}) {
  const tz = useTenantTimeZone();
  return (
    <section
      className={cn(
        "min-w-0 space-y-2 rounded-md border p-3",
        kept && canMerge && "border-primary",
      )}
      aria-label={personLabel(p)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold break-words">{personLabel(p)}</h3>
          <p className="text-xs text-muted-foreground">
            {p.city ?? "City unknown"} · {p.callCount} call(s) ·{" "}
            {p.lastActivityAt ? `last active ${formatDate(p.lastActivityAt, tz)}` : "no activity"}
          </p>
        </div>
        {canMerge && (
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" name={name} checked={kept} onChange={onKeep} />
            Keep this one
          </label>
        )}
      </div>
      <dl className="space-y-1 text-sm">
        {p.identifiers.map((i, n) => (
          <div key={n} className="flex min-w-0 justify-between gap-2">
            <dt className="text-muted-foreground">{KIND[i.kind]}</dt>
            <dd className="min-w-0 text-right break-all">{i.value}</dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-1 border-t pt-2 text-sm" aria-label={`Leads of ${personLabel(p)}`}>
        {p.leads.length === 0 && <li className="text-muted-foreground">No leads</li>}
        {p.leads.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-x-2">
            <Link
              to="/leads/$leadId"
              params={{ leadId: l.id }}
              className="font-medium hover:underline"
            >
              {l.cycle}
            </Link>
            <Badge variant="outline">{STAGE_LABEL[l.stage]}</Badge>
            <span className="text-xs text-muted-foreground">
              {[l.program, l.source].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
