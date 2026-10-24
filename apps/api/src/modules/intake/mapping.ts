import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeEmail, normalizePhone, type FieldMapping } from "@vernacular/contracts";

// ---- safe path lookup (no eval, no prototype access) ---------------------------------------------

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

/** "a.b[0].c", "$.a.b", "a.0.b" -> value or undefined. Only own properties are ever read. */
export function getPath(obj: unknown, path: string): unknown {
  const tokens = path.replace(/^\$\.?/, "").match(/[^.[\]]+/g);
  if (!tokens) return undefined;
  let cur: unknown = obj;
  for (const t of tokens) {
    if (FORBIDDEN.has(t) || cur === null || typeof cur !== "object") return undefined;
    if (!Object.hasOwn(cur as object, t)) return undefined;
    cur = (cur as Record<string, unknown>)[t];
  }
  return cur;
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

const clean = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined || typeof v === "object") return null;
  const s = String(v).replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  return s === "" ? null : s.slice(0, max);
};

type MappingValue = NonNullable<FieldMapping[keyof Omit<FieldMapping, "consent_channels">]>;

function resolveValue(
  payload: Record<string, unknown>,
  spec: MappingValue | undefined,
  max: number,
): string | null {
  if (spec === undefined) return null;
  if (typeof spec === "string") return clean(getPath(payload, spec), max);
  if (Array.isArray(spec)) {
    const parts = spec
      .map((p) => clean(getPath(payload, p), max))
      .filter((x): x is string => x !== null);
    return parts.length ? parts.join(" ").slice(0, max) : null;
  }
  return clean(spec.const, max);
}

/** When a field isn't mapped we look for these top-level keys (case-insensitive), so simple forms work out of the box. */
const AUTO_KEYS: Record<string, string[]> = {
  phone: [
    "phone",
    "mobile",
    "mobile_number",
    "phone_number",
    "contact",
    "contact_number",
    "whatsapp",
    "mobileno",
  ],
  full_name: ["full_name", "fullname", "name", "student_name"],
  email: ["email", "email_address", "emailid"],
  city: ["city", "location"],
  state: ["state"],
  language: ["language", "lang", "preferred_language"],
  program: ["program", "programme", "course", "interested_course", "course_name"],
};

function autoDetect(payload: Record<string, unknown>, field: string, max: number): string | null {
  const wanted = AUTO_KEYS[field];
  if (!wanted) return null;
  const lower = new Map(Object.keys(payload).map((k) => [k.toLowerCase(), k]));
  for (const w of wanted) {
    const real = lower.get(w);
    if (real !== undefined) {
      const v = clean(payload[real], max);
      if (v) return v;
    }
  }
  if (field === "full_name") {
    const first = lower.get("first_name");
    const last = lower.get("last_name");
    const parts = [first, last]
      .map((k) => (k ? clean(payload[k], 100) : null))
      .filter((x): x is string => x !== null);
    if (parts.length) return parts.join(" ");
  }
  return null;
}

const LANGUAGES: Record<string, string> = {
  english: "en",
  hindi: "hi",
  marathi: "mr",
  gujarati: "gu",
  bengali: "bn",
  tamil: "ta",
  telugu: "te",
  kannada: "kn",
  malayalam: "ml",
  punjabi: "pa",
  urdu: "ur",
  odia: "or",
};
const normalizeLanguage = (v: string | null): string | null => {
  if (!v) return null;
  const l = v.toLowerCase();
  return LANGUAGES[l] ?? (/^[a-z]{2}(-[a-z]{2})?$/.test(l) ? l : null);
};

const TRUE = new Set([
  "true",
  "yes",
  "y",
  "1",
  "on",
  "agree",
  "agreed",
  "accept",
  "accepted",
  "checked",
  "i agree",
]);
const FALSE = new Set([
  "false",
  "no",
  "n",
  "0",
  "off",
  "disagree",
  "declined",
  "unchecked",
  "none",
]);

export interface MappedLead {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  language: string | null;
  program: string | null;
  externalId: string | null;
  /** false only when the form explicitly said "no". Submitting a form otherwise counts as consent (with evidence). */
  consent: boolean;
  consentChannels: ("voice" | "whatsapp")[];
}

export interface MappingResult {
  ok: boolean;
  mapped: MappedLead | null;
  errors: { path: string; message: string }[];
  warnings: string[];
}

export function applyMapping(
  payload: Record<string, unknown>,
  mapping: FieldMapping,
): MappingResult {
  const errors: MappingResult["errors"] = [];
  const warnings: string[] = [];
  const pick = (field: keyof FieldMapping & string, max: number) =>
    resolveValue(payload, mapping[field as keyof Omit<FieldMapping, "consent_channels">], max) ??
    (mapping[field as keyof Omit<FieldMapping, "consent_channels">] === undefined
      ? autoDetect(payload, field, max)
      : null);

  const phoneRaw = pick("phone", 40);
  const phone = normalizePhone(phoneRaw);
  if (!phone.ok) errors.push({ path: "phone", message: phone.reason });

  const emailRaw = pick("email", 254);
  const email = normalizeEmail(emailRaw);
  if (emailRaw && !email) warnings.push("EMAIL_INVALID");

  let consent = true;
  if (mapping.consent !== undefined) {
    const raw = resolveValue(payload, mapping.consent, 40);
    if (raw !== null) {
      const v = raw.toLowerCase();
      if (TRUE.has(v)) consent = true;
      else if (FALSE.has(v)) consent = false;
      else {
        consent = false; // unknown wording: do NOT assume permission
        warnings.push("CONSENT_UNRECOGNISED");
      }
    }
  }

  const language = normalizeLanguage(pick("language", 30));
  const rawLanguage = pick("language", 30);
  if (rawLanguage && !language) warnings.push("LANGUAGE_UNRECOGNISED");

  if (errors.length) return { ok: false, mapped: null, errors, warnings };
  return {
    ok: true,
    errors,
    warnings,
    mapped: {
      fullName: pick("full_name", 200),
      phone: phone.ok ? phone.e164 : null,
      email,
      city: pick("city", 100),
      state: pick("state", 100),
      language,
      program: pick("program", 200),
      // never guessed: a provider id must be mapped explicitly
      externalId: resolveValue(payload, mapping.external_id, 100),
      consent,
      consentChannels: mapping.consent_channels ?? ["voice"],
    },
  };
}

// ---- source bearer tokens --------------------------------------------------------------------------
// 256-bit random tokens: a fast SHA-256 is the right hash (slow KDFs protect LOW-entropy passwords and
// would only add latency to every intake call). Compared in constant time.

export const generateSourceToken = (): string => `vk_src_${randomBytes(32).toString("base64url")}`;
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export function tokenMatches(
  presented: string | undefined,
  storedHash: string | null | undefined,
): boolean {
  // Always do the same amount of work, whether or not the source exists / has a token.
  const a = Buffer.from(hashToken(presented ?? ""), "hex");
  const b = Buffer.from(
    storedHash && /^[0-9a-f]{64}$/.test(storedHash) ? storedHash : "0".repeat(64),
    "hex",
  );
  return timingSafeEqual(a, b) && Boolean(presented) && Boolean(storedHash);
}

export function bearerToken(header: string | undefined): string | undefined {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m?.[1];
}
