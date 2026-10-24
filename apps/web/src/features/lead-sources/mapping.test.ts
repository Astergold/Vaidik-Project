import { describe, expect, it } from "vitest";
import { fromDraft, parsePayload, SAMPLE_PAYLOAD, toDraft } from "@/features/lead-sources/mapping";

describe("field-mapping editor model (D3-I4-03)", () => {
  it("round-trips every mapping value shape", () => {
    const m = {
      full_name: ["lead.first", "lead.last"],
      phone: "contact.mobile",
      city: { const: "Pune" },
      consent_channels: ["voice", "whatsapp"] as ("voice" | "whatsapp")[],
    };
    const d = toDraft(m);
    expect(d.rows.find((r) => r.field === "full_name")).toEqual({
      field: "full_name",
      mode: "path",
      text: "lead.first, lead.last",
    });
    expect(d.rows.find((r) => r.field === "city")).toEqual({
      field: "city",
      mode: "const",
      text: "Pune",
    });
    expect(fromDraft(d)).toEqual({ ok: true, mapping: m });
  });

  it("empty mapping = default recognition, and the default voice channel isn't stored", () => {
    expect(fromDraft(toDraft({}))).toEqual({ ok: true, mapping: {} });
  });

  it("trims, drops empty paths, and rejects paths with spaces", () => {
    const d = toDraft({});
    d.rows.find((r) => r.field === "phone")!.text = "  data.phone ,  ";
    expect(fromDraft(d)).toEqual({ ok: true, mapping: { phone: "data.phone" } });
    d.rows.find((r) => r.field === "email")!.text = "contact email";
    const bad = fromDraft(d);
    expect(!bad.ok && bad.errors.email).toMatch(/spaces/);
  });

  it("needs at least one consent channel", () => {
    const d = toDraft({});
    d.consentChannels = { voice: false, whatsapp: false };
    const r = fromDraft(d);
    expect(!r.ok && r.errors.consent_channels).toBe("Pick at least one channel");
  });
});

describe("test payload box", () => {
  it("accepts a JSON object only", () => {
    expect(parsePayload(SAMPLE_PAYLOAD).ok).toBe(true);
    expect(parsePayload("[1,2]")).toEqual({
      ok: false,
      error: expect.stringMatching(/JSON object/),
    });
    expect(parsePayload("{ nope")).toEqual({
      ok: false,
      error: expect.stringMatching(/Not valid JSON/),
    });
    expect(parsePayload("null").ok).toBe(false);
  });
});

describe("CSV mode (D3-I4-03b): a path is one exact column header", () => {
  const columns = ["Student Name", "Mobile No", "E-mail"];

  it("accepts headers with spaces and round-trips through toDraft", () => {
    const d = toDraft({});
    d.rows.find((r) => r.field === "full_name")!.text = "Student Name";
    d.rows.find((r) => r.field === "phone")!.text = "Mobile No";
    d.rows.find((r) => r.field === "city")!.mode = "const";
    d.rows.find((r) => r.field === "city")!.text = "Pune";
    const r = fromDraft(d, { columns });
    expect(r).toEqual({
      ok: true,
      mapping: { full_name: "Student Name", phone: "Mobile No", city: { const: "Pune" } },
    });
    expect(r.ok && fromDraft(toDraft(r.mapping), { columns })).toEqual(r);
  });

  it("a mapping that names a column the file doesn't have is an error (e.g. a webhook dot-path)", () => {
    const d = toDraft({ phone: "contact.mobile" });
    const r = fromDraft(d, { columns });
    expect(!r.ok && r.errors.phone).toBe('"contact.mobile" isn\'t a column in this file');
  });

  it("raw values are never touched client-side: the mapping only names columns", () => {
    const d = toDraft({});
    d.rows.find((r) => r.field === "phone")!.text = "Mobile No";
    const r = fromDraft(d, { columns });
    expect(JSON.stringify(r)).not.toMatch(/\+91/);
  });
});
