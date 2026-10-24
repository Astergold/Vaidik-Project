import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone } from "../src/phone.js";

const ok = (raw: unknown) => {
  const r = normalizePhone(raw);
  return r.ok ? r.e164 : `ERR:${r.reason}`;
};

describe("normalizePhone: valid Indian mobiles all become the same E.164", () => {
  it.each([
    "9876543210",
    "09876543210",
    "919876543210",
    "+919876543210",
    "+91 98765 43210",
    "+91-98765-43210",
    "(+91) 98765 43210",
    "0091 98765 43210",
    "091 9876543210",
    "98765.43210",
    " 98765 43210 ",
    "tel:+919876543210",
    "९८७६५४३२१०", // Devanagari digits
    "٩٨٧٦٥٤٣٢١٠", // Arabic-Indic digits
    "９８７６５４３２１０", // full-width digits
    9876543210, // a number, not a string (JSON / spreadsheets)
  ])("%s", (raw) => expect(ok(raw)).toBe("+919876543210"));

  it("all numbers starting 6-9 are accepted, 0-5 are not", () => {
    for (const d of "6789") expect(ok(`${d}123456789`)).toBe(`+91${d}123456789`);
    for (const d of "012345") expect(ok(`${d}123456789`)).toBe("ERR:PHONE_INVALID");
  });
});

describe("normalizePhone: rejections carry a reason", () => {
  it.each([null, undefined, "", "   "])("missing: %j", (raw) =>
    expect(ok(raw)).toBe("ERR:PHONE_MISSING"),
  );

  it.each([
    "12345",
    "98765 4321", // 9 digits
    "98765432101", // 11 digits not starting with 0
    "+91 12345 67890", // +91 but not a mobile
    "abcdefghij",
    "98765-43210x",
    "9999999999", // all identical digits (typical fake)
    "+919999999999",
    "0000000000",
    "9.19876543E+11", // Excel scientific notation
    "022 2345 6789", // landline with STD code
  ])("invalid: %s", (raw) => expect(ok(raw)).toBe("ERR:PHONE_INVALID"));
});

describe("normalizePhone: other countries need an explicit +", () => {
  it("accepts a plausible international number", () => {
    expect(ok("+971 50 123 4567")).toBe("+971501234567");
    expect(ok("0044 7911 123456")).toBe("+447911123456");
  });
  it("rejects lengths outside 8-15 digits and leading zero after +", () => {
    expect(ok("+1234567")).toBe("ERR:PHONE_INVALID");
    expect(ok("+1234567890123456")).toBe("ERR:PHONE_INVALID");
    expect(ok("+0123456789")).toBe("ERR:PHONE_INVALID");
  });
  it("is idempotent: normalising an E.164 value returns it unchanged", () => {
    for (const v of ["+919876543210", "+971501234567"]) expect(ok(v)).toBe(v);
  });
});

describe("normalizeEmail", () => {
  it("lower-cases and trims", () =>
    expect(normalizeEmail("  Nina@Example.COM ")).toBe("nina@example.com"));
  it("returns null for junk instead of throwing", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "   ",
      "nina",
      "nina@",
      "@example.com",
      "a b@c.com",
      "a@b",
      "a@b..com",
      `${"x".repeat(250)}@a.com`,
    ]) {
      expect(normalizeEmail(bad), String(bad)).toBeNull();
    }
  });
});
