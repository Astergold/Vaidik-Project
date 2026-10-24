import type { ReactNode } from "react";
import { parseMarkdown, type Inline } from "@/features/programs/markdown";

/** Renders the KB Markdown AST as React elements — text nodes only, no HTML strings. */
export function MarkdownView({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  if (blocks.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>;
  return (
    <div className="space-y-3 text-sm leading-relaxed break-words">
      {blocks.map((b, i) => {
        if (b.t === "h") {
          const cls =
            b.level === 1
              ? "text-lg font-semibold"
              : b.level === 2
                ? "text-base font-semibold"
                : "font-semibold";
          return b.level === 1 ? (
            <h1 key={i} className={cls}>
              {inl(b.c)}
            </h1>
          ) : b.level === 2 ? (
            <h2 key={i} className={cls}>
              {inl(b.c)}
            </h2>
          ) : (
            <h3 key={i} className={cls}>
              {inl(b.c)}
            </h3>
          );
        }
        if (b.t === "p") return <p key={i}>{inl(b.c)}</p>;
        const items = b.items.map((it, j) => <li key={j}>{inl(it)}</li>);
        return b.t === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {items}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-1 pl-5">
            {items}
          </ol>
        );
      })}
    </div>
  );
}

function inl(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return n.v;
      case "strong":
        return <strong key={i}>{inl(n.c)}</strong>;
      case "em":
        return <em key={i}>{inl(n.c)}</em>;
      case "code":
        return (
          <code key={i} className="rounded bg-muted px-1 py-0.5 text-xs">
            {n.v}
          </code>
        );
      case "link":
        return (
          <a
            key={i}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {inl(n.c)}
          </a>
        );
    }
  });
}
