import { useState, type FormEvent } from "react";
import { addDomainBody, type TenantDomain } from "@vernacular/contracts";
import { Globe, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { CopyField } from "@/components/SecretReveal";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDomainMutations, useDomains } from "@/features/settings/branding-api";
import { formatDateTime } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";

/**
 * /settings/domains (D6-I4-02): add a custom hostname, follow the CNAME + TXT instructions, verify, see TLS, remove.
 * Certificates are only issued for verified domains (Caddy on-demand TLS asks the API).
 */
export function DomainsPage() {
  return (
    <RoleGate page="settings.domains">
      <div className="mx-auto w-full max-w-4xl min-w-0 space-y-4">
        <PageHeader
          area="Settings"
          title="Domains"
          description="Serve the app on your own address, e.g. admissions.college.edu. HTTPS is set up automatically once it's verified."
        />
        <Loaded />
      </div>
    </RoleGate>
  );
}

function Loaded() {
  const q = useDomains();
  const m = useDomainMutations();
  const items = q.data?.items ?? [];
  return (
    <QueryGate q={q} what="domains" service="Domains">
      <AddDomain m={m} />
      {items.length === 0 ? (
        <StateCard icon={Globe} title="No custom domain yet">
          Until you add one, your team signs in at your laveric.com address.
        </StateCard>
      ) : (
        <ul className="space-y-3">
          {items.map((d) => (
            <li key={d.id}>
              <DomainCard domain={d} m={m} />
            </li>
          ))}
        </ul>
      )}
    </QueryGate>
  );
}

type M = ReturnType<typeof useDomainMutations>;

function AddDomain({ m }: { m: M }) {
  const [hostname, setHostname] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = addDomainBody.safeParse({ hostname });
    if (!r.success) return setProblem(r.error.issues[0]?.message ?? "Check the hostname");
    setProblem(null);
    m.add.mutate(r.data.hostname, { onSuccess: () => setHostname("") });
  };
  return (
    <form
      noValidate
      onSubmit={submit}
      className="min-w-0 space-y-2 rounded-lg border bg-card p-4"
      aria-label="Add a domain"
    >
      <Label htmlFor="d-host">Add a domain</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="d-host"
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          placeholder="admissions.college.edu"
          className="min-w-0 flex-1 basis-56 font-mono"
          inputMode="url"
          maxLength={253}
        />
        <Button type="submit" disabled={m.add.isPending}>
          {m.add.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          Add domain
        </Button>
      </div>
      {problem && <p className="text-sm text-destructive">{problem}</p>}
      {m.add.isError && <FormAlert>{errText(m.add.error, "Couldn't add the domain.")}</FormAlert>}
    </form>
  );
}

const TLS_LABEL = {
  pending: "Certificate pending",
  issued: "HTTPS active",
  failed: "Certificate failed",
} as const;

function DomainCard({ domain: d, m }: { domain: TenantDomain; m: M }) {
  const tz = useTenantTimeZone();
  const [confirming, setConfirming] = useState(false);
  const verified = d.verifiedAt !== null;
  const verifying = m.verify.isPending && m.verify.variables === d.id;
  const removing = m.remove.isPending && m.remove.variables === d.id;
  return (
    <article className="min-w-0 space-y-3 rounded-lg border bg-card p-4" aria-label={d.hostname}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-mono font-semibold break-all">{d.hostname}</h2>
          <p className="text-xs text-muted-foreground">
            {d.lastCheckedAt
              ? `Last checked ${formatDateTime(d.lastCheckedAt, tz)}`
              : "Not checked yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={verified ? "default" : "outline"}>
            {verified ? "Verified" : "Not verified"}
          </Badge>
          <Badge
            variant={
              d.tlsStatus === "issued"
                ? "secondary"
                : d.tlsStatus === "failed"
                  ? "destructive"
                  : "outline"
            }
          >
            {d.tlsStatus === "issued" && <ShieldCheck />}
            {TLS_LABEL[d.tlsStatus]}
          </Badge>
        </div>
      </div>
      {d.lastError && !verified && (
        <p role="alert" className="text-sm text-destructive">
          {d.lastError}
        </p>
      )}
      {!verified && (
        <div className="space-y-3">
          <p className="text-sm">
            Add these two records at your DNS provider, then press Verify. DNS can take up to an
            hour.
          </p>
          <ol className="space-y-3 text-sm">
            <li className="space-y-1.5">
              <p className="font-medium">1. CNAME — points your address at us</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <CopyField id={`cname-host-${d.id}`} label="Name / host" value={d.hostname} />
                <CopyField
                  id={`cname-value-${d.id}`}
                  label="Value / target"
                  value={d.cnameTarget}
                />
              </div>
            </li>
            <li className="space-y-1.5">
              <p className="font-medium">2. TXT — proves the domain is yours</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <CopyField id={`txt-host-${d.id}`} label="Name / host" value={d.txtName} />
                <CopyField id={`txt-value-${d.id}`} label="Value" value={d.verificationToken} />
              </div>
            </li>
          </ol>
        </div>
      )}
      {(m.verify.isError && m.verify.variables === d.id) ||
      (m.remove.isError && m.remove.variables === d.id) ? (
        <FormAlert>{errText(m.verify.error ?? m.remove.error, "That didn't work.")}</FormAlert>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {!verified && (
          <Button size="sm" onClick={() => m.verify.mutate(d.id)} disabled={verifying}>
            {verifying ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Verify now
          </Button>
        )}
        {confirming ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
            Remove {d.hostname}? People using it will need your laveric.com address.
            <Button
              size="sm"
              variant="destructive"
              onClick={() => m.remove.mutate(d.id)}
              disabled={removing}
            >
              {removing && <Loader2 className="animate-spin" />}
              Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            <Trash2 /> Remove
          </Button>
        )}
      </div>
    </article>
  );
}
