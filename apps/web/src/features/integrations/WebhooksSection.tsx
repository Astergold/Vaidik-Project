import { useState, type FormEvent } from "react";
import {
  createWebhookBody,
  WEBHOOK_EVENTS,
  type CreateWebhookResponse,
  type Webhook,
  type WebhookEvent,
} from "@vernacular/contracts";
import {
  AlertTriangle,
  History,
  Loader2,
  Plus,
  Send,
  Trash2,
  Webhook as WebhookIcon,
} from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { QueryGate } from "@/components/QueryGate";
import { SecretReveal } from "@/components/SecretReveal";
import { StateCard } from "@/components/StateCard";
import { Switch } from "@/components/Switch";
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
import { DeliveryLog } from "@/features/integrations/DeliveryLog";
import {
  useCreateWebhook,
  useDeleteWebhook,
  usePatchWebhook,
  useTestWebhook,
  useWebhooks,
} from "@/features/integrations/integrations-api";
import {
  deliverySummary,
  EVENT_LABEL,
  SIGNATURE_EXAMPLE,
  toggleEvent,
} from "@/features/integrations/webhook-form";
import { formatDateTime } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

/** Outbound webhooks (D5-I4-03): subscribe, test, read the delivery log, replay, re-enable. */
export function WebhooksSection() {
  const q = useWebhooks();
  const [adding, setAdding] = useState(false);
  const items = q.data?.items ?? [];
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="webhooks-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="webhooks-heading" className="text-lg font-semibold">
            Webhooks
          </h2>
          <p className="text-sm text-muted-foreground">
            We POST a signed JSON message to your URL when an event happens, and retry if it fails.
          </p>
        </div>
        {q.isSuccess && items.length > 0 && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add webhook
          </Button>
        )}
      </div>
      <QueryGate
        q={q}
        what="webhooks"
        service="Webhook"
        empty={
          items.length === 0 && (
            <StateCard
              icon={WebhookIcon}
              title="No webhooks yet"
              action={
                <Button size="sm" onClick={() => setAdding(true)}>
                  <Plus /> Add webhook
                </Button>
              }
            >
              Add your system&apos;s URL and choose which events it should hear about.
            </StateCard>
          )
        }
      >
        <ul className="space-y-3">
          {items.map((w) => (
            <li key={w.id}>
              <WebhookCard webhook={w} />
            </li>
          ))}
        </ul>
      </QueryGate>
      {adding && <AddWebhookDialog onClose={() => setAdding(false)} />}
    </section>
  );
}

function WebhookCard({ webhook: w }: { webhook: Webhook }) {
  const tz = useTenantTimeZone();
  const patch = usePatchWebhook(w.id);
  const test = useTestWebhook(w.id);
  const del = useDeleteWebhook(w.id);
  const [logOpen, setLogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const autoDisabled = !w.isActive && w.disabledReason === "auto_failing";
  return (
    <article
      aria-label={w.url}
      className={cn(
        "min-w-0 space-y-3 rounded-lg border bg-card p-4",
        autoDisabled && "border-destructive/50",
      )}
    >
      {autoDisabled && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
        >
          <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0 flex-1">
            Turned off automatically after 24 hours of failed deliveries
            {w.disabledAt && ` (${formatDateTime(w.disabledAt, tz)})`}. Fix the endpoint, send a
            test, then re-enable.
          </span>
          <Button
            size="xs"
            variant="outline"
            disabled={patch.isPending}
            onClick={() => patch.mutate({ isActive: true })}
          >
            Re-enable
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-mono text-sm font-medium break-all">{w.url}</h3>
          <p className="text-xs text-muted-foreground">
            {w.lastDeliveryAt
              ? `Last delivery ${formatDateTime(w.lastDeliveryAt, tz)}${w.lastStatusCode !== null ? ` · HTTP ${w.lastStatusCode}` : ""}`
              : "No deliveries yet"}
            {w.failingSince && ` · failing since ${formatDateTime(w.failingSince, tz)}`}
          </p>
        </div>
        {!autoDisabled && (
          <Switch
            checked={w.isActive}
            disabled={patch.isPending}
            onChange={(isActive) => patch.mutate({ isActive })}
            label={`Webhook ${w.url} active`}
            onText="Active"
            offText="Off"
          />
        )}
      </div>
      <ul className="flex flex-wrap gap-1" aria-label={`Events for ${w.url}`}>
        {w.events.map((e) => (
          <li key={e}>
            <Badge variant="outline" className="font-mono" title={EVENT_LABEL[e]}>
              {e}
            </Badge>
          </li>
        ))}
      </ul>
      {test.data && (
        <p
          role="status"
          className={cn(
            "text-sm",
            test.data.status === "succeeded" ? "text-foreground" : "text-destructive",
          )}
        >
          Test {test.data.status === "succeeded" ? "delivered" : test.data.status}:{" "}
          {deliverySummary(test.data)}
        </p>
      )}
      {[patch, test, del].map((m, i) =>
        m.isError ? (
          <p key={i} className="text-sm text-destructive">
            {errText(m.error, "That didn't work.")}
          </p>
        ) : null,
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? <Loader2 className="animate-spin" /> : <Send />}
          Send test
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
          <History /> Delivery log
        </Button>
        {confirmDelete ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
            Delete this webhook?
            <Button
              size="sm"
              variant="destructive"
              disabled={del.isPending}
              onClick={() => del.mutate()}
            >
              {del.isPending && <Loader2 className="animate-spin" />}
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete
          </Button>
        )}
      </div>
      {logOpen && <DeliveryLog webhook={w} onClose={() => setLogOpen(false)} />}
    </article>
  );
}

function AddWebhookDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateWebhook();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The signing secret lives only here, for the reveal.
  const [created, setCreated] = useState<CreateWebhookResponse | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = createWebhookBody.safeParse({ url: url.trim(), events });
    if (!r.success)
      return setErrors(
        Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
    setErrors({});
    create.mutate(r.data, { onSuccess: setCreated });
  };
  const all = events.length === WEBHOOK_EVENTS.length;
  return (
    <Dialog open onOpenChange={(o) => !o && !created && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{created ? "Webhook added" : "Add a webhook"}</DialogTitle>
        <DialogDescription className="break-all">
          {created
            ? created.webhook.url
            : "We sign every delivery so your system can check it came from us."}
        </DialogDescription>
        {created ? (
          <SecretReveal
            noun="signing secret"
            lostHint="If it's lost, delete the webhook and add it again."
            fields={[{ id: "webhook-secret", label: "Signing secret", value: created.secret }]}
            example={{ label: "How to verify a delivery", code: SIGNATURE_EXAMPLE }}
            onDone={onClose}
          />
        ) : (
          <form noValidate onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input
                id="webhook-url"
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://erp.example.edu/hooks/vernacular"
                maxLength={2000}
              />
              {errors.url && <p className="text-sm text-destructive">{errors.url}</p>}
            </div>
            <fieldset className="space-y-2">
              <legend className="flex w-full items-center justify-between text-sm font-medium">
                Events
                <button
                  type="button"
                  className="text-xs font-normal text-primary hover:underline"
                  onClick={() => setEvents(all ? [] : [...WEBHOOK_EVENTS])}
                >
                  {all ? "Clear all" : "Select all"}
                </button>
              </legend>
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={events.includes(ev)}
                    onChange={(e) => setEvents(toggleEvent(events, ev, e.target.checked))}
                  />
                  <span>
                    <span className="font-mono text-xs">{ev}</span>
                    <span className="block text-xs text-muted-foreground">{EVENT_LABEL[ev]}</span>
                  </span>
                </label>
              ))}
              {errors.events && <p className="text-sm text-destructive">{errors.events}</p>}
            </fieldset>
            {create.isError && (
              <FormAlert>{errText(create.error, "Couldn't add the webhook.")}</FormAlert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="animate-spin" />}
                Add webhook
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
