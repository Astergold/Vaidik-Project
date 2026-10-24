import { describe, expect, it } from "vitest";
import { collapseWs, highlightQuotes } from "@/features/review/highlight";

const text = (segs: ReturnType<typeof highlightQuotes>["segments"]) =>
  segs.map((s) => s.text).join("");
const marked = (segs: ReturnType<typeof highlightQuotes>["segments"]) =>
  segs.filter((s) => s.labels.length > 0).map((s) => s.text);

describe("quote highlighting (same rule as crm.norm_ws)", () => {
  const transcript =
    "Agent: Hello!  Is this Asha?\nStudent:   Yes, I am  very interested\nin B.Tech.";

  it("collapses whitespace like the DB", () => {
    expect(collapseWs("  a \n\t b  ")).toBe("a b");
  });

  it("finds an exact substring after whitespace collapse, keeping the original text intact", () => {
    const r = highlightQuotes(transcript, [
      { quote: "I am very interested in B.Tech", label: "temperature" },
    ]);
    expect(text(r.segments)).toBe(transcript); // nothing lost or reformatted
    expect(marked(r.segments)).toEqual(["I am  very interested\nin B.Tech"]);
    expect(r.notFound).toEqual([]);
  });

  it("a quote with extra spaces/newlines still matches", () => {
    const r = highlightQuotes(transcript, [{ quote: "  Is   this\nAsha? ", label: "objection" }]);
    expect(marked(r.segments)).toEqual(["Is this Asha?"]);
  });

  it("is case-sensitive, like the DB", () => {
    const r = highlightQuotes(transcript, [{ quote: "is this asha", label: "x" }]);
    expect(r.notFound).toEqual(["is this asha"]);
    expect(marked(r.segments)).toEqual([]);
  });

  it("a quote that isn't in the transcript is reported, never thrown", () => {
    const r = highlightQuotes(transcript, [{ quote: "I will pay the fee", label: "temperature" }]);
    expect(r.notFound).toEqual(["I will pay the fee"]);
    expect(text(r.segments)).toBe(transcript);
    expect(() => highlightQuotes(null, [{ quote: "x", label: "y" }])).not.toThrow();
    expect(highlightQuotes(null, [{ quote: "x", label: "y" }]).segments).toEqual([]);
  });

  it("overlapping and duplicate quotes produce valid, ordered, non-overlapping segments", () => {
    const r = highlightQuotes(transcript, [
      { quote: "very interested in B.Tech", label: "temperature" },
      { quote: "I am very interested", label: "objection" },
      { quote: "I am very interested", label: "objection" },
    ]);
    expect(text(r.segments)).toBe(transcript);
    const hi = r.segments.filter((s) => s.labels.length);
    expect(hi.map((s) => s.text).join("")).toBe("I am  very interested\nin B.Tech");
    expect(hi.some((s) => s.labels.includes("temperature") && s.labels.includes("objection"))).toBe(
      true,
    );
  });

  it("HTML-looking text is plain data (rendering is text nodes)", () => {
    const r = highlightQuotes("He said <script>alert(1)</script> ok", [
      { quote: "<script>alert(1)</script>", label: "x" },
    ]);
    expect(marked(r.segments)).toEqual(["<script>alert(1)</script>"]);
  });

  it("empty or whitespace-only quotes are ignored", () => {
    expect(highlightQuotes(transcript, [{ quote: "   ", label: "x" }])).toEqual({
      segments: [{ text: transcript, labels: [] }],
      notFound: [],
    });
  });
});
