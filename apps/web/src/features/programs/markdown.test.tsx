import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseInline, parseMarkdown } from "@/features/programs/markdown";
import { MarkdownView } from "@/features/programs/MarkdownView";

describe("KB markdown (D4-I4-03)", () => {
  it("headings, paragraphs and lists", () => {
    expect(
      parseMarkdown("# Hostel\n\nRooms are **shared**.\n\n- Wi-Fi\n- Mess\n\n1. Apply\n2. Pay"),
    ).toEqual([
      { t: "h", level: 1, c: [{ t: "text", v: "Hostel" }] },
      {
        t: "p",
        c: [
          { t: "text", v: "Rooms are " },
          { t: "strong", c: [{ t: "text", v: "shared" }] },
          { t: "text", v: "." },
        ],
      },
      { t: "ul", items: [[{ t: "text", v: "Wi-Fi" }], [{ t: "text", v: "Mess" }]] },
      { t: "ol", items: [[{ t: "text", v: "Apply" }], [{ t: "text", v: "Pay" }]] },
    ]);
  });

  it("bold, italic, code and safe links", () => {
    expect(parseInline("*soon* `code` [site](https://mitadt.edu.in)")).toEqual([
      { t: "em", c: [{ t: "text", v: "soon" }] },
      { t: "text", v: " " },
      { t: "code", v: "code" },
      { t: "text", v: " " },
      { t: "link", href: "https://mitadt.edu.in", c: [{ t: "text", v: "site" }] },
    ]);
  });

  it("unsafe link schemes stay as text", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([
      { t: "text", v: "[x](javascript:alert(1))" },
    ]);
  });

  it("raw HTML in the body is escaped text, never markup", () => {
    const html = renderToStaticMarkup(
      <MarkdownView
        source={'Hi <script>alert(1)</script> <img src=x onerror="alert(1)"> **ok**'}
      />,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<strong>ok</strong>");
  });

  it("links open safely", () => {
    const html = renderToStaticMarkup(<MarkdownView source="[fees](https://x.example/fees)" />);
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
