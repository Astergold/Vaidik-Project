import { createTenantBody, type CreateTenantBody } from "@vernacular/contracts";

/** Create-tenant wizard model (D6-I4-01). Pure, so it is unit-tested. */
export interface TenantDraft {
  name: string;
  slug: string;
  /** false until the user edits the slug by hand; until then it follows the name. */
  slugTouched: boolean;
  timezone: string;
  planId: string;
  billingMode: "prepaid" | "postpaid";
  voiceMode: "create" | "existing";
  voiceOrgId: string;
  voiceKey: string;
  ownerEmail: string;
  ownerName: string;
}

export const emptyDraft = (): TenantDraft => ({
  name: "",
  slug: "",
  slugTouched: false,
  timezone: "Asia/Kolkata",
  planId: "",
  billingMode: "prepaid",
  voiceMode: "create",
  voiceOrgId: "",
  voiceKey: "",
  ownerEmail: "",
  ownerName: "",
});

/** "MIT-ADT University, Pune" → "mit-adt-university-pune" (max 40, trimmed hyphens). */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function withName(d: TenantDraft, name: string): TenantDraft {
  return { ...d, name, slug: d.slugTouched ? d.slug : slugify(name) };
}

export type DraftCheck =
  { ok: true; body: CreateTenantBody } | { ok: false; errors: Record<string, string> };

/** Draft → API body, validated with the contract (errors keyed by field; voice engine fields by their own names). */
export function checkDraft(d: TenantDraft): DraftCheck {
  const raw = {
    name: d.name,
    slug: d.slug,
    timezone: d.timezone,
    planId: d.planId,
    billingMode: d.billingMode,
    voiceEngine:
      d.voiceMode === "create"
        ? { mode: "create" as const }
        : { mode: "existing" as const, orgId: d.voiceOrgId, apiKey: d.voiceKey },
    ownerEmail: d.ownerEmail.trim(),
    ownerName: d.ownerName.trim() || undefined,
  };
  const r = createTenantBody.safeParse(raw);
  if (r.success) return { ok: true, body: raw };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) {
    const key = i.path[0] === "voiceEngine" ? `voice.${String(i.path[1])}` : String(i.path[0]);
    errors[key] ??= i.message;
  }
  return { ok: false, errors };
}

/** Timezones the browser knows, with the common Indian/Gulf ones first. */
export function timezoneOptions(): string[] {
  const first = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "UTC"];
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf("timeZone");
  } catch {
    all = [];
  }
  return [...first, ...all.filter((z) => !first.includes(z))];
}
