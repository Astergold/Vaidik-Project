import { useState, type FormEvent } from "react";
import {
  API_KEY_SCOPES,
  createApiKeyBody,
  type ApiKey,
  type ApiKeyScope,
  type CreateApiKeyResponse,
} from "@vernacular/contracts";
import { KeyRound, Loader2, Plus } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { QueryGate } from "@/components/QueryGate";
import { SecretReveal } from "@/components/SecretReveal";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from "@/features/integrations/integrations-api";
import { formatDate, formatDateTime } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";

/** API keys for the public /v1 API (D5-I4-03): list, create (secret shown once), revoke. */
export const SCOPE_LABEL: Record<ApiKeyScope, string> = {
  "leads:read": "Read leads",
  "leads:write": "Create and update leads",
  "applications:write": "Update applications",
  "calls:read": "Read calls",
  "webhooks:manage": "Manage webhooks",
};

export function ApiKeysSection() {
  const q = useApiKeys();
  const [creating, setCreating] = useState(false);
  const items = q.data?.items ?? [];
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="api-keys-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="api-keys-heading" className="text-lg font-semibold">
            API keys
          </h2>
          <p className="text-sm text-muted-foreground">
            For your ERP or scripts calling the public API. Each key has only the scopes you pick.
          </p>
        </div>
        {q.isSuccess && items.length > 0 && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> New key
          </Button>
        )}
      </div>
      <QueryGate
        q={q}
        what="API keys"
        service="API key"
        empty={
          items.length === 0 && (
            <StateCard
              icon={KeyRound}
              title="No API keys yet"
              action={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus /> New key
                </Button>
              }
            >
              Create one for each system that connects, so you can revoke them separately.
            </StateCard>
          )
        }
      >
        <div className="max-w-full overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((k) => (
                <KeyRow key={k.id} apiKey={k} />
              ))}
            </TableBody>
          </Table>
        </div>
      </QueryGate>
      {creating && <CreateKeyDialog onClose={() => setCreating(false)} />}
    </section>
  );
}

function KeyRow({ apiKey: k }: { apiKey: ApiKey }) {
  const tz = useTenantTimeZone();
  const revoke = useRevokeApiKey(k.id);
  const [confirming, setConfirming] = useState(false);
  const revoked = k.revokedAt !== null;
  return (
    <TableRow className={revoked ? "text-muted-foreground" : undefined}>
      <TableCell className="min-w-32">
        <p className="font-medium">{k.name}</p>
        <p className="text-xs text-muted-foreground">
          Created {formatDate(k.createdAt, tz)}
          {k.createdBy && ` by ${k.createdBy}`}
        </p>
      </TableCell>
      <TableCell className="font-mono text-xs whitespace-nowrap">{k.prefix}…</TableCell>
      <TableCell className="min-w-48">
        <ul className="flex flex-wrap gap-1" aria-label={`Scopes of ${k.name}`}>
          {k.scopes.map((s) => (
            <li key={s}>
              <Badge variant="outline" className="font-mono" title={SCOPE_LABEL[s]}>
                {s}
              </Badge>
            </li>
          ))}
        </ul>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {k.lastUsedAt ? formatDateTime(k.lastUsedAt, tz) : "Never"}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {revoked ? (
          <Badge variant="outline">Revoked {formatDate(k.revokedAt!, tz)}</Badge>
        ) : confirming ? (
          <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
            <span className="text-xs">Stops working immediately.</span>
            <Button
              size="xs"
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate()}
            >
              {revoke.isPending && <Loader2 className="animate-spin" />}
              Revoke key
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={revoke.isPending}
            >
              Cancel
            </Button>
          </span>
        ) : (
          <Button size="xs" variant="outline" onClick={() => setConfirming(true)}>
            Revoke
          </Button>
        )}
        {revoke.isError && (
          <p className="mt-1 text-xs text-destructive">
            {errText(revoke.error, "Couldn't revoke.")}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

function CreateKeyDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateApiKey();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The plaintext key lives only here, for this one render of the reveal.
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = createApiKeyBody.safeParse({ name, scopes });
    if (!r.success)
      return setErrors(
        Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
    setErrors({});
    create.mutate(r.data, { onSuccess: setCreated });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !created && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{created ? "Your new API key" : "New API key"}</DialogTitle>
        <DialogDescription>
          {created
            ? `${created.key.name} · ${created.key.scopes.join(", ")}`
            : "Name it after the system that will use it."}
        </DialogDescription>
        {created ? (
          <SecretReveal
            noun="API key"
            lostHint="If it's lost, revoke it and create a new one."
            fields={[
              {
                id: "api-key-secret",
                label: "API key (send as Authorization: Bearer …)",
                value: created.secret,
              },
            ]}
            onDone={onClose}
          />
        ) : (
          <form noValidate onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="e.g. ERP sync"
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Scopes</legend>
              {API_KEY_SCOPES.map((s) => (
                <label key={s} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={scopes.includes(s)}
                    onChange={(e) =>
                      setScopes(
                        e.target.checked
                          ? API_KEY_SCOPES.filter((x) => x === s || scopes.includes(x))
                          : scopes.filter((x) => x !== s),
                      )
                    }
                  />
                  <span>
                    <span className="font-mono text-xs">{s}</span>
                    <span className="block text-xs text-muted-foreground">{SCOPE_LABEL[s]}</span>
                  </span>
                </label>
              ))}
              {errors.scopes && <p className="text-sm text-destructive">{errors.scopes}</p>}
            </fieldset>
            {create.isError && (
              <FormAlert>{errText(create.error, "Couldn't create the key.")}</FormAlert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="animate-spin" />}
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
