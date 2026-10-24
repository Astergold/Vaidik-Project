import { useState, type FormEvent } from "react";
import { putGeneralBody, type GeneralSettings } from "@vernacular/contracts";
import { CheckCircle2, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { timezoneOptions } from "@/features/platform/tenant-form";
import { useGeneral, useSaveGeneral } from "@/features/settings/settings-api";
import { apiFieldErrors, type FieldErrors } from "@/lib/forms";
import { errText } from "@/lib/seam";

/** /settings (D6-I4-02): institution name, timezone and the current admission cycle. */
export function GeneralPage() {
  return (
    <RoleGate page="settings.general">
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-4">
        <PageHeader
          area="Settings"
          title="General"
          description="Your institution's name, the timezone every date and calling hour uses, and the admission cycle."
        />
        <Loaded />
      </div>
    </RoleGate>
  );
}

function Loaded() {
  const q = useGeneral();
  const save = useSaveGeneral();
  return (
    <QueryGate q={q} what="general settings" service="Settings">
      {q.data && <GeneralForm key={q.dataUpdatedAt} saved={q.data} save={save} />}
    </QueryGate>
  );
}

function GeneralForm({
  saved,
  save,
}: {
  saved: GeneralSettings;
  save: ReturnType<typeof useSaveGeneral>;
}) {
  const [name, setName] = useState(saved.name);
  const [timezone, setTimezone] = useState(saved.timezone);
  const [cycle, setCycle] = useState({
    name: saved.currentCycle?.name ?? "",
    startsOn: saved.currentCycle?.startsOn ?? "",
    endsOn: saved.currentCycle?.endsOn ?? "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const shown = { ...apiFieldErrors(save.error), ...errors };
  const zones = timezoneOptions();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = putGeneralBody.safeParse({ name, timezone, currentCycle: cycle });
    if (!r.success) {
      const errs: FieldErrors = {};
      for (const i of r.error.issues) {
        const k =
          i.path[0] === "currentCycle"
            ? `cycle.${String(i.path[1] ?? "range")}`
            : String(i.path[0]);
        errs[k] ??= i.message;
      }
      return setErrors(errs);
    }
    setErrors({});
    save.mutate(r.data);
  };
  const err = (k: string) => shown[k] && <p className="text-sm text-destructive">{shown[k]}</p>;

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <section className="min-w-0 space-y-4 rounded-lg border bg-card p-4" aria-label="Institution">
        <div className="space-y-1.5">
          <Label htmlFor="g-name">Institution name</Label>
          <Input
            id="g-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
          {err("name")}
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Address</p>
          <p className="font-mono text-sm text-muted-foreground">{saved.slug}.laveric.com</p>
          <p className="text-xs text-muted-foreground">
            Ask Laveric support to change it. Custom domains are under Domains.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-tz">Timezone</Label>
          <select
            id="g-tz"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-9 w-full rounded-md border bg-card px-2 text-sm"
          >
            {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Calling hours, holidays and every date in the app use it.
          </p>
          {err("timezone")}
        </div>
      </section>

      <section
        className="min-w-0 space-y-4 rounded-lg border bg-card p-4"
        aria-label="Admission cycle"
      >
        <div>
          <h2 className="text-sm font-semibold">Current admission cycle</h2>
          <p className="text-xs text-muted-foreground">
            New leads join this cycle. One lead per person per cycle.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-cycle">Name</Label>
            <Input
              id="g-cycle"
              value={cycle.name}
              onChange={(e) => setCycle({ ...cycle, name: e.target.value })}
              placeholder="2026-27"
              maxLength={7}
            />
            {err("cycle.name")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-start">Starts</Label>
            <Input
              id="g-start"
              type="date"
              value={cycle.startsOn}
              onChange={(e) => setCycle({ ...cycle, startsOn: e.target.value })}
            />
            {err("cycle.startsOn")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-end">Ends</Label>
            <Input
              id="g-end"
              type="date"
              value={cycle.endsOn}
              onChange={(e) => setCycle({ ...cycle, endsOn: e.target.value })}
            />
            {err("cycle.endsOn")}
          </div>
        </div>
        {err("cycle.range")}
      </section>

      {save.isError && Object.keys(apiFieldErrors(save.error)).length === 0 && (
        <FormAlert>{errText(save.error, "Couldn't save.")}</FormAlert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {save.isSuccess && (
          <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
