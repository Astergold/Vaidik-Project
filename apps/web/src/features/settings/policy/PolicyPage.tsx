import { useState, type FormEvent, type ReactNode } from "react";
import { createHolidayBody, type PolicySettings } from "@vernacular/contracts";
import { CalendarOff, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { Switch } from "@/components/Switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddHoliday,
  useDeleteHoliday,
  useHolidays,
  usePolicy,
  useSavePolicy,
} from "@/features/settings/policy/policy-api";
import {
  DAYS,
  fromForm,
  toForm,
  toggleDay,
  type PolicyForm,
} from "@/features/settings/policy/policy-form";
import { isMissingRoute } from "@/lib/api";
import { apiFieldErrors, type FieldErrors } from "@/lib/forms";
import { formatDate } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

/** /settings/policy (D6-I4-02): the calling rules every dial and message is checked against — LIVE API. */
export function PolicyPage() {
  return (
    <RoleGate page="settings.policy">
      <div className="mx-auto w-full max-w-4xl min-w-0 space-y-6">
        <PageHeader
          area="Settings"
          title="Policy & holidays"
          description="When and how often the AI may call. Changes apply to the very next dial."
        />
        <PolicySection />
        <HolidaysSection />
      </div>
    </RoleGate>
  );
}

function PolicySection() {
  const q = usePolicy();
  // Owned here so "Saved" survives the remount that shows the server's values.
  const save = useSavePolicy();
  return (
    <QueryGate q={q} what="the calling policy" service="Policy">
      {q.data && <PolicyEditor key={q.dataUpdatedAt} saved={q.data} save={save} />}
    </QueryGate>
  );
}

function PolicyEditor({
  saved,
  save,
}: {
  saved: PolicySettings;
  save: ReturnType<typeof useSavePolicy>;
}) {
  const tz = useTenantTimeZone();
  const [form, setForm] = useState<PolicyForm>(() => toForm(saved));
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (patch: Partial<PolicyForm>) => setForm((f) => ({ ...f, ...patch }));
  const serverErrors = apiFieldErrors(save.error);
  const shown = { ...serverErrors, ...errors };
  const err = (k: string) => shown[k] && <p className="text-sm text-destructive">{shown[k]}</p>;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = fromForm(form);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    save.mutate(r.body);
  };

  return (
    <form noValidate onSubmit={submit} className="space-y-4" aria-label="Calling policy">
      <Card
        title="Calling window"
        hint={`Times are in ${tz}. The end is exclusive: with 21:00 the last call starts at 20:59.`}
      >
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-start">From</Label>
            <Input
              id="p-start"
              type="time"
              step={60}
              value={form.callWindowStart}
              onChange={(e) => set({ callWindowStart: e.target.value })}
              className="w-32"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-end">Until</Label>
            <Input
              id="p-end"
              type="time"
              step={60}
              value={form.callWindowEnd}
              onChange={(e) => set({ callWindowEnd: e.target.value })}
              className="w-32"
            />
          </div>
        </div>
        {err("callWindowStart")}
        {err("callWindowEnd")}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Days</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map(([d, label]) => {
              const on = form.allowedDays.includes(d);
              return (
                <label
                  key={d}
                  className={cn(
                    "cursor-pointer rounded-md border px-3 py-1.5 text-sm select-none",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={(e) =>
                      set({ allowedDays: toggleDay(form.allowedDays, d, e.target.checked) })
                    }
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>
        {err("allowedDays")}
      </Card>

      <Card title="Attempts" hint="Per lead. The dialler waits at least the gap between two calls.">
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["maxAttemptsPerDay", "Max calls per day", "1–20"],
              ["maxAttemptsTotal", "Max calls in total", "1–100"],
              ["minGapMinutes", "Minimum gap (minutes)", "0–1440"],
            ] as const
          ).map(([k, label, range]) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`p-${k}`}>{label}</Label>
              <Input
                id={`p-${k}`}
                inputMode="numeric"
                value={form[k]}
                onChange={(e) => set({ [k]: e.target.value })}
                aria-describedby={`p-${k}-hint`}
              />
              <p id={`p-${k}-hint`} className="text-xs text-muted-foreground">
                {range}
              </p>
              {err(k)}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Compliance">
        <div className="space-y-3">
          <Toggle
            label="Require consent before calling"
            hint="A form submission counts as consent, with evidence."
            checked={form.requireConsent}
            onChange={(v) => set({ requireConsent: v })}
          />
          <Toggle
            label="Check the NDNC registry"
            hint="Numbers on the national do-not-call list are skipped."
            checked={form.ndncCheck}
            onChange={(v) => set({ ndncCheck: v })}
          />
          <Toggle
            label="Promotional calls need a 140-series number"
            hint="Flag only, until legal decides."
            checked={form.promoRequires140}
            onChange={(v) => set({ promoRequires140: v })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-disclosure">AI disclosure (said at the start of every call)</Label>
          <Textarea
            id="p-disclosure"
            value={form.aiDisclosureText}
            onChange={(e) => set({ aiDisclosureText: e.target.value })}
            maxLength={2000}
            rows={3}
            placeholder="e.g. Hi, this is an automated assistant calling from MIT-ADT University."
          />
          {err("aiDisclosureText")}
        </div>
      </Card>

      {save.isError && Object.keys(serverErrors).length === 0 && (
        <FormAlert>{errText(save.error, "Couldn't save the policy.")}</FormAlert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Save policy
        </Button>
        {save.isSuccess && (
          <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" /> Saved — applies to the next dial
          </span>
        )}
      </div>
    </form>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3 rounded-lg border bg-card p-4" aria-label={title}>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function HolidaysSection() {
  const tz = useTenantTimeZone();
  const q = useHolidays();
  const add = useAddHoliday();
  const del = useDeleteHoliday();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const items = q.data?.items ?? [];
  const unavailable = isMissingRoute(q.error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = createHolidayBody.safeParse({ date, name });
    if (!r.success)
      return setErrors(
        Object.fromEntries(
          r.error.issues.map((i) => [
            String(i.path[0]),
            i.path[0] === "date" ? "Pick a date" : "Name the holiday",
          ]),
        ),
      );
    setErrors({});
    add.mutate(r.data, {
      onSuccess: () => {
        setDate("");
        setName("");
      },
    });
  };
  return (
    <section className="min-w-0 space-y-3 rounded-lg border bg-card p-4" aria-label="Holidays">
      <div>
        <h2 className="text-sm font-semibold">Holidays</h2>
        <p className="text-xs text-muted-foreground">
          No calls on these dates. Adding an existing date renames it.
        </p>
      </div>
      {unavailable ? (
        <p className="text-sm text-muted-foreground">Holidays aren&apos;t available yet.</p>
      ) : (
        <form
          noValidate
          onSubmit={submit}
          className="flex flex-wrap items-end gap-2"
          aria-label="Add a holiday"
        >
          <div className="space-y-1">
            <Label htmlFor="h-date">Date</Label>
            <Input
              id="h-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="min-w-0 flex-1 basis-48 space-y-1">
            <Label htmlFor="h-name">Name</Label>
            <Input
              id="h-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Diwali"
            />
          </div>
          <Button type="submit" variant="outline" disabled={add.isPending}>
            {add.isPending && <Loader2 className="animate-spin" />}
            Add holiday
          </Button>
        </form>
      )}
      {(errors.date || errors.name) && (
        <p className="text-sm text-destructive">{errors.date ?? errors.name}</p>
      )}
      {add.isError && <FormAlert>{errText(add.error, "Couldn't add the holiday.")}</FormAlert>}
      {del.isError && <FormAlert>{errText(del.error, "Couldn't remove the holiday.")}</FormAlert>}
      {/* Compact states inside the card (a full-size StateCard nested here read as two pages). */}
      {unavailable ? null : q.isPending ? (
        <Skeleton className="h-16 w-full" aria-busy="true" aria-label="Loading holidays" />
      ) : q.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          {errText(q.error, "Couldn't load holidays.")}
          <Button size="xs" variant="outline" onClick={() => void q.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarOff className="size-4" aria-hidden /> No holidays yet.
        </p>
      ) : (
        <ul className="divide-y rounded-md border" aria-label="Holiday list">
          {items.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 break-words">
                <span className="font-medium">{formatDate(`${h.date}T12:00:00Z`, tz)}</span> ·{" "}
                {h.name}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${h.name}`}
                disabled={del.isPending && del.variables === h.id}
                onClick={() => del.mutate(h.id)}
              >
                {del.isPending && del.variables === h.id ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
