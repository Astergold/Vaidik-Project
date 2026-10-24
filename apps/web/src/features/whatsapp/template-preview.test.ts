import { describe, expect, it } from "vitest";
import { whatsappTemplate } from "@vernacular/contracts";
import {
  initialValues,
  languagesOf,
  missingVariables,
  templateSegments,
} from "@/features/whatsapp/template-preview";

const t = whatsappTemplate.parse({
  id: "01a14679-0000-7000-8000-0000000003a1",
  name: "visit_reminder",
  language: "en",
  category: "utility",
  body: "Hi {{1}}, your campus visit for {{2}} is on {{3}}. {{1}}, reply STOP to opt out.",
  status: "approved",
  variables: [
    { key: "1", label: "Student name", field: "first_name", defaultValue: "Asha" },
    { key: "2", label: "Program", field: "program", defaultValue: null },
    { key: "3", label: "Visit date", field: null, defaultValue: null },
  ],
});

describe("template preview (D5-I4-02)", () => {
  it("splits text and variables, repeating a variable everywhere it appears", () => {
    const seg = templateSegments(t.body, { "1": "Asha", "2": " B.Des " });
    expect(seg[0]).toEqual({ kind: "text", text: "Hi " });
    expect(seg.filter((s) => s.kind === "var")).toEqual([
      { kind: "var", key: "1", value: "Asha" },
      { kind: "var", key: "2", value: "B.Des" },
      { kind: "var", key: "3", value: "" },
      { kind: "var", key: "1", value: "Asha" },
    ]);
    expect(seg.at(-1)).toEqual({ kind: "text", text: ", reply STOP to opt out." });
  });

  it("pre-fills from the server's lead defaults and lists what's missing", () => {
    const v = initialValues(t);
    expect(v).toEqual({ "1": "Asha", "2": "", "3": "" });
    expect(missingVariables(t, v)).toEqual(["2", "3"]);
    expect(missingVariables(t, { ...v, "2": "B.Des", "3": "  " })).toEqual(["3"]);
  });

  it("a body with no placeholders is one text segment; languages are unique and sorted", () => {
    expect(templateSegments("Thanks!", {})).toEqual([{ kind: "text", text: "Thanks!" }]);
    expect(languagesOf([t, { ...t, language: "hi" }, t])).toEqual(["en", "hi"]);
  });
});
