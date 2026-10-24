import { Input } from "@/components/ui/input";
import { FIELD_LABEL, type MappingDraft, type RowMode } from "@/features/lead-sources/mapping";
import type { FieldErrors } from "@/lib/forms";

/**
 * The mapping rows + consent channels, shared by the webhook mapping editor and the CSV import wizard.
 * Webhook mode: "From field" takes a payload path. CSV mode (`columns`): "From column" picks a header.
 */
export function MappingRows({
  draft,
  onChange,
  errors,
  columns,
}: {
  draft: MappingDraft;
  onChange: (next: MappingDraft) => void;
  errors: FieldErrors;
  columns?: readonly string[];
}) {
  const setRow = (i: number, change: Partial<{ mode: RowMode; text: string }>) =>
    onChange({ ...draft, rows: draft.rows.map((r, j) => (j === i ? { ...r, ...change } : r)) });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {draft.rows.map((r, i) => (
          <div
            key={r.field}
            className="grid grid-cols-1 gap-1 sm:grid-cols-[9rem_8rem_1fr] sm:items-center sm:gap-2"
          >
            <label htmlFor={`map-${r.field}`} className="text-sm font-medium">
              {FIELD_LABEL[r.field]}
            </label>
            <select
              aria-label={`${FIELD_LABEL[r.field]} mapping type`}
              value={r.mode}
              onChange={(e) =>
                setRow(i, { mode: e.target.value === "const" ? "const" : "path", text: "" })
              }
              className="h-9 rounded-md border bg-card px-2 text-sm"
            >
              <option value="path">{columns ? "From column" : "From field"}</option>
              <option value="const">Fixed value</option>
            </select>
            <div className="min-w-0">
              {columns && r.mode === "path" ? (
                <select
                  id={`map-${r.field}`}
                  value={r.text}
                  onChange={(e) => setRow(i, { text: e.target.value })}
                  aria-invalid={errors[r.field] ? true : undefined}
                  className="h-9 w-full min-w-0 rounded-md border bg-card px-2 text-sm aria-invalid:border-destructive"
                >
                  <option value="">Not in this file / auto</option>
                  {/* keep a saved value that isn't a column visible, so its error makes sense */}
                  {r.text && !columns.includes(r.text) && (
                    <option value={r.text}>{r.text} (missing)</option>
                  )}
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`map-${r.field}`}
                  value={r.text}
                  onChange={(e) => setRow(i, { text: e.target.value })}
                  placeholder={r.mode === "const" ? "Value" : "auto"}
                  className="font-mono text-sm"
                  aria-invalid={errors[r.field] ? true : undefined}
                />
              )}
              {errors[r.field] && (
                <p className="mt-1 text-xs text-destructive">{errors[r.field]}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Consent covers</legend>
        <div className="flex gap-4 text-sm">
          {(["voice", "whatsapp"] as const).map((c) => (
            <label key={c} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.consentChannels[c]}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    consentChannels: { ...draft.consentChannels, [c]: e.target.checked },
                  })
                }
              />
              {c === "voice" ? "Calls" : "WhatsApp"}
            </label>
          ))}
        </div>
        {errors.consent_channels && (
          <p className="text-xs text-destructive">{errors.consent_channels}</p>
        )}
      </fieldset>
    </div>
  );
}
