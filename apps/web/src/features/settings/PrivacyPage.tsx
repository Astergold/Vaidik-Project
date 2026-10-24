import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { RETENTION_CHOICES, type LeadListItem, type PrivacySettings } from "@vernacular/contracts";
import { CheckCircle2, Download, Loader2, Search, UserX } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LeadPicker } from "@/features/leads/LeadPicker";
import { usePrivacy, useSavePrivacy } from "@/features/settings/settings-api";
import { apiDelete, apiGetBlob } from "@/lib/api";
import { saveBlob } from "@/lib/download";
import { formatDateTime } from "@/lib/labels";
import { errText, SEAM_META } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";

/**
 * /settings/privacy (D6-I4-02, DPDP tools from D7-I2-01): retention period, and per person a data export (JSON) or
 * erasure (PII + identifiers deleted; anonymised aggregates and billing kept). People are found with the real leads
 * search; export/erase use Appendix A's GET /api/persons/:id/export and DELETE /api/persons/:id (proposed).
 */
export function PrivacyPage() {
  return (
    <RoleGate page="settings.privacy">
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-4">
        <PageHeader
          area="Settings"
          title="Data & privacy"
          description="How long you keep personal data, and requests from students to see or delete theirs."
        />
        <Retention />
        <PersonTools />
      </div>
    </RoleGate>
  );
}

const RETENTION_LABEL = (d: number | null) =>
  d === null
    ? "Keep until erased by hand"
    : `${d / 365} year${d === 365 ? "" : "s"} after last activity`;

function Retention() {
  const q = usePrivacy();
  const save = useSavePrivacy();
  return (
    <QueryGate q={q} what="privacy settings" service="Privacy">
      {q.data && <RetentionForm key={q.dataUpdatedAt} saved={q.data} save={save} />}
    </QueryGate>
  );
}

function RetentionForm({
  saved,
  save,
}: {
  saved: PrivacySettings;
  save: ReturnType<typeof useSavePrivacy>;
}) {
  const tz = useTenantTimeZone();
  const [value, setValue] = useState<string>(
    saved.retentionDays === null ? "" : String(saved.retentionDays),
  );
  const choices = RETENTION_CHOICES.includes(
    saved.retentionDays as (typeof RETENTION_CHOICES)[number],
  )
    ? RETENTION_CHOICES
    : [...RETENTION_CHOICES, saved.retentionDays];
  return (
    <section className="min-w-0 space-y-3 rounded-lg border bg-card p-4" aria-label="Retention">
      <div className="space-y-1.5">
        <Label htmlFor="pr-retention">Delete personal data</Label>
        <select
          id="pr-retention"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 w-full rounded-md border bg-card px-2 text-sm"
        >
          {choices.map((d) => (
            <option key={String(d)} value={d === null ? "" : String(d)}>
              {RETENTION_LABEL(d)}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          A nightly job removes names, numbers and emails of leads with no activity for this long.
          Billing totals are kept.
          {saved.lastPurgeAt && ` Last run ${formatDateTime(saved.lastPurgeAt, tz)}.`}
          {saved.nextPurgeAt && ` Next run ${formatDateTime(saved.nextPurgeAt, tz)}.`}
        </p>
      </div>
      {save.isError && <FormAlert>{errText(save.error, "Couldn't save.")}</FormAlert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() => save.mutate({ retentionDays: value === "" ? null : Number(value) })}
        >
          {save.isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {save.isSuccess && (
          <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" /> Saved
          </span>
        )}
      </div>
    </section>
  );
}

function PersonTools() {
  const [picking, setPicking] = useState(false);
  const [lead, setLead] = useState<LeadListItem | null>(null);
  const [typed, setTyped] = useState("");
  const name = lead?.person.fullName ?? "";
  const exportData = useMutation({
    mutationFn: async (l: LeadListItem) => {
      const blob = await apiGetBlob(`/api/persons/${l.person.id}/export`);
      saveBlob(blob, `person-${l.person.id}.json`);
    },
    meta: SEAM_META,
  });
  const erase = useMutation({
    mutationFn: (l: LeadListItem) => apiDelete(`/api/persons/${l.person.id}`),
    meta: SEAM_META,
  });
  const choose = (l: LeadListItem) => {
    setLead(l);
    setTyped("");
    exportData.reset();
    erase.reset();
    setPicking(false);
  };
  // Erasure needs the exact name typed (or "ERASE" when the person has no name on record).
  const confirmWord = name || "ERASE";

  return (
    <section
      className="min-w-0 space-y-3 rounded-lg border bg-card p-4"
      aria-label="Person requests"
    >
      <div>
        <h2 className="text-sm font-semibold">A student asks for their data</h2>
        <p className="text-xs text-muted-foreground">
          Find the person, then export everything we hold or erase it. Both are audit-logged.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
        <Search /> {lead ? "Choose someone else" : "Find a person"}
      </Button>
      {lead && !erase.isSuccess && (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm">
            <span className="font-medium">{name || "Unnamed person"}</span>
            {lead.person.phone && (
              <span className="text-muted-foreground"> · {lead.person.phone}</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={exportData.isPending}
              onClick={() => exportData.mutate(lead)}
            >
              {exportData.isPending ? <Loader2 className="animate-spin" /> : <Download />}
              Export data (JSON)
            </Button>
          </div>
          {exportData.isError && (
            <FormAlert>{errText(exportData.error, "Couldn't export.")}</FormAlert>
          )}
          {exportData.isSuccess && (
            <p role="status" className="text-sm text-muted-foreground">
              Export downloaded.
            </p>
          )}
          <div className="space-y-1.5 border-t pt-3">
            <Label htmlFor="pr-confirm" className="text-destructive">
              Erase this person — type <span className="font-mono">{confirmWord}</span> to confirm
            </Label>
            <Input
              id="pr-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Deletes their name, phone numbers, emails, notes and recordings. Call counts and
              billing stay, anonymised. This can&apos;t be undone.
            </p>
            {erase.isError && <FormAlert>{errText(erase.error, "Couldn't erase.")}</FormAlert>}
            <Button
              size="sm"
              variant="destructive"
              disabled={typed !== confirmWord || erase.isPending}
              onClick={() => erase.mutate(lead)}
            >
              {erase.isPending ? <Loader2 className="animate-spin" /> : <UserX />}
              Erase permanently
            </Button>
          </div>
        </div>
      )}
      {erase.isSuccess && (
        <p role="status" className="flex items-center gap-1 text-sm">
          <CheckCircle2 className="size-4" /> Personal data erased.
        </p>
      )}
      {picking && (
        <LeadPicker
          open={picking}
          onOpenChange={setPicking}
          title="Find a person"
          description="Search by name, phone digits or email."
          confirmLabel="Choose"
          pending={false}
          error={null}
          onConfirm={choose}
        />
      )}
    </section>
  );
}
