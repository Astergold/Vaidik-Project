/**
 * A tiny, dependency-free Markdown → AST parser for the KB preview (D4-I4-03).
 * Supported: # / ## / ### headings, paragraphs, - / * bullet lists, 1. numbered lists, **bold**, *italic*,
 * `inline code`, [links](url) (http/https/mailto only). The AST is rendered as React elements by
 * MarkdownView, so raw HTML in an article is text — it is never parsed or executed.
 */
export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };
export type Block =
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] };

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^`([^`]+)`/))) {
      flush();
      out.push({ t: "code", v: m[1]! });
    } else if ((m = rest.match(/^\*\*(.+?)\*\*/))) {
      flush();
      out.push({ t: "strong", c: parseInline(m[1]!) });
    } else if ((m = rest.match(/^\*([^*\s][^*]*?)\*/))) {
      flush();
      out.push({ t: "em", c: parseInline(m[1]!) });
    } else if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/)) && SAFE_URL.test(m[2]!)) {
      flush();
      out.push({ t: "link", href: m[2]!, c: parseInline(m[1]!) });
    } else {
      // Plain character — including any "[x](javascript:…)" whose scheme isn't safe: it stays text.
      buf += s[i];
      i += 1;
      continue;
    }
    i += m[0].length;
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: Inline[][] } | null = null;
  const endPara = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join(" ")) });
    para = [];
  };
  const endList = () => {
    if (list) blocks.push({ t: list.kind, items: list.items });
    list = null;
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (!line.trim()) {
      endPara();
      endList();
    } else if (h) {
      endPara();
      endList();
      const n = h[1]!.length;
      blocks.push({ t: "h", level: n === 1 ? 1 : n === 2 ? 2 : 3, c: parseInline(h[2]!) });
    } else if (ul || ol) {
      endPara();
      const kind = ul ? "ul" : "ol";
      if (!list || list.kind !== kind) {
        endList();
        list = { kind, items: [] };
      }
      list.items.push(parseInline((ul ?? ol)![1]!));
    } else {
      endList();
      para.push(line.trim());
    }
  }
  endPara();
  endList();
  return blocks;
}
