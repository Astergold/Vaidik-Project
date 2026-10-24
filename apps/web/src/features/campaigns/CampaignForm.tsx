import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { CORE_STAGES, TEMPERATURES, type CreateCampaignBody } from "@vernacular/contracts";
import { ApiCallError } from "@/lib/api";
import { ChevronDown, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMatchCount, usePlatformOptions } from "@/features/campaigns/campaigns-api";
import { validateCampaignForm, type CampaignFormValues } from "@/features/campaigns/campaign-logic";
import {
  EntityFilter,
  MultiFilter,
  optionsStateFor,
  useLeadFilterOptions,
} from "@/features/leads/LeadFilters";
import type { FieldErrors } from "@/lib/forms";
import { formatCount, STAGE_LABEL, TEMPERATURE_LABEL } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";

const DAYS: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
];

/**
 * Create / edit form (D3-I4-04). The ONLY place campaigns are created: the server mirrors each one to the calling
 * platform. Workflow + telephony configuration + defaults come live from GET /api/campaigns/platform-options; the lead
 * filter reuses the Leads list's filter components (one vocabulary). Validation mirrors the API.
 */
export function CampaignForm({
  initial,
  submitLabel,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: {
  initial: CampaignFormValues;
  submitLabel: string;
  pending: boolean;
  serverError: ReactNode;
  onSubmit: (body: CreateCampaignBody) => void;
  onCancel: () => void;
}) {
  const tz = useTenantTimeZone();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const options = useLeadFilterOptions();
  const platform = usePlatformOptions();
  const match = useMatchCount(v.filter);
  const [advanced, setAdvanced] = useState(false);
  // New campaigns start from the platform's retry defaults (same values its own form shows).
  const defaults = platform.data?.defaults;
  useEffect(() => {
    if (!defaults || initial.workflowId) return;
    setV((cur) => ({
      ...cur,
      retryEnabled: defaults.retry.enabled,
      maxRetries: String(defaults.retry.maxRetries),
      retryDelaySeconds: String(defaults.retry.retryDelaySeconds),
      retryOnBusy: defaults.retry.onBusy,
      retryOnNoAnswer: defaults.retry.onNoAnswer,
      retryOnVoicemail: defaults.retry.onVoicemail,
    }));
  }, [defaults, initial.workflowId]);
  const set = <K extends keyof CampaignFormValues>(k: K, value: CampaignFormValues[K]) =>
    setV((cur) => ({ ...cur, [k]: value }));
  const setFilter = (patch: Partial<CampaignFormValues["filter"]>) =>
    setV((cur) => {
      const filter = { ...cur.filter, ...patch };
      for (const [k, val] of Object.entries(filter))
        if (val === undefined || (Array.isArray(val) && val.length === 0))
          delete filter[k as keyof typeof filter];
      return { ...cur, filter };
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateCampaignForm(v);
    if (!r.ok) {
      const advancedKeys = [
        "maxConcurrent",
        "maxRetries",
        "retryDelaySeconds",
        "days",
        "windowStart",
        "windowEnd",
        "failureThresholdPct",
        "windowSeconds",
        "minCallsInWindow",
      ];
      if (Object.keys(r.errors).some((k) => advancedKeys.includes(k))) setAdvanced(true);
      return setErrors(r.errors);
    }
    setErrors({});
    onSubmit(r.body);
  };

  const agents = optionsStateFor(options, "agents");
  return (
    <form noValidate onSubmit={submit} className="space-y-6">
      {serverError}
      <Section
        title="Campaign details"
        hint="Calls are placed by the calling platform with these settings."
      >
        <Field id="name" label="Campaign name" error={errors.name}>
          <Input
            id="name"
            value={v.name}
            maxLength={100}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Interested leads, October"
            aria-invalid={errors.name ? true : undefined}
          />
        </Field>
        {platform.isError ? (
          <FormAlert>
            {platform.error instanceof ApiCallError && platform.error.message
              ? platform.error.message
              : "Couldn't load workflows from the calling platform."}{" "}
            <button type="button" className="underline" onClick={() => void platform.refetch()}>
              Retry
            </button>
          </FormAlert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="workflow"
            label="Workflow"
            hint="The voice workflow run for every lead in the campaign."
            error={errors.workflowId}
          >
            {platform.data ? (
              <Select
                id="workflow"
                value={v.workflowId}
                onChange={(x) => set("workflowId", x)}
                invalid={!!errors.workflowId}
                placeholder={
                  platform.data.workflows.length ? "Select a workflow" : "No workflows yet"
                }
                options={platform.data.workflows.map((w, _, all) => [
                  String(w.id),
                  // two platform workflows can share a name: show the id so they can be told apart
                  all.filter((x) => x.name === w.name).length > 1 ? `${w.name} (#${w.id})` : w.name,
                ])}
              />
            ) : (
              <SelectSkeleton label="Loading workflows" failed={platform.isError} />
            )}
          </Field>
          <Field
            id="telephony"
            label="Telephony configuration"
            hint="Outbound calls use this configuration's caller IDs."
            error={errors.telephonyConfigId}
          >
            {platform.data ? (
              <Select
                id="telephony"
                value={v.telephonyConfigId}
                onChange={(x) => set("telephonyConfigId", x)}
                invalid={!!errors.telephonyConfigId}
                placeholder="Default outbound configuration"
                options={platform.data.telephonyConfigs.map((t) => [
                  String(t.id),
                  `${t.name}${t.isDefault ? " (default)" : ""} · ${t.phoneNumberCount} number${t.phoneNumberCount === 1 ? "" : "s"}`,
                ])}
              />
            ) : (
              <SelectSkeleton label="Loading telephony configurations" failed={platform.isError} />
            )}
          </Field>
          <Field
            id="agent"
            label="AI agent (optional)"
            hint="Calls are attributed to this agent in reports."
            error={errors.aiAgentId}
          >
            {agents.kind === "ready" ? (
              <Select
                id="agent"
                value={v.aiAgentId}
                onChange={(x) => set("aiAgentId", x)}
                invalid={!!errors.aiAgentId}
                placeholder="None"
                options={agents.options.map((a) => [a.id, a.name])}
              />
            ) : agents.kind === "error" ? (
              <FormAlert>
                Couldn&apos;t load AI agents.{" "}
                <button type="button" className="underline" onClick={agents.retry}>
                  Retry
                </button>
              </FormAlert>
            ) : (
              <SelectSkeleton label="Loading AI agents" failed={false} />
            )}
          </Field>
          <Field
            id="batchSize"
            label="Wave size"
            hint="Leads are sent to the calling platform in waves; the next wave starts when the previous one finishes."
          >
            <Select
              id="batchSize"
              value={v.batchSize}
              onChange={(x) => set("batchSize", x === "200" ? "200" : "100")}
              options={[
                ["100", "100 leads per wave"],
                ["200", "200 leads per wave"],
              ]}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Data source: leads from the CRM"
        hint="Same filters as the Leads list. To call a spreadsheet, import it under Leads → Import first, then pick its source here."
      >
        <div className="flex flex-wrap items-center gap-2">
          <MultiFilter
            label="Stage"
            options={CORE_STAGES}
            labels={STAGE_LABEL}
            selected={v.filter.stage}
            onChange={(stage) => setFilter({ stage })}
          />
          <MultiFilter
            label="Temperature"
            options={TEMPERATURES}
            labels={TEMPERATURE_LABEL}
            selected={v.filter.temperature}
            onChange={(temperature) => setFilter({ temperature })}
          />
          <EntityFilter
            label="Source"
            emptyText="No sources yet"
            state={optionsStateFor(options, "sources")}
            selected={v.filter.sourceId}
            onChange={(sourceId) => setFilter({ sourceId })}
          />
          <EntityFilter
            label="Counsellor"
            emptyText="No counsellors yet"
            state={optionsStateFor(options, "counsellors")}
            selected={v.filter.counsellorId}
            onChange={(counsellorId) => setFilter({ counsellorId })}
          />
          <fieldset className="flex items-center gap-1 text-sm">
            <legend className="sr-only">Created between</legend>
            <Input
              type="date"
              aria-label="Created from"
              value={v.filter.createdFrom ?? ""}
              max={v.filter.createdTo}
              onChange={(e) => setFilter({ createdFrom: e.target.value || undefined })}
              className="h-8 w-36"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="date"
              aria-label="Created to"
              value={v.filter.createdTo ?? ""}
              min={v.filter.createdFrom}
              onChange={(e) => setFilter({ createdTo: e.target.value || undefined })}
              className="h-8 w-36"
            />
          </fieldset>
        </div>
        <p className="text-sm" role="status" aria-live="polite">
          {match.data !== undefined ? (
            <>
              <span className="font-semibold">{formatCount(match.data)}</span> leads match right now
            </>
          ) : match.isError ? (
            <span className="text-muted-foreground">Couldn&apos;t count matching leads.</span>
          ) : (
            <span className="text-muted-foreground">Counting matching leads…</span>
          )}
        </p>
      </Section>

      <section className="rounded-lg border bg-card">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-3 text-left"
          aria-expanded={advanced}
          aria-controls="advanced-settings"
          onClick={() => setAdvanced((x) => !x)}
        >
          <span className="text-sm font-semibold">Advanced settings</span>
          <ChevronDown
            className={advanced ? "size-4 rotate-180 transition" : "size-4 transition"}
          />
        </button>
        <div id="advanced-settings" hidden={!advanced} className="space-y-5 border-t p-4">
          <Field
            id="maxConcurrent"
            label="Max concurrent calls"
            hint={`Leave empty to use the default of ${defaults?.maxConcurrent ?? 3}.${defaults ? ` Your organisation's concurrent-call limit is ${defaults.concurrentCallLimit}, which always applies on top.` : ""}`}
            error={errors.maxConcurrent}
          >
            <Input
              id="maxConcurrent"
              inputMode="numeric"
              value={v.maxConcurrent}
              placeholder={`Default: ${defaults?.maxConcurrent ?? 3}`}
              onChange={(e) => set("maxConcurrent", e.target.value)}
              aria-invalid={errors.maxConcurrent ? true : undefined}
            />
          </Field>

          <Toggle
            label="Enable retries"
            hint="Automatically retry calls that didn't connect"
            checked={v.retryEnabled}
            onChange={(x) => set("retryEnabled", x)}
          />
          {v.retryEnabled && (
            <div className="space-y-3 border-l-2 pl-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="maxRetries" label="Max retries" error={errors.maxRetries}>
                  <Input
                    id="maxRetries"
                    inputMode="numeric"
                    value={v.maxRetries}
                    onChange={(e) => set("maxRetries", e.target.value)}
                    aria-invalid={errors.maxRetries ? true : undefined}
                  />
                </Field>
                <Field
                  id="retryDelaySeconds"
                  label="Retry delay (seconds)"
                  error={errors.retryDelaySeconds}
                >
                  <Input
                    id="retryDelaySeconds"
                    inputMode="numeric"
                    value={v.retryDelaySeconds}
                    onChange={(e) => set("retryDelaySeconds", e.target.value)}
                    aria-invalid={errors.retryDelaySeconds ? true : undefined}
                  />
                </Field>
              </div>
              <p className="text-sm font-medium">Retry on</p>
              <Toggle
                label="Busy signal"
                checked={v.retryOnBusy}
                onChange={(x) => set("retryOnBusy", x)}
              />
              <Toggle
                label="No answer"
                checked={v.retryOnNoAnswer}
                onChange={(x) => set("retryOnNoAnswer", x)}
              />
              <Toggle
                label="Voicemail"
                checked={v.retryOnVoicemail}
                onChange={(x) => set("retryOnVoicemail", x)}
              />
            </div>
          )}

          <hr />
          <Toggle
            label="Call schedule"
            hint={`Restrict when calls are made (in ${tz}). Your institution's calling hours and holidays always apply.`}
            checked={v.scheduleEnabled}
            onChange={(x) => set("scheduleEnabled", x)}
          />
          {v.scheduleEnabled && (
            <div className="space-y-3 border-l-2 pl-4">
              <fieldset>
                <legend className="sr-only">Days</legend>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(([d, label]) => (
                    <label
                      key={d}
                      className="flex min-h-11 items-center gap-1.5 rounded-md border bg-card px-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={v.days.includes(d)}
                        onChange={(e) =>
                          set(
                            "days",
                            e.target.checked
                              ? [...v.days, d].sort()
                              : v.days.filter((x) => x !== d),
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {errors.days && <p className="mt-1 text-sm text-destructive">{errors.days}</p>}
              </fieldset>
              <div className="flex flex-wrap items-start gap-3">
                <Field id="windowStart" label="From">
                  <Input
                    id="windowStart"
                    type="time"
                    value={v.windowStart}
                    onChange={(e) => set("windowStart", e.target.value)}
                    className="w-32"
                  />
                </Field>
                <Field id="windowEnd" label="Until" error={errors.windowEnd ?? errors.windowStart}>
                  <Input
                    id="windowEnd"
                    type="time"
                    value={v.windowEnd}
                    onChange={(e) => set("windowEnd", e.target.value)}
                    className="w-32"
                    aria-invalid={errors.windowEnd ? true : undefined}
                  />
                </Field>
              </div>
            </div>
          )}

          <hr />
          <Toggle
            label="Circuit breaker"
            hint="Auto-pause the campaign when too many calls fail"
            checked={v.breakerEnabled}
            onChange={(x) => set("breakerEnabled", x)}
          />
          {v.breakerEnabled && (
            <div className="space-y-3 border-l-2 pl-4">
              <Field
                id="failureThresholdPct"
                label="Failure threshold (%)"
                hint="Pause when the failure rate exceeds this percentage"
                error={errors.failureThresholdPct}
              >
                <Input
                  id="failureThresholdPct"
                  inputMode="numeric"
                  value={v.failureThresholdPct}
                  onChange={(e) => set("failureThresholdPct", e.target.value)}
                  aria-invalid={errors.failureThresholdPct ? true : undefined}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="windowSeconds" label="Window (seconds)" error={errors.windowSeconds}>
                  <Input
                    id="windowSeconds"
                    inputMode="numeric"
                    value={v.windowSeconds}
                    onChange={(e) => set("windowSeconds", e.target.value)}
                    aria-invalid={errors.windowSeconds ? true : undefined}
                  />
                </Field>
                <Field
                  id="minCallsInWindow"
                  label="Min calls in window"
                  error={errors.minCallsInWindow}
                >
                  <Input
                    id="minCallsInWindow"
                    inputMode="numeric"
                    value={v.minCallsInWindow}
                    onChange={(e) => set("minCallsInWindow", e.target.value)}
                    aria-invalid={errors.minCallsInWindow ? true : undefined}
                  />
                </Field>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid ? true : undefined}
      className="h-11 w-full rounded-md border bg-card px-2 text-sm sm:h-9"
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(([val, label]) => (
        <option key={val} value={val}>
          {label}
        </option>
      ))}
    </select>
  );
}

function SelectSkeleton({ label, failed }: { label: string; failed: boolean }) {
  return failed ? (
    <div className="flex h-11 items-center rounded-md border border-dashed px-2 text-sm text-muted-foreground sm:h-9">
      Unavailable
    </div>
  ) : (
    <div
      className="h-11 animate-pulse rounded-md bg-accent sm:h-9"
      aria-busy="true"
      aria-label={label}
    />
  );
}

/** Accessible switch; the whole row is the touch target (≥ 44 px). */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}
      >
        <span
          className={`inline-block size-5 rounded-full bg-background shadow transition ${checked ? "translate-x-6" : "translate-x-1"}`}
        />
      </button>
    </div>
  );
}
