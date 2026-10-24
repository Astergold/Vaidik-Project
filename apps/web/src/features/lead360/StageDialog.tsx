import { useState, type FormEvent } from "react";
import { CORE_STAGES, NEXT_STEPS, type LeadDetail } from "@vernacular/contracts";
import { FormAlert, SubmitButton } from "@/components/auth/AuthParts";
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
import { Textarea } from "@/components/ui/textarea";
import { usePatchLead } from "@/features/lead360/lead360-api";
import {
  buildStagePatch,
  initialStageForm,
  isClosedStage,
  needsNextStep,
  stageErrorsFromApi,
  type StageFormValues,
} from "@/features/lead360/stage-form";
import type { FieldErrors } from "@/lib/forms";
import { NEXT_STEP_LABEL, STAGE_LABEL } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";

/** Change stage with a reason (+ next step when the lead stays open). Errors stay in the dialog. */
export function StageDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: LeadDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tz = useTenantTimeZone();
  const [v, setV] = useState<StageFormValues>(() => initialStageForm(lead));
  const [errors, setErrors] = useState<FieldErrors>({});
  const patch = usePatchLead(lead.id);

  const reset = (next: boolean) => {
    if (next) {
      setV(initialStageForm(lead));
      setErrors({});
      patch.reset();
    }
    onOpenChange(next);
  };
  const set = (k: keyof StageFormValues) => (value: string) =>
    setV((cur) => ({ ...cur, [k]: value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const r = buildStagePatch(lead, v, tz);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    patch.mutate(r.body, {
      onSuccess: () => onOpenChange(false),
      onError: (err) => setErrors(stageErrorsFromApi(err)),
    });
  };

  const askStep = needsNextStep(lead, v) || Boolean(errors.nextStep);
  const showStep = !CORE_STAGES.some((s) => s === v.stage && isClosedStage(s));

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change stage</DialogTitle>
          <DialogDescription>
            Currently {STAGE_LABEL[lead.stage]}. Your reason is added to the timeline.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={onSubmit} className="space-y-4">
          {errors.form && <FormAlert>{errors.form}</FormAlert>}
          <SelectField
            id="stage"
            label="New stage"
            value={v.stage}
            onChange={set("stage")}
            error={errors.stage}
            options={CORE_STAGES.map((s) => ({
              value: s,
              label: STAGE_LABEL[s],
              disabled: s === lead.stage,
            }))}
          />
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              value={v.reason}
              onChange={(e) => set("reason")(e.target.value)}
              placeholder="e.g. Parent confirmed interest in B.Tech CS"
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={errors.reason ? "reason-error" : undefined}
              maxLength={500}
              rows={3}
            />
            {errors.reason && (
              <p id="reason-error" className="text-sm text-destructive">
                {errors.reason}
              </p>
            )}
          </div>
          {showStep && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                id="nextStep"
                label={askStep ? "Next step (required)" : "Next step"}
                value={v.nextStep}
                onChange={set("nextStep")}
                error={errors.nextStep}
                options={[
                  { value: "", label: lead.nextStep ? "Keep current" : "Choose…" },
                  ...NEXT_STEPS.map((s) => ({ value: s, label: NEXT_STEP_LABEL[s] })),
                ]}
              />
              <div className="space-y-1.5">
                <Label htmlFor="nextStepDue">Due ({tz})</Label>
                <input
                  id="nextStepDue"
                  type="datetime-local"
                  value={v.nextStepDue}
                  onChange={(e) => set("nextStepDue")(e.target.value)}
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                />
                {errors.nextStepDue && (
                  <p className="text-sm text-destructive">{errors.nextStepDue}</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => reset(false)}>
              Cancel
            </Button>
            <div>
              <SubmitButton pending={patch.isPending}>Change stage</SubmitButton>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-9 w-full rounded-md border bg-card px-2 text-sm aria-invalid:border-destructive"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
