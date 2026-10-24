import {
  APPLICATION_IMPORT_FIELDS,
  applicationImportMappingBody,
  type ApplicationColumnMapping,
  type ApplicationImportField,
} from "@vernacular/contracts";

/** Applications CSV column mapping (D5-I4-01): our field → one column header of the uploaded file. */
export const APP_FIELD_LABEL: Record<ApplicationImportField, string> = {
  external_application_no: "Application no.",
  full_name: "Student name",
  phone: "Phone",
  email: "Email",
  program: "Program",
  status: "Status",
  fee_amount: "Fee amount",
  paid_at: "Paid on",
};

const HINTS: Record<ApplicationImportField, string[]> = {
  external_application_no: [
    "applicationno",
    "applicationnumber",
    "appno",
    "applicationid",
    "formno",
  ],
  full_name: ["name", "studentname", "fullname", "candidatename", "applicantname"],
  phone: ["phone", "mobile", "mobileno", "phoneno", "contact", "contactno"],
  email: ["email", "emailid", "emailaddress"],
  program: ["program", "programme", "course", "coursename"],
  status: ["status", "applicationstatus", "stage"],
  fee_amount: ["fee", "feeamount", "amount", "amountpaid", "feepaid"],
  paid_at: ["paidat", "paidon", "paymentdate", "feepaiddate", "dateofpayment"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Pre-fill: the mapping saved from the last import wins (when its column still exists), then common header names.
 * A suggestion only — the server re-validates and owns parsing.
 */
export function suggestMapping(
  columns: string[],
  saved: ApplicationColumnMapping,
): ApplicationColumnMapping {
  const out: ApplicationColumnMapping = {};
  const used = new Set<string>();
  for (const field of APPLICATION_IMPORT_FIELDS) {
    const s = saved[field];
    if (s && columns.includes(s)) {
      out[field] = s;
      used.add(s);
    }
  }
  for (const field of APPLICATION_IMPORT_FIELDS) {
    if (out[field]) continue;
    const hit = columns.find((c) => !used.has(c) && HINTS[field].includes(norm(c)));
    if (hit) {
      out[field] = hit;
      used.add(hit);
    }
  }
  return out;
}

export type MappingCheck =
  { ok: true; mapping: ApplicationColumnMapping } | { ok: false; message: string };

/** Same rules as the API: status mapped, plus application no./phone/email; a column used once. */
export function checkMapping(m: ApplicationColumnMapping): MappingCheck {
  const cols = Object.values(m).filter(Boolean);
  if (new Set(cols).size !== cols.length)
    return { ok: false, message: "Each column can be used for one field only" };
  const r = applicationImportMappingBody.safeParse({ mapping: m });
  if (!r.success) return { ok: false, message: r.error.issues[0]?.message ?? "Check the mapping" };
  return { ok: true, mapping: r.data.mapping };
}
