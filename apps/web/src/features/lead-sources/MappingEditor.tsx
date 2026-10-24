import { useState } from "react";
import type { LeadSource, TestMappingResponse } from "@vernacular/contracts";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  fromDraft,
  parsePayload,
  SAMPLE_PAYLOAD,
  toDraft,
  type MappingDraft,
} from "@/features/lead-sources/mapping";
import { MappingRows } from "@/features/lead-sources/MappingRows";
import { usePatchSource, useTestMapping } from "@/features/lead-sources/sources-api";
import { ApiCallError } from "@/lib/api";
import type { FieldErrors } from "@/lib/forms";

/**
 * Field mapping + "test payload" (D3-I4-03). The test runs against the mapping as currently EDITED
 * (saved or not) and writes nothing — it's a dry-run preview of what we'd store.
 */
export function MappingEditor({ source, onClose }: { source: LeadSource; onClose: () => void }) {
  const [draft, setDraft] = useState<MappingDraft>(() => toDraft(source.fieldMapping));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  const patch = usePatchSource(source.id);

  const save = () => {
    const r = fromDraft(draft);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    patch.mutate(
      { fieldMapping: r.mapping },
      {
        onSuccess: () => setSaved(true),
        onError: (err) =>
          setErrors({ form: err instanceof ApiCallError ? err.message : "Couldn't save" }),
      },
    );
  };

  return (
    <div className="space-y-5 border-t pt-4">
      <div>
        <h3 className="text-sm font-semibold">Field mapping</h3>
        <p className="text-xs text-muted-foreground">
          Where each field is in the provider&apos;s payload, e.g. <code>contact.mobile</code>.
          Leave a row empty to use automatic recognition (name, phone, mobile, email, city,
          course…). Several paths: separate with commas; they are joined with a space.
        </p>
      </div>
      {errors.form && <FormAlert>{errors.form}</FormAlert>}
      <MappingRows
        draft={draft}
        errors={errors}
        onChange={(next) => {
          setSaved(false);
          setDraft(next);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={patch.isPending}>
          {patch.isPending && <Loader2 className="animate-spin" />}
          Save mapping
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        {saved && (
          <span className="text-sm text-muted-foreground" role="status">
            Saved
          </span>
        )}
      </div>
      <TestPayload sourceId={source.id} draft={draft} />
    </div>
  );
}

function TestPayload({ sourceId, draft }: { sourceId: string; draft: MappingDraft }) {
  const [text, setText] = useState(SAMPLE_PAYLOAD);
  const [error, setError] = useState<string | null>(null);
  const test = useTestMapping(sourceId);

  const run = () => {
    const p = parsePayload(text);
    if (!p.ok) return setError(p.error);
    const m = fromDraft(draft);
    if (!m.ok) return setError("Fix the mapping errors above first");
    setError(null);
    test.mutate({ payload: p.payload, fieldMapping: m.mapping });
  };

  return (
    <section className="space-y-2 rounded-lg border bg-muted/40 p-3">
      <h3 className="text-sm font-semibold">Test payload</h3>
      <p className="text-xs text-muted-foreground">
        Paste what the provider sends. Nothing is saved and no lead is created.
      </p>
      <Textarea
        aria-label="Test payload (JSON)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        className="bg-card font-mono text-xs"
      />
      {error && <FormAlert>{error}</FormAlert>}
      <Button variant="outline" size="sm" onClick={run} disabled={test.isPending}>
        {test.isPending && <Loader2 className="animate-spin" />}
        Run test
      </Button>
      {test.isError && (
        <FormAlert>
          {test.error instanceof ApiCallError ? test.error.message : "The test didn't run"}
        </FormAlert>
      )}
      {test.data && <TestResult result={test.data} />}
    </section>
  );
}

const MAPPED_LABEL: [keyof NonNullable<TestMappingResponse["mapped"]>, string][] = [
  ["fullName", "Full name"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["city", "City"],
  ["state", "State"],
  ["language", "Language"],
  ["program", "Program"],
  ["externalId", "Provider's lead id"],
  ["consent", "Consent"],
];

function TestResult({ result }: { result: TestMappingResponse }) {
  return (
    <div className="space-y-2 rounded-md border bg-card p-3 text-sm" aria-label="Test result">
      <p className="flex items-center gap-2 font-medium">
        {result.ok ? (
          <CheckCircle2 className="size-4 text-primary" aria-hidden />
        ) : (
          <XCircle className="size-4 text-destructive" aria-hidden />
        )}
        {result.ok ? "This payload would create a lead" : "This payload would be rejected"}
      </p>
      {result.mapped && (
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
          {MAPPED_LABEL.map(([k, label]) => {
            const v = result.mapped?.[k];
            return (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono text-xs break-all">
                  {v === null || v === undefined
                    ? "—"
                    : typeof v === "boolean"
                      ? v
                        ? "yes"
                        : "no"
                      : v}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {result.errors.length > 0 && (
        <ul className="list-disc pl-5 text-destructive">
          {result.errors.map((e) => (
            <li key={`${e.path}-${e.message}`}>
              <code>{e.path}</code>: {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
