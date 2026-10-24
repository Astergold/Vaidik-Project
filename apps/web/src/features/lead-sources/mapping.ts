import { fieldMapping, type FieldMapping } from "@vernacular/contracts";
import type { FieldErrors } from "@/lib/forms";

/**
 * Field-mapping editor model (D3-I4-03). The stored mapping per field is a path ("contact.mobile"),
 * several paths joined with a space (["lead.first", "lead.last"]), or a constant ({ const: "Pune" }).
 * The editor shows one row per field: a mode + one text box (several paths = comma-separated).
 */
export const MAPPED_FIELDS = [
  "full_name",
  "phone",
  "email",
  "city",
  "state",
  "language",
  "program",
  "external_id",
  "consent",
] as const;
export type MappedField = (typeof MAPPED_FIELDS)[number];

export const FIELD_LABEL: Record<MappedField, string> = {
  full_name: "Full name",
  phone: "Phone",
  email: "Email",
  city: "City",
  state: "State",
  language: "Language",
  program: "Program",
  external_id: "Provider's lead id",
  consent: "Consent",
};

export type RowMode = "path" | "const";
export interface MappingRow {
  field: MappedField;
  mode: RowMode;
  /** path mode: "a.b" or "a.first, a.last"; const mode: the literal value. "" = not mapped. */
  text: string;
}
export interface MappingDraft {
  rows: MappingRow[];
  consentChannels: { voice: boolean; whatsapp: boolean };
}

export function toDraft(m: FieldMapping): MappingDraft {
  const rows = MAPPED_FIELDS.map((field): MappingRow => {
    const v = m[field];
    if (v === undefined) return { field, mode: "path", text: "" };
    if (typeof v === "string") return { field, mode: "path", text: v };
    if (Array.isArray(v)) return { field, mode: "path", text: v.join(", ") };
    return { field, mode: "const", text: v.const };
  });
  const ch = m.consent_channels ?? ["voice"];
  return {
    rows,
    consentChannels: { voice: ch.includes("voice"), whatsapp: ch.includes("whatsapp") },
  };
}

export type DraftResult = { ok: true; mapping: FieldMapping } | { ok: false; errors: FieldErrors };

/**
 * Editor → stored mapping, validated with the contract. Empty rows are left out (= default recognition).
 * CSV mode (`columns` given): a path is ONE exact column header (spaces allowed) that must exist in the file.
 */
export function fromDraft(
  d: MappingDraft,
  opts: { columns?: readonly string[] } = {},
): DraftResult {
  const out: Record<string, unknown> = {};
  const errors: FieldErrors = {};
  for (const r of d.rows) {
    const text = r.text.trim();
    if (!text) continue;
    if (r.mode === "const") {
      out[r.field] = { const: text };
      continue;
    }
    if (opts.columns) {
      if (!opts.columns.includes(r.text))
        errors[r.field] = `"${r.text}" isn't a column in this file`;
      else out[r.field] = r.text;
      continue;
    }
    const paths = text
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (paths.some((p) => /\s/.test(p))) {
      errors[r.field] = "Paths can't contain spaces (separate several paths with commas)";
      continue;
    }
    out[r.field] = paths.length === 1 ? paths[0] : paths;
  }
  const channels = (["voice", "whatsapp"] as const).filter((c) => d.consentChannels[c]);
  if (channels.length === 0) errors.consent_channels = "Pick at least one channel";
  // Only store channels when they differ from the default (["voice"]).
  else if (!(channels.length === 1 && channels[0] === "voice")) out.consent_channels = channels;
  if (Object.keys(errors).length) return { ok: false, errors };

  const parsed = fieldMapping.safeParse(out);
  return parsed.success
    ? { ok: true, mapping: parsed.data }
    : { ok: false, errors: { form: parsed.error.issues[0]?.message ?? "Invalid mapping" } };
}

/** The "test payload" box: must be a JSON object (the intake endpoint takes one). */
export function parsePayload(
  text: string,
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      error: `Not valid JSON: ${e instanceof Error ? e.message : "parse error"}`,
    };
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return { ok: false, error: 'The payload must be a JSON object, like { "name": "…" }' };
  }
  return { ok: true, payload: v as Record<string, unknown> };
}

export const SAMPLE_PAYLOAD = JSON.stringify(
  {
    name: "Asha Rao",
    mobile: "98765 43210",
    email: "asha@example.com",
    city: "Pune",
    course: "B.Tech Computer Science",
  },
  null,
  2,
);
