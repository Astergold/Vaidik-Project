import { describe, expect, it } from "vitest";
import {
  applyMapping,
  bearerToken,
  generateSourceToken,
  getPath,
  hashToken,
  tokenMatches,
} from "../src/modules/intake/mapping.js";

describe("getPath", () => {
  const obj = { a: { b: [{ c: "x" }, { c: "y" }] }, "top level": 1, n: null };
  it("reads dot, bracket and $-prefixed paths", () => {
    expect(getPath(obj, "a.b[1].c")).toBe("y");
    expect(getPath(obj, "$.a.b[0].c")).toBe("x");
    expect(getPath(obj, "a.b.0.c")).toBe("x");
  });
  it("returns undefined for missing paths instead of throwing", () => {
    expect(getPath(obj, "a.z.c")).toBeUndefined();
    expect(getPath(obj, "n.x")).toBeUndefined();
    expect(getPath(obj, "")).toBeUndefined();
  });
  it("cannot reach prototypes or inherited properties (no injection through a mapping)", () => {
    for (const p of [
      "__proto__",
      "a.__proto__",
      "constructor",
      "constructor.prototype",
      "a.constructor.name",
      "toString",
      "hasOwnProperty",
    ]) {
      expect(getPath(obj, p), p).toBeUndefined();
    }
  });
});

describe("applyMapping: explicit mapping", () => {
  const payload = {
    lead: {
      name: "Ravi  Kumar",
      mobile: "98765 43210",
      mail: "RAVI@Example.com",
      course: "B.Tech",
      lang: "Hindi",
      id: 7788,
    },
    agree: "yes",
  };
  it("maps paths, normalises phone/email/language, keeps provider id as text", () => {
    const r = applyMapping(payload, {
      full_name: "lead.name",
      phone: "lead.mobile",
      email: "lead.mail",
      program: "lead.course",
      language: "lead.lang",
      external_id: "lead.id",
      consent: "agree",
    });
    expect(r.ok).toBe(true);
    expect(r.mapped).toMatchObject({
      fullName: "Ravi Kumar",
      phone: "+919876543210",
      email: "ravi@example.com",
      program: "B.Tech",
      language: "hi",
      externalId: "7788",
      consent: true,
    });
  });
  it("joins several paths and supports constants", () => {
    const r = applyMapping(
      { f: "Ravi", l: "Kumar", p: "9876543210" },
      { full_name: ["f", "l"], phone: "p", state: { const: "Maharashtra" } },
    );
    expect(r.mapped).toMatchObject({ fullName: "Ravi Kumar", state: "Maharashtra" });
  });
  it("an explicitly mapped path that is empty does NOT fall back to guessing", () => {
    const r = applyMapping(
      { phone: "9876543210", name: "Guess Me", my_name: "" },
      { full_name: "my_name", phone: "phone" },
    );
    expect(r.mapped!.fullName).toBeNull();
  });
  it("external_id is never auto-detected", () => {
    expect(applyMapping({ phone: "9876543210", id: "5" }, {}).mapped!.externalId).toBeNull();
  });
});

describe("applyMapping: simple forms work with no mapping at all", () => {
  it("finds common field names case-insensitively", () => {
    const r = applyMapping(
      { Name: "Asha", Mobile: "09876543210", Email: "a@b.co", City: "Pune", Course: "MBA" },
      {},
    );
    expect(r.mapped).toMatchObject({
      fullName: "Asha",
      phone: "+919876543210",
      email: "a@b.co",
      city: "Pune",
      program: "MBA",
    });
  });
  it("builds a name from first_name + last_name", () => {
    expect(
      applyMapping({ first_name: "Asha", last_name: "Rao", phone: "9876543210" }, {}).mapped!
        .fullName,
    ).toBe("Asha Rao");
  });
});

describe("applyMapping: validation and consent", () => {
  it("missing / invalid phone is an error with a reason code and no mapped data", () => {
    expect(applyMapping({ name: "x" }, {})).toMatchObject({
      ok: false,
      mapped: null,
      errors: [{ path: "phone", message: "PHONE_MISSING" }],
    });
    expect(applyMapping({ phone: "12345" }, {})).toMatchObject({
      ok: false,
      errors: [{ path: "phone", message: "PHONE_INVALID" }],
    });
  });
  it("a bad email is dropped with a warning, the lead is still accepted", () => {
    const r = applyMapping({ phone: "9876543210", email: "nope" }, {});
    expect(r.ok).toBe(true);
    expect(r.mapped!.email).toBeNull();
    expect(r.warnings).toContain("EMAIL_INVALID");
  });
  it("consent: absent = the submit counts; explicit no = false; unknown wording = false + warning", () => {
    expect(applyMapping({ phone: "9876543210" }, {}).mapped!.consent).toBe(true);
    expect(applyMapping({ phone: "9876543210" }, { consent: "c" }).mapped!.consent).toBe(true); // mapped but field absent
    for (const v of ["no", "false", "0", "NO"])
      expect(applyMapping({ phone: "9876543210", c: v }, { consent: "c" }).mapped!.consent, v).toBe(
        false,
      );
    for (const v of ["yes", "true", "1", "On", "I agree"])
      expect(applyMapping({ phone: "9876543210", c: v }, { consent: "c" }).mapped!.consent, v).toBe(
        true,
      );
    const unk = applyMapping({ phone: "9876543210", c: "maybe later" }, { consent: "c" });
    expect(unk.mapped!.consent).toBe(false);
    expect(unk.warnings).toContain("CONSENT_UNRECOGNISED");
  });
  it("consent channels default to voice only", () => {
    expect(applyMapping({ phone: "9876543210" }, {}).mapped!.consentChannels).toEqual(["voice"]);
    expect(
      applyMapping({ phone: "9876543210" }, { consent_channels: ["voice", "whatsapp"] }).mapped!
        .consentChannels,
    ).toEqual(["voice", "whatsapp"]);
  });
  it("strips control characters, collapses whitespace and caps lengths", () => {
    const r = applyMapping(
      { phone: "9876543210", name: `  A\u0000\u0007b\n\tc  ${"x".repeat(500)}` },
      {},
    );
    expect(r.mapped!.fullName).toMatch(/^A b c x+$/);
    expect(r.mapped!.fullName!.length).toBeLessThanOrEqual(200);
  });
  it("objects/arrays are never stringified into fields", () => {
    expect(
      applyMapping({ phone: "9876543210", name: { evil: 1 } }, {}).mapped!.fullName,
    ).toBeNull();
  });
  it("unrecognised language is dropped with a warning", () => {
    const r = applyMapping({ phone: "9876543210", language: "Klingon" }, {});
    expect(r.mapped!.language).toBeNull();
    expect(r.warnings).toContain("LANGUAGE_UNRECOGNISED");
  });
});

describe("source tokens", () => {
  it("are unguessable, prefixed, and verify in constant time", () => {
    const t = generateSourceToken();
    expect(t).toMatch(/^vk_src_[A-Za-z0-9_-]{43}$/);
    expect(generateSourceToken()).not.toBe(t);
    expect(tokenMatches(t, hashToken(t))).toBe(true);
    expect(tokenMatches(t + "x", hashToken(t))).toBe(false);
    expect(tokenMatches(undefined, hashToken(t))).toBe(false);
    expect(tokenMatches(t, null)).toBe(false); // source with no token can never authenticate
    expect(tokenMatches("", "")).toBe(false);
  });
  it("only the hash is stored (64 hex chars, not the token)", () => {
    const t = generateSourceToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });
  it("parses Authorization: Bearer", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer abc")).toBe("abc");
    for (const bad of [undefined, "", "Basic abc", "Bearer", "Bearer a b"])
      expect(bearerToken(bad as string)).toBeUndefined();
  });
});
