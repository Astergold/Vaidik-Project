import { useState, type FormEvent } from "react";
import { putCallingPlatformBody } from "@vernacular/contracts";
import { CheckCircle2, Loader2, PhoneCall, Unplug } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { StateCard } from "@/components/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCallingPlatform,
  useConnectCallingPlatform,
  useDisconnectCallingPlatform,
} from "@/features/integrations/integrations-api";
import { formatDateTime } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";

/**
 * Calling platform connection: the institution's own API key for the voice platform that places AI calls and runs
 * campaigns. Write-only: the key is sent once, checked by the server, and only its last 4 characters come back.
 */
export function CallingPlatformSection() {
  const tz = useTenantTimeZone();
  const q = useCallingPlatform();
  const connect = useConnectCallingPlatform();
  const disconnect = useDisconnectCallingPlatform();
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = putCallingPlatformBody.safeParse({ apiKey: key });
    if (!r.success) return setFieldError(r.error.issues[0]?.message ?? "Paste the full API key");
    setFieldError(null);
    connect.mutate(r.data.apiKey, {
      onSuccess: () => {
        setKey(""); // never keep the key around after it is saved
        setEditing(false);
      },
    });
  };

  const s = q.data;
  const showForm = s ? !s.connected || editing : false;
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="calling-platform-heading">
      <div>
        <h2 id="calling-platform-heading" className="text-lg font-semibold">
          Calling platform
        </h2>
        <p className="text-sm text-muted-foreground">
          The voice platform that places your AI calls and runs your campaigns. Paste the API key
          from its Settings → API Keys page.
        </p>
      </div>

      {q.isPending ? (
        <Skeleton className="h-24 w-full" aria-busy="true" aria-label="Loading calling platform" />
      ) : q.isError ? (
        <StateCard
          icon={Unplug}
          title="Couldn't load the connection"
          tone="error"
          action={
            <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
              Try again
            </Button>
          }
        >
          {errText(q.error, "Please try again.")}
        </StateCard>
      ) : (
        <div className="space-y-4 rounded-lg border bg-card p-4">
          {s?.connected ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">Connected</p>
                  <p className="text-muted-foreground">
                    Key ending <span className="font-mono">…{s.keyLast4}</span>
                    {s.updatedAt && ` · saved ${formatDateTime(s.updatedAt, tz)}`}
                    {s.workflowCount !== null &&
                      ` · ${s.workflowCount} workflow${s.workflowCount === 1 ? "" : "s"} available`}
                  </p>
                </div>
              </div>
              {!editing && !confirmOff && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => setEditing(true)}
                  >
                    Replace key
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => setConfirmOff(true)}
                  >
                    Disconnect
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm">
              <PhoneCall className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-muted-foreground">
                Not connected. AI calls and campaigns can&apos;t run until a key is saved.
              </p>
            </div>
          )}

          {confirmOff && (
            <div
              role="alertdialog"
              aria-label="Disconnect the calling platform?"
              className="space-y-3 rounded-md border border-destructive/40 p-3"
            >
              <p className="text-sm">
                Disconnect? New AI calls and campaign waves will stop until a key is saved again.
                Calls already placed finish normally.
              </p>
              {disconnect.isError && (
                <FormAlert>{errText(disconnect.error, "Couldn't disconnect.")}</FormAlert>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  className="min-h-11 sm:min-h-9"
                  disabled={disconnect.isPending}
                  onClick={() =>
                    disconnect.mutate(undefined, { onSuccess: () => setConfirmOff(false) })
                  }
                >
                  {disconnect.isPending && <Loader2 className="animate-spin" />}
                  Disconnect
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 sm:min-h-9"
                  onClick={() => setConfirmOff(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {showForm && (
            <form method="post" noValidate onSubmit={submit} className="space-y-2">
              <Label htmlFor="calling-platform-key">
                {s?.connected ? "New API key" : "API key"}
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="calling-platform-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  aria-invalid={fieldError ? true : undefined}
                  className="min-h-11 sm:min-h-9"
                />
                <Button type="submit" className="min-h-11 sm:min-h-9" disabled={connect.isPending}>
                  {connect.isPending && <Loader2 className="animate-spin" />}
                  {s?.connected ? "Save new key" : "Connect"}
                </Button>
                {s?.connected && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => {
                      setEditing(false);
                      setKey("");
                      setFieldError(null);
                      connect.reset();
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                The key is checked with the platform before it is saved, stored encrypted, and never
                shown again.
              </p>
              {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
              {connect.isError && (
                <FormAlert>{errText(connect.error, "Couldn't save the key.")}</FormAlert>
              )}
            </form>
          )}
        </div>
      )}
    </section>
  );
}
