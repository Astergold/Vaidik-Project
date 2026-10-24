import { useState, type FormEvent, type ReactNode } from "react";
import {
  DEADLINE_KINDS,
  FEE_KINDS,
  SEAT_BUCKETS,
  type ProgramDetail,
  type SeatBucket,
} from "@vernacular/contracts";
import { AlertTriangle, GraduationCap, Loader2, PlugZap, Plus } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { zonedLocalToIso } from "@/features/lead360/stage-form";
import { usePrograms, useProgramMutations } from "@/features/programs/programs-api";
import { ApiCallError, isMissingRoute } from "@/lib/api";
import { formatCount, formatDate } from "@/lib/labels";
import { useSession, useTenantTimeZone } from "@/lib/session";

/** /programs (D4-I4-03): catalogue list + a side-sheet editor (no detail route). */
export const BUCKET_LABEL: Record<SeatBucket, string> = {
  open: "Seats open",
  limited: "Limited seats",
  closed: "Closed",
};
const FEE_LABEL: Record<(typeof FEE_KINDS)[number], string> = {
  tuition: "Tuition",
  hostel: "Hostel",
  application: "Application",
  other: "Other",
};
const DEADLINE_LABEL: Record<(typeof DEADLINE_KINDS)[number], string> = {
  application: "Application",
  fee_payment: "Fee payment",
  documents: "Documents",
  admission_close: "Admissions close",
};
const errText = (err: unknown, fallback: string) =>
  isMissingRoute(err)
    ? "This isn't available yet."
    : err instanceof ApiCallError && err.message
      ? err.message
      : fallback;
const currentYear = () => {
  const y = new Date().getFullYear();
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};

export function useCanMutateCatalog() {
  const { session } = useSession();
  const role = session.status === "ready" ? session.viewerRole : null;
  return { canMutate: role === "owner" || role === "admin", readOnly: role === "admission_head" };
}

export function ProgramsPage() {
  const { canMutate, readOnly } = useCanMutateCatalog();
  const q = usePrograms();
  const [open, setOpen] = useState<string | "new" | null>(null);
  const current =
    open && open !== "new" ? (q.data?.items.find((p) => p.id === open) ?? null) : null;
  const unavailable = isMissingRoute(q.error);

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Programs
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Programs</h1>
          <p className="text-sm text-muted-foreground">
            Fees, seat availability, deadlines and eligibility the AI agents quote.
          </p>
        </div>
        {canMutate && !unavailable && (
          <Button onClick={() => setOpen("new")}>
            <Plus /> New program
          </Button>
        )}
      </div>
      {readOnly && (
        <p className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          View only — owners and admins edit programs.
        </p>
      )}

      {q.isPending ? (
        <Skeleton className="h-40 w-full" aria-busy="true" aria-label="Loading programs" />
      ) : unavailable ? (
        <StateCard icon={PlugZap} title="Programs service not available yet">
          The program catalogue needs a server feature that hasn&apos;t been switched on yet.
        </StateCard>
      ) : q.isError ? (
        <StateCard
          icon={AlertTriangle}
          title="Couldn't load programs"
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
          icon={GraduationCap}
          title="No programs yet"
          action={
            canMutate && (
              <Button size="sm" onClick={() => setOpen("new")}>
                <Plus /> New program
              </Button>
            )
          }
        >
          Add each program students can apply to.
        </StateCard>
      ) : (
        <ul className="space-y-2">
          {q.data.items.map((p) => (
            <li key={p.id}>
              <ProgramRow program={p} onOpen={() => setOpen(p.id)} />
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-4 sm:max-w-xl">
          <SheetTitle>{open === "new" ? "New program" : (current?.name ?? "Program")}</SheetTitle>
          <SheetDescription className="mb-4">
            {canMutate ? "Changes save section by section." : "View only."}
          </SheetDescription>
          {open === "new" && <NewProgram onCreated={(id) => setOpen(id)} />}
          {current && <ProgramEditor program={current} canMutate={canMutate} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ProgramRow({ program: p, onOpen }: { program: ProgramDetail; onOpen: () => void }) {
  const tz = useTenantTimeZone();
  const seat = p.seats[0];
  const next = [...p.deadlines].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  const tuition = p.fees.find((f) => f.kind === "tuition");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border bg-card p-4 text-left hover:bg-accent/40"
      aria-label={`Open ${p.name}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words">{p.name}</p>
          <p className="text-xs text-muted-foreground">
            {[
              p.code,
              tuition && `Tuition ₹${formatCount(tuition.amount)} (${tuition.academicYear})`,
              next && `${DEADLINE_LABEL[next.kind]} by ${formatDate(next.dueAt, tz)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {seat && (
            <Badge variant={seat.bucket === "closed" ? "outline" : "secondary"}>
              {BUCKET_LABEL[seat.bucket]}
            </Badge>
          )}
          {!p.isActive && <Badge variant="outline">Inactive</Badge>}
        </div>
      </div>
    </button>
  );
}

function NewProgram({ onCreated }: { onCreated: (id: string) => void }) {
  const m = useProgramMutations(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    m.create.mutate(
      { name: name.trim(), ...(code.trim() ? { code: code.trim() } : {}), isActive: true },
      { onSuccess: (p) => onCreated(p.id) },
    );
  };
  return (
    <form noValidate onSubmit={submit} className="space-y-3">
      <Field id="prog-name" label="Name">
        <Input
          id="prog-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={150}
          placeholder="e.g. B.Tech Computer Science"
        />
      </Field>
      <Field id="prog-code" label="Code (optional)">
        <Input
          id="prog-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={30}
        />
      </Field>
      {m.create.isError && (
        <FormAlert>{errText(m.create.error, "Couldn't create the program.")}</FormAlert>
      )}
      <Button type="submit" disabled={!name.trim() || m.create.isPending}>
        {m.create.isPending && <Loader2 className="animate-spin" />}Create program
      </Button>
    </form>
  );
}

/** The editor sections. Read-only roles see the same data without inputs. */
export function ProgramEditor({
  program: p,
  canMutate,
}: {
  program: ProgramDetail;
  canMutate: boolean;
}) {
  const tz = useTenantTimeZone();
  const m = useProgramMutations(p.id);
  const year = currentYear();
  const [fee, setFee] = useState({ amount: "", kind: "tuition", academicYear: year });
  const [seat, setSeat] = useState<{ academicYear: string; bucket: SeatBucket | "" }>({
    academicYear: year,
    bucket: p.seats.find((s) => s.academicYear === year)?.bucket ?? "",
  });
  const [deadline, setDeadline] = useState({ kind: "application", date: "" });
  const [elig, setElig] = useState({
    summary: p.eligibility?.summary ?? "",
    minimums: p.eligibility?.minimums ?? [],
  });
  const [err, setErr] = useState<Record<string, string>>({});

  const addFee = (e: FormEvent) => {
    e.preventDefault();
    const amount = /^\d+$/.test(fee.amount) ? Number(fee.amount) : NaN;
    if (Number.isNaN(amount)) return setErr({ fee: "Enter the amount in whole rupees" });
    setErr({});
    m.addFee.mutate(
      {
        amount,
        kind: FEE_KINDS.find((k) => k === fee.kind) ?? "tuition",
        academicYear: fee.academicYear,
      },
      { onSuccess: () => setFee({ ...fee, amount: "" }) },
    );
  };
  const saveSeat = (e: FormEvent) => {
    e.preventDefault();
    if (!seat.bucket) return setErr({ seat: "Choose how available seats are" });
    setErr({});
    m.setSeat.mutate({ academicYear: seat.academicYear, bucket: seat.bucket });
  };
  const addDeadline = (e: FormEvent) => {
    e.preventDefault();
    const dueAt = deadline.date ? zonedLocalToIso(`${deadline.date}T23:59`, tz) : null;
    if (!dueAt) return setErr({ deadline: "Pick a date" });
    setErr({});
    m.addDeadline.mutate(
      { kind: DEADLINE_KINDS.find((k) => k === deadline.kind) ?? "application", dueAt },
      { onSuccess: () => setDeadline({ ...deadline, date: "" }) },
    );
  };
  const saveElig = (e: FormEvent) => {
    e.preventDefault();
    if (!elig.summary.trim()) return setErr({ elig: "Describe who can apply" });
    setErr({});
    m.setEligibility.mutate({
      summary: elig.summary.trim(),
      minimums: elig.minimums.filter((x) => x.label.trim() && x.value.trim()),
    });
  };

  return (
    <div className="min-w-0 space-y-5">
      <Section title="Fees">
        {p.fees.length === 0 ? (
          <None>No fees yet.</None>
        ) : (
          <ul className="space-y-1 text-sm">
            {p.fees.map((f) => (
              <li key={f.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {FEE_LABEL[f.kind]} · {f.academicYear}
                </span>
                <span className="tabular-nums">₹{formatCount(f.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {canMutate && (
          <form
            noValidate
            onSubmit={addFee}
            className="flex flex-wrap items-end gap-2"
            aria-label="Add fee"
          >
            <Field id="fee-amount" label="Amount (₹)">
              <Input
                id="fee-amount"
                inputMode="numeric"
                value={fee.amount}
                onChange={(e) => setFee({ ...fee, amount: e.target.value })}
                className="w-32"
              />
            </Field>
            <Field id="fee-kind" label="Kind">
              <Select
                id="fee-kind"
                value={fee.kind}
                onChange={(v) => setFee({ ...fee, kind: v })}
                options={FEE_KINDS.map((k) => [k, FEE_LABEL[k]])}
              />
            </Field>
            <Field id="fee-year" label="Year">
              <Input
                id="fee-year"
                value={fee.academicYear}
                onChange={(e) => setFee({ ...fee, academicYear: e.target.value })}
                className="w-24"
              />
            </Field>
            <Button type="submit" size="sm" disabled={m.addFee.isPending}>
              Add fee
            </Button>
            <Err
              e={
                err.fee ?? (m.addFee.isError ? errText(m.addFee.error, "Couldn't add.") : undefined)
              }
            />
          </form>
        )}
      </Section>

      <Section title="Seat availability">
        {/* Category only — the AI never quotes a seat count (handbook §7.4). There is deliberately no number field. */}
        {p.seats.length === 0 ? (
          <None>Not set.</None>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {p.seats.map((s) => (
              <li key={s.academicYear}>
                <Badge variant="secondary">
                  {s.academicYear}: {BUCKET_LABEL[s.bucket]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {canMutate && (
          <form
            noValidate
            onSubmit={saveSeat}
            className="flex flex-wrap items-end gap-2"
            aria-label="Seat availability"
          >
            <Field id="seat-year" label="Year">
              <Input
                id="seat-year"
                value={seat.academicYear}
                onChange={(e) => setSeat({ ...seat, academicYear: e.target.value })}
                className="w-24"
              />
            </Field>
            <Field id="seat-bucket" label="Availability">
              <Select
                id="seat-bucket"
                value={seat.bucket}
                onChange={(v) =>
                  setSeat({ ...seat, bucket: SEAT_BUCKETS.find((b) => b === v) ?? "" })
                }
                options={[
                  ["", "Choose…"],
                  ...SEAT_BUCKETS.map((b): [string, string] => [b, BUCKET_LABEL[b]]),
                ]}
              />
            </Field>
            <Button type="submit" size="sm" disabled={m.setSeat.isPending}>
              Save
            </Button>
            <Err
              e={
                err.seat ??
                (m.setSeat.isError ? errText(m.setSeat.error, "Couldn't save.") : undefined)
              }
            />
          </form>
        )}
      </Section>

      <Section title="Deadlines">
        {p.deadlines.length === 0 ? (
          <None>No deadlines yet.</None>
        ) : (
          <ul className="space-y-1 text-sm">
            {[...p.deadlines]
              .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
              .map((d) => (
                <li key={d.id}>
                  {DEADLINE_LABEL[d.kind]} — {formatDate(d.dueAt, tz)}
                </li>
              ))}
          </ul>
        )}
        {canMutate && (
          <form
            noValidate
            onSubmit={addDeadline}
            className="flex flex-wrap items-end gap-2"
            aria-label="Add deadline"
          >
            <Field id="dl-kind" label="Kind">
              <Select
                id="dl-kind"
                value={deadline.kind}
                onChange={(v) => setDeadline({ ...deadline, kind: v })}
                options={DEADLINE_KINDS.map((k) => [k, DEADLINE_LABEL[k]])}
              />
            </Field>
            <Field id="dl-date" label={`Date (${tz})`}>
              <Input
                id="dl-date"
                type="date"
                value={deadline.date}
                onChange={(e) => setDeadline({ ...deadline, date: e.target.value })}
                className="w-40"
              />
            </Field>
            <Button type="submit" size="sm" disabled={m.addDeadline.isPending}>
              Add deadline
            </Button>
            <Err
              e={
                err.deadline ??
                (m.addDeadline.isError ? errText(m.addDeadline.error, "Couldn't add.") : undefined)
              }
            />
          </form>
        )}
      </Section>

      <Section title="Eligibility">
        {!canMutate ? (
          p.eligibility ? (
            <div className="space-y-1 text-sm">
              <p className="whitespace-pre-wrap">{p.eligibility.summary}</p>
              {p.eligibility.minimums.map((x, i) => (
                <p key={i} className="text-muted-foreground">
                  {x.label}: {x.value}
                </p>
              ))}
            </div>
          ) : (
            <None>Not set.</None>
          )
        ) : (
          <form noValidate onSubmit={saveElig} className="space-y-2" aria-label="Eligibility">
            <Field id="elig-summary" label="Who can apply">
              <Textarea
                id="elig-summary"
                value={elig.summary}
                onChange={(e) => setElig({ ...elig, summary: e.target.value })}
                rows={3}
                maxLength={2000}
              />
            </Field>
            {elig.minimums.map((x, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <Input
                  aria-label={`Requirement ${i + 1}`}
                  value={x.label}
                  onChange={(e) =>
                    setElig({
                      ...elig,
                      minimums: elig.minimums.map((y, j) =>
                        j === i ? { ...y, label: e.target.value } : y,
                      ),
                    })
                  }
                  placeholder="e.g. 12th marks"
                  className="min-w-0 flex-1"
                />
                <Input
                  aria-label={`Minimum ${i + 1}`}
                  value={x.value}
                  onChange={(e) =>
                    setElig({
                      ...elig,
                      minimums: elig.minimums.map((y, j) =>
                        j === i ? { ...y, value: e.target.value } : y,
                      ),
                    })
                  }
                  placeholder="e.g. 60%"
                  className="w-28"
                />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setElig({ ...elig, minimums: [...elig.minimums, { label: "", value: "" }] })
                }
              >
                Add a minimum
              </Button>
              <Button type="submit" size="sm" disabled={m.setEligibility.isPending}>
                Save eligibility
              </Button>
            </div>
            <Err
              e={
                err.elig ??
                (m.setEligibility.isError
                  ? errText(m.setEligibility.error, "Couldn't save.")
                  : undefined)
              }
            />
          </form>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-2 rounded-lg border p-3" aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}
const None = ({ children }: { children: string }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
);
const Err = ({ e }: { e?: string }) =>
  e ? <p className="w-full text-sm text-destructive">{e}</p> : null;
function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
function Select({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border bg-card px-2 text-sm"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
