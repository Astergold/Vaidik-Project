import { useState, type FormEvent } from "react";
import { SOURCE_KINDS, type LeadSource } from "@vernacular/contracts";
import { Field, FormAlert, SubmitButton } from "@/components/auth/AuthParts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCreateSource, useRotateToken } from "@/features/lead-sources/sources-api";
import { TokenReveal } from "@/features/lead-sources/TokenReveal";
import { ApiCallError } from "@/lib/api";
import { apiFieldErrors, type FieldErrors } from "@/lib/forms";

export const KIND_LABEL: Record<(typeof SOURCE_KINDS)[number], string> = {
  form: "Website form",
  aggregator: "Lead aggregator",
  meta: "Meta lead ads",
  google: "Google lead form",
  csv: "CSV import",
  erp: "ERP / portal",
  inbound_call: "Inbound call",
  whatsapp: "WhatsApp",
  manual: "Manual",
};

/** New source → its endpoint URL + token, shown once. Closing the reveal drops the token for good. */
export function CreateSourceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const create = useCreateSource();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [revealed, setRevealed] = useState<{ endpointUrl: string; token: string } | null>(null);

  const close = () => {
    setRevealed(null); // the token is gone after this
    setErrors({});
    create.reset();
    onOpenChange(false);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return setErrors({ name: "Give the source a name" });
    setErrors({});
    create.mutate(
      {
        name,
        kind: SOURCE_KINDS.find((k) => k === f.get("kind")) ?? "form",
        autoDial: f.get("autoDial") === "on",
      },
      {
        onSuccess: (s) => setRevealed({ endpointUrl: s.endpointUrl, token: s.token }),
        onError: (err) => {
          const fields = apiFieldErrors(err);
          setErrors(
            Object.keys(fields).length
              ? fields
              : { form: err instanceof ApiCallError ? err.message : "Couldn't create the source" },
          );
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(o) : revealed ? undefined : close())}
    >
      <DialogContent
        className="sm:max-w-lg"
        onInteractOutside={(e) => revealed && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{revealed ? "Source created" : "New lead source"}</DialogTitle>
          <DialogDescription>
            {revealed
              ? "Give the provider this URL and token."
              : "A web form, aggregator or other system that sends us leads."}
          </DialogDescription>
        </DialogHeader>
        {revealed ? (
          <TokenReveal endpointUrl={revealed.endpointUrl} token={revealed.token} onDone={close} />
        ) : (
          <form noValidate onSubmit={onSubmit} className="space-y-4">
            {errors.form && <FormAlert>{errors.form}</FormAlert>}
            <Field
              name="name"
              label="Name"
              placeholder="e.g. Website admissions form"
              maxLength={100}
              autoFocus
              error={errors.name}
            />
            <div className="space-y-1.5">
              <Label htmlFor="kind">Type</Label>
              <select
                id="kind"
                name="kind"
                defaultValue="form"
                className="h-9 w-full rounded-md border bg-card px-2 text-sm"
              >
                {SOURCE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="autoDial" defaultChecked className="mt-1" />
              <span>
                Call new leads automatically
                <span className="block text-xs text-muted-foreground">
                  The AI agent calls each new lead, within calling hours and consent rules.
                </span>
              </span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <div>
                <SubmitButton pending={create.isPending}>Create source</SubmitButton>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Rotate: confirm (the old token stops working immediately), then show the new token once. */
export function RotateTokenDialog({
  source,
  open,
  onOpenChange,
}: {
  source: LeadSource;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const rotate = useRotateToken(source.id);
  const [token, setToken] = useState<string | null>(null);
  const close = () => {
    setToken(null);
    rotate.reset();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : token ? undefined : close())}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => token && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{token ? "New token" : `Rotate token for "${source.name}"?`}</DialogTitle>
          <DialogDescription>
            {token
              ? "Update the provider with this token."
              : "The current token stops working immediately. Leads sent with it will be rejected until the provider uses the new one."}
          </DialogDescription>
        </DialogHeader>
        {token ? (
          <TokenReveal endpointUrl={source.endpointUrl} token={token} onDone={close} />
        ) : (
          <>
            {rotate.isError && (
              <FormAlert>
                {rotate.error instanceof ApiCallError
                  ? rotate.error.message
                  : "Couldn't rotate the token"}
              </FormAlert>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={rotate.isPending}
                onClick={() => rotate.mutate(undefined, { onSuccess: (r) => setToken(r.token) })}
              >
                Rotate token
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
