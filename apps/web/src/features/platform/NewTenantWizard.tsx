import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { CreateTenantBody, CreateTenantResponse, Plan } from "@vernacular/contracts";
import { CheckCircle2, Circle, Clock, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateTenant, usePlans } from "@/features/platform/platform-api";
import {
  checkDraft,
  emptyDraft,
  timezoneOptions,
  withName,
  type TenantDraft,
} from "@/features/platform/tenant-form";
import { formatPaise } from "@/lib/money";
import { errText } from "@/lib/seam";
import { apiFieldErrors } from "@/lib/forms";
import { cn } from "@/lib/utils";

/**
 * /platform/tenants/new (D6-I4-01): one screen of fields → review → create. Built to read as a < 10-minute job:
 * everything on one page, the slug follows the name, sensible defaults, and the result says what was set up.
 */
export function NewTenantWizard() {
  return (
    <RoleGate page="platform.newTenant">
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-5">
        <PageHeader
          area="Platform"
          title="Create tenant"
          back={{ to: "/platform/tenants", label: "Tenants" }}
          description={
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden /> About 5 minutes. Have the owner&apos;s email
              ready, and the Voice Engine Org ID / Key if they already have one.
            </span>
          }
        />
        <Loaded />
      </div>
    </RoleGate>
  );
}

function Loaded() {
  const plans = usePlans();
  const active = plans.data?.items.filter((p) => p.isActive) ?? [];
  return (
    <QueryGate
      q={plans}
      what="plans"
      service="Platform"
      empty={
        active.length === 0 && (
          <StateCard
            icon={Circle}
            title="Create a plan first"
            action={
              <Button asChild size="sm">
                <Link to="/platform/plans">Go to plans</Link>
              </Button>
            }
          >
            Every tenant needs a plan (fees, included minutes and messages).
          </StateCard>
        )
      }
    >
      <Wizard plans={active} />
    </QueryGate>
  );
}

function Wizard({ plans }: { plans: Plan[] }) {
  const create = useCreateTenant();
  const [draft, setDraft] = useState<TenantDraft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<CreateTenantBody | null>(null);
  const set = (patch: Partial<TenantDraft>) => setDraft((d) => ({ ...d, ...patch }));

  if (create.data) return <Done result={create.data} />;

  if (review) {
    const plan = plans.find((p) => p.id === review.planId);
    const serverErrors = apiFieldErrors(create.error);
    return (
      <section className="space-y-4 rounded-lg border bg-card p-4" aria-label="Review">
        <h2 className="font-semibold">Check and create</h2>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <Row k="Institution">{review.name}</Row>
          <Row k="Address">{review.slug}.laveric.com</Row>
          <Row k="Timezone">{review.timezone}</Row>
          <Row k="Plan">
            {plan ? `${plan.name} · ${formatPaise(plan.monthlyFeePaise)}/month` : "—"} ·{" "}
            <span className="capitalize">{review.billingMode}</span>
          </Row>
          <Row k="Voice Engine">
            {review.voiceEngine.mode === "create"
              ? "Create a new org automatically"
              : `Existing org ${review.voiceEngine.orgId} · key provided (stored encrypted)`}
          </Row>
          <Row k="Owner">
            {review.ownerName ? `${review.ownerName} · ` : ""}
            {review.ownerEmail} (gets an invite email)
          </Row>
        </dl>
        <p className="text-sm text-muted-foreground">
          We&apos;ll also copy the default calling policy, stages and a starter AI agent.
        </p>
        {create.isError && (
          <FormAlert>
            {Object.keys(serverErrors).length > 0
              ? Object.values(serverErrors).join(" ")
              : errText(create.error, "Couldn't create the tenant.")}
          </FormAlert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setReview(null)} disabled={create.isPending}>
            Back to edit
          </Button>
          <Button onClick={() => create.mutate(review)} disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />}
            Create tenant
          </Button>
        </div>
      </section>
    );
  }

  const next = () => {
    const r = checkDraft(draft);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    create.reset();
    setReview(r.body);
  };
  const err = (k: string) => errors[k] && <p className="text-sm text-destructive">{errors[k]}</p>;

  return (
    <form
      method="post"
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
    >
      <Fieldset legend="1. Institution">
        <div className="space-y-1.5">
          <Label htmlFor="t-name">Name</Label>
          <Input
            id="t-name"
            value={draft.name}
            onChange={(e) => setDraft((d) => withName(d, e.target.value))}
            placeholder="e.g. Demo College"
            maxLength={120}
          />
          {err("name")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-slug">Address</Label>
          <div className="flex min-w-0 items-center gap-1.5">
            <Input
              id="t-slug"
              value={draft.slug}
              onChange={(e) => set({ slug: e.target.value.toLowerCase(), slugTouched: true })}
              className="min-w-0 flex-1 font-mono"
              maxLength={40}
              aria-describedby="t-slug-hint"
            />
            <span id="t-slug-hint" className="shrink-0 text-sm text-muted-foreground">
              .laveric.com
            </span>
          </div>
          {err("slug")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-tz">Timezone</Label>
          <select
            id="t-tz"
            value={draft.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
            className="h-9 w-full rounded-md border bg-card px-2 text-sm"
          >
            {timezoneOptions().map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          {err("timezone")}
        </div>
      </Fieldset>

      <Fieldset legend="2. Plan and billing">
        <div className="space-y-1.5">
          <Label htmlFor="t-plan">Plan</Label>
          <select
            id="t-plan"
            value={draft.planId}
            onChange={(e) => {
              const p = plans.find((x) => x.id === e.target.value);
              set({ planId: e.target.value, ...(p ? { billingMode: p.billingMode } : {}) });
            }}
            className="h-9 w-full rounded-md border bg-card px-2 text-sm"
          >
            <option value="">Choose a plan…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatPaise(p.monthlyFeePaise)}/month · {p.includedMinutes} min
              </option>
            ))}
          </select>
          {err("planId")}
        </div>
        <Choice
          name="billing"
          label="Billing"
          value={draft.billingMode}
          onChange={(v) => set({ billingMode: v })}
          options={[
            ["prepaid", "Prepaid wallet", "Calls stop when the balance reaches zero."],
            ["postpaid", "Monthly + overage", "Billed after each month."],
          ]}
        />
      </Fieldset>

      <Fieldset legend="3. Voice Engine">
        <Choice
          name="voice"
          label="Voice Engine org"
          value={draft.voiceMode}
          onChange={(v) => set({ voiceMode: v })}
          options={[
            ["create", "Create a new org", "We set it up and store its key encrypted."],
            ["existing", "Use an existing org", "Paste its Voice Engine Org ID / Key."],
          ]}
        />
        {draft.voiceMode === "existing" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-org">Voice Engine Org ID</Label>
              <Input
                id="t-org"
                value={draft.voiceOrgId}
                onChange={(e) => set({ voiceOrgId: e.target.value })}
                autoComplete="off"
                maxLength={200}
              />
              {err("voice.orgId")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-key">Voice Engine Key</Label>
              <Input
                id="t-key"
                type="password"
                value={draft.voiceKey}
                onChange={(e) => set({ voiceKey: e.target.value })}
                autoComplete="off"
                maxLength={500}
              />
              {err("voice.apiKey")}
            </div>
          </div>
        )}
      </Fieldset>

      <Fieldset legend="4. Owner">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-owner-email">Owner&apos;s email</Label>
            <Input
              id="t-owner-email"
              type="email"
              value={draft.ownerEmail}
              onChange={(e) => set({ ownerEmail: e.target.value })}
              placeholder="principal@college.edu"
            />
            {err("ownerEmail")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-owner-name">Owner&apos;s name (optional)</Label>
            <Input
              id="t-owner-name"
              value={draft.ownerName}
              onChange={(e) => set({ ownerName: e.target.value })}
              maxLength={120}
            />
          </div>
        </div>
      </Fieldset>

      <Button type="submit">Review</Button>
    </form>
  );
}

function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3 rounded-lg border bg-card p-4">
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Choice<T extends string>({
  name,
  label,
  value,
  onChange,
  options,
}: {
  name: string;
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string, string][];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2">
      {options.map(([v, title, hint]) => (
        <label
          key={v}
          className={cn(
            "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm",
            value === v && "border-primary bg-accent",
          )}
        >
          <input
            type="radio"
            name={name}
            className="mt-0.5"
            checked={value === v}
            onChange={() => onChange(v)}
          />
          <span>
            <span className="font-medium">{title}</span>
            <span className="block text-xs text-muted-foreground">{hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function Done({ result: r }: { result: CreateTenantResponse }) {
  const steps: [string, boolean][] = [
    ["Tenant created", true],
    ["Calling policy copied", r.setup.policy],
    ["Stages copied", r.setup.stages],
    ["Starter AI agent added", r.setup.starterAgent],
    [`Owner invited (${r.tenant.ownerEmail ?? "—"})`, r.ownerInvited],
  ];
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" aria-label="Tenant created">
      <h2 className="flex items-center gap-2 font-semibold">
        <CheckCircle2 className="size-5 text-primary" aria-hidden /> {r.tenant.name} is ready
      </h2>
      <ul className="space-y-1.5 text-sm">
        {steps.map(([label, ok]) => (
          <li key={label} className={cn("flex items-center gap-2", !ok && "text-destructive")}>
            {ok ? (
              <CheckCircle2 className="size-4 text-primary" aria-hidden />
            ) : (
              <Circle className="size-4" aria-hidden />
            )}
            {label}
            {!ok && " — not done; finish it from the tenant's settings"}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        They sign in at <span className="font-mono">{r.tenant.slug}.laveric.com</span> once the
        owner accepts the invite.
      </p>
      <Button asChild>
        <Link to="/platform/tenants">Back to tenants</Link>
      </Button>
    </section>
  );
}
