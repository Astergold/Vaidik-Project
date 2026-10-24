import { useState, type FormEvent } from "react";
import { putEmailBody, type EmailSettings } from "@vernacular/contracts";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { CopyField } from "@/components/SecretReveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEmailMutations, useEmailSettings } from "@/features/settings/settings-api";
import { formatDateTime } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";

/** /settings/email (D6-I4-02): sender name/address and the DKIM/SPF records that let us send as your domain. */
export function EmailPage() {
  return (
    <RoleGate page="settings.email">
      <div className="mx-auto w-full max-w-4xl min-w-0 space-y-4">
        <PageHeader
          area="Settings"
          title="Email sender"
          description="Invites, reminders and the daily digest are sent from this address once your domain is verified."
        />
        <Loaded />
      </div>
    </RoleGate>
  );
}

function Loaded() {
  const q = useEmailSettings();
  const m = useEmailMutations();
  return (
    <QueryGate q={q} what="email settings" service="Email">
      {q.data && <EmailForm key={q.dataUpdatedAt} saved={q.data} m={m} />}
    </QueryGate>
  );
}

const STATUS = { pending: "outline", verified: "secondary", failed: "destructive" } as const;

function EmailForm({
  saved,
  m,
}: {
  saved: EmailSettings;
  m: ReturnType<typeof useEmailMutations>;
}) {
  const tz = useTenantTimeZone();
  const [fromName, setFromName] = useState(saved.fromName ?? "");
  const [fromAddress, setFromAddress] = useState(saved.fromAddress ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = putEmailBody.safeParse({ fromName, fromAddress: fromAddress.trim().toLowerCase() });
    if (!r.success)
      return setErrors(
        Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
    setErrors({});
    m.save.mutate(r.data);
  };
  const d = saved.domain;
  return (
    <>
      <form
        noValidate
        onSubmit={submit}
        className="min-w-0 space-y-4 rounded-lg border bg-card p-4"
        aria-label="Sender"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="e-name">Sender name</Label>
            <Input
              id="e-name"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              maxLength={100}
              placeholder="MIT-ADT Admissions"
            />
            {errors.fromName && <p className="text-sm text-destructive">{errors.fromName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-address">Sender address</Label>
            <Input
              id="e-address"
              type="email"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="admissions@college.edu"
            />
            {errors.fromAddress && <p className="text-sm text-destructive">{errors.fromAddress}</p>}
          </div>
        </div>
        {m.save.isError && (
          <FormAlert>{errText(m.save.error, "Couldn't save the sender.")}</FormAlert>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={m.save.isPending}>
            {m.save.isPending && <Loader2 className="animate-spin" />}
            Save sender
          </Button>
          {m.save.isSuccess && (
            <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4" /> Saved
            </span>
          )}
        </div>
      </form>

      {d ? (
        <section
          className="min-w-0 space-y-3 rounded-lg border bg-card p-4"
          aria-label="Domain records"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold break-all">{d.name}</h2>
              <p className="text-xs text-muted-foreground">
                {d.lastCheckedAt
                  ? `Last checked ${formatDateTime(d.lastCheckedAt, tz)}`
                  : "Not checked yet"}
              </p>
            </div>
            <Badge variant={STATUS[d.status]} className="capitalize">
              {d.status}
            </Badge>
          </div>
          {d.status !== "verified" && (
            <p className="text-sm">
              Add these records at your DNS provider, then press Check again.
            </p>
          )}
          <ul className="space-y-3">
            {d.records.map((r, i) => (
              <li key={`${r.type}-${r.host}`} className="space-y-1.5 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium">{r.type}</span>
                  <Badge variant={STATUS[r.status]} className="capitalize">
                    {r.status}
                  </Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CopyField id={`rec-host-${i}`} label="Name / host" value={r.host} />
                  <CopyField id={`rec-value-${i}`} label="Value" value={r.value} />
                </div>
              </li>
            ))}
          </ul>
          {m.verify.isError && (
            <FormAlert>{errText(m.verify.error, "Couldn't check the records.")}</FormAlert>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => m.verify.mutate()}
            disabled={m.verify.isPending}
          >
            {m.verify.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Check again
          </Button>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Save a sender address to see the DNS records for its domain.
        </p>
      )}
    </>
  );
}
