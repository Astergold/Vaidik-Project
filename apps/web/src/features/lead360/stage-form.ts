import {
  CORE_STAGES,
  NEXT_STEPS,
  patchLeadBody,
  type CoreStage,
  type LeadDetail,
  type NextStep,
  type PatchLeadBody,
} from "@vernacular/contracts";
import { ApiCallError } from "@/lib/api";
import { apiFieldErrors, type FieldErrors } from "@/lib/forms";

/** Change-stage dialog logic (D3-I4-01). Pure so it is unit-tested; the dialog only renders it. */
export const CLOSED_STAGES: readonly CoreStage[] = ["enrolled", "lost", "invalid"];
export const isClosedStage = (s: CoreStage) => CLOSED_STAGES.includes(s);

export interface StageFormValues {
  stage: string;
  reason: string;
  /** "" = leave as is. */
  nextStep: string;
  /** `<input type="datetime-local">` value, in the TENANT's timezone. "" = none. */
  nextStepDue: string;
}

export const initialStageForm = (lead: LeadDetail): StageFormValues => ({
  stage: lead.stage,
  reason: "",
  nextStep: lead.nextStep ?? "",
  nextStepDue: "",
});

/** Does this change need a next step? Same rule as the API: an open lead must have one. */
export const needsNextStep = (lead: LeadDetail, v: StageFormValues) =>
  CORE_STAGES.includes(v.stage as CoreStage) &&
  !isClosedStage(v.stage as CoreStage) &&
  !v.nextStep &&
  lead.nextStep === null;

export type StageFormResult =
  { ok: true; body: PatchLeadBody } | { ok: false; errors: FieldErrors };

export function buildStagePatch(
  lead: LeadDetail,
  v: StageFormValues,
  timeZone: string,
): StageFormResult {
  const errors: FieldErrors = {};
  const stage = CORE_STAGES.find((s) => s === v.stage);
  if (!stage) errors.stage = "Choose a stage";
  else if (stage === lead.stage) errors.stage = "Choose a different stage";
  if (v.reason.trim().length < 3)
    errors.reason = "Say why (at least 3 characters) — it goes on the timeline";
  if (stage && needsNextStep(lead, v)) errors.nextStep = "An open lead needs a next step";

  const step = NEXT_STEPS.find((s) => s === v.nextStep) ?? null;
  let due: string | null = null;
  if (v.nextStepDue) {
    due = zonedLocalToIso(v.nextStepDue, timeZone);
    if (!due) errors.nextStepDue = "Enter a valid date and time";
  }
  if (Object.keys(errors).length || !stage) return { ok: false, errors };

  const body: PatchLeadBody = { stage, reason: v.reason.trim() };
  // A sub-stage belongs to one stage; the old one would be invalid under the new stage.
  if (lead.subStage) body.subStageId = null;
  if (step !== lead.nextStep && step !== null) body.nextStep = step as NextStep;
  if (due) body.nextStepDueAt = due;

  const parsed = patchLeadBody.safeParse(body);
  return parsed.success
    ? { ok: true, body: parsed.data }
    : { ok: false, errors: { form: "Invalid change" } };
}

/** Server errors → the field they belong to. REASON_REQUIRED has no details path, so it is mapped by code. */
export function stageErrorsFromApi(err: unknown): FieldErrors {
  if (!(err instanceof ApiCallError))
    return { form: "Couldn't change the stage. Please try again." };
  if (err.code === "REASON_REQUIRED") return { reason: err.message };
  if (err.code === "NEXT_STEP_REQUIRED")
    return { nextStep: apiFieldErrors(err).nextStep ?? err.message };
  if (err.status === 422) {
    const fields = apiFieldErrors(err);
    return Object.keys(fields).length ? fields : { form: err.message };
  }
  if (err.status === 403 || err.status === 404) return { form: err.message };
  return { form: "Couldn't change the stage. Please try again." };
}

/**
 * "2026-10-18T10:00" meant in `timeZone` → ISO UTC. Never via the browser's own zone: a counsellor
 * travelling (or a laptop on UTC) must still schedule 10:00 institution time.
 */
export function zonedLocalToIso(local: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(asUtc)) return null;
  // Offset of the zone at that instant; re-check once for DST edges.
  let ts = asUtc - offsetMs(asUtc, timeZone);
  ts = asUtc - offsetMs(ts, timeZone);
  return new Date(ts).toISOString();
}

function offsetMs(ts: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ts))
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return local - Math.floor(ts / 1000) * 1000;
}
