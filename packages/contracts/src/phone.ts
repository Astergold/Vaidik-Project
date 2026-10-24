/**
 * Phone + email normalisation. ONE implementation for intake, CSV import, Dograh derive, inbound calls and
 * the public API, so the same student can never become two persons because two code paths disagreed.
 * Dedupe depends on `value_norm` being identical everywhere (person_identifier UNIQUE).
 */

export type PhoneResult =
  { ok: true; e164: string } | { ok: false; reason: "PHONE_MISSING" | "PHONE_INVALID" };

// Zero code points of the decimal-digit blocks we expect in Indian lead data (Devanagari, Bengali, ...).
const DIGIT_ZEROS = [
  0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0xff10,
];

function toAsciiDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const zero = DIGIT_ZEROS.find((z) => cp >= z && cp <= z + 9);
    out += zero === undefined ? ch : String(cp - zero);
  }
  return out;
}

const INVALID: PhoneResult = { ok: false, reason: "PHONE_INVALID" };

/**
 * -> E.164. India (+91) mobile rules by default; any other country must arrive with an explicit "+".
 * Accepts: 9876543210 · 09876543210 · 919876543210 · +91 98765-43210 · 0091 98765 43210 · (+91) 98765 43210 · ९८७६५४३२१०
 * Rejects: landlines, wrong lengths, all-identical digits (9999999999), spreadsheet-mangled numbers (9.19E+11).
 */
export function normalizePhone(raw: unknown): PhoneResult {
  if (raw === null || raw === undefined) return { ok: false, reason: "PHONE_MISSING" };
  const text = toAsciiDigits(String(raw)).trim();
  if (text === "") return { ok: false, reason: "PHONE_MISSING" };
  if (/^\d(\.\d+)?e[+-]?\d+$/i.test(text)) return INVALID; // Excel scientific notation: digits are already lost

  let s = text.replace(/^tel:/i, "");
  let international = s.startsWith("+");
  s = s.replace(/[\s\-.()]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(s)) return INVALID;

  if (!international && s.startsWith("00")) {
    international = true;
    s = s.slice(2);
  }

  if (international) {
    if (s.startsWith("91")) return indianMobile(s.slice(2));
    if (s.length < 8 || s.length > 15 || s.startsWith("0")) return INVALID;
    return { ok: true, e164: `+${s}` };
  }

  // No country marker: assume India (the only country with local-format rules for now).
  if ((s.length === 11 || s.length === 13) && s.startsWith("0")) s = s.slice(1); // trunk prefix
  if (s.length === 12 && s.startsWith("91")) return indianMobile(s.slice(2));
  return indianMobile(s);
}

function indianMobile(national: string): PhoneResult {
  if (!/^[6-9]\d{9}$/.test(national)) return INVALID;
  if (/^(\d)\1{9}$/.test(national)) return INVALID; // 9999999999
  return { ok: true, e164: `+91${national}` };
}

/** lower-cased, trimmed; null when it doesn't look like an address (we drop it, we don't reject the lead). */
export function normalizeEmail(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const e = String(raw).trim().toLowerCase();
  if (e.length === 0 || e.length > 254) return null;
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e) ? e : null;
}
