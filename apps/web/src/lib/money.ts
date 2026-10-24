/** Money in the UI (D6). The API sends integer paise (₹1 = 100) so ledger maths never rounds. */
const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 12345 → "₹123.45"; 10000 → "₹100"; null → "—". */
export const formatPaise = (p: number | null) => (p === null ? "—" : INR.format(p / 100));

/** "1,250.50" / "1250.5" / "₹ 1250" → 125050 paise; anything else → null. At most 2 decimals. */
export function parseRupees(input: string): number | null {
  const s = input.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Paise → editable rupee text without currency formatting: 125050 → "1250.50", 10000 → "100". */
export const paiseToInput = (p: number) =>
  p % 100 === 0 ? String(p / 100) : `${Math.floor(p / 100)}.${String(p % 100).padStart(2, "0")}`;
