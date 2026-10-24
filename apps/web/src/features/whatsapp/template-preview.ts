import type { WhatsappTemplate } from "@vernacular/contracts";

/**
 * Template variable preview (D5-I4-02). Pure: splits a body like "Hi {{1}}, your visit is on {{2}}" into text and
 * variable segments so the dialog can render the live preview as plain text (never HTML).
 */
export type Segment = { kind: "text"; text: string } | { kind: "var"; key: string; value: string };

const PLACEHOLDER = /\{\{(\d{1,2})\}\}/g;

export function templateSegments(body: string, values: Record<string, string>): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(PLACEHOLDER)) {
    if (m.index > last) out.push({ kind: "text", text: body.slice(last, m.index) });
    const key = m[1]!;
    out.push({ kind: "var", key, value: values[key]?.trim() ?? "" });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ kind: "text", text: body.slice(last) });
  return out;
}

/** Start from the server's per-lead defaults (mapped fields); unmapped variables start empty. */
export const initialValues = (t: WhatsappTemplate): Record<string, string> =>
  Object.fromEntries(t.variables.map((v) => [v.key, v.defaultValue ?? ""]));

/** Variables still empty (blocks Send). */
export const missingVariables = (t: WhatsappTemplate, values: Record<string, string>) =>
  t.variables.filter((v) => !values[v.key]?.trim()).map((v) => v.key);

export const languagesOf = (templates: WhatsappTemplate[]) =>
  [...new Set(templates.map((t) => t.language))].sort();
