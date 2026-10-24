/**
 * Highlight the AI's verbatim quotes in a transcript (D4-I4-01).
 *
 * Same matching rule the database validates quotes with (crm.norm_ws, data-model.md rule 6): a quote must be a
 * case-sensitive exact substring of transcript_text after collapsing whitespace (`\s+` → " ", trimmed) on both
 * sides. We match on the collapsed text and map the match back to the original characters, so the transcript is
 * shown exactly as stored. Output is plain segments rendered as React text — never HTML.
 */
export const collapseWs = (s: string) => s.replace(/\s+/g, " ").trim();

export interface Segment {
  text: string;
  /** Labels of the quotes covering this segment (empty = not highlighted). */
  labels: string[];
}
export interface HighlightResult {
  segments: Segment[];
  /** Quotes (as given) that aren't in the transcript under the rule above. */
  notFound: string[];
}

export function highlightQuotes(
  transcript: string | null | undefined,
  quotes: readonly { quote: string; label: string }[],
): HighlightResult {
  if (!transcript) return { segments: [], notFound: [] };

  // Collapsed text + map from each collapsed char to its original index.
  let collapsed = "";
  const origIdx: number[] = [];
  let inWs = false;
  for (let i = 0; i < transcript.length; i++) {
    const ch = transcript[i]!;
    if (/\s/.test(ch)) {
      inWs = true;
      continue;
    }
    if (inWs && collapsed.length > 0) {
      collapsed += " ";
      origIdx.push(i - 1); // the space stands for the whitespace run before this char
    }
    inWs = false;
    collapsed += ch;
    origIdx.push(i);
  }

  const ranges: { start: number; end: number; label: string }[] = [];
  const notFound: string[] = [];
  for (const { quote, label } of quotes) {
    const q = collapseWs(quote);
    if (!q) continue;
    const at = collapsed.indexOf(q);
    if (at < 0) {
      if (!notFound.includes(quote)) notFound.push(quote);
      continue;
    }
    // first occurrence only: a quote is evidence for one moment in the call
    const start = firstOrigOfRun(transcript, origIdx, at);
    const end = origIdx[at + q.length - 1]! + 1;
    ranges.push({ start, end, label });
  }

  // Split the transcript at every range boundary; each piece carries the labels covering it.
  const cuts = new Set<number>([0, transcript.length]);
  for (const r of ranges) {
    cuts.add(r.start);
    cuts.add(r.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k]!;
    const b = points[k + 1]!;
    const labels = [
      ...new Set(ranges.filter((r) => r.start <= a && r.end >= b).map((r) => r.label)),
    ];
    const prev = segments[segments.length - 1];
    const text = transcript.slice(a, b);
    if (prev && sameLabels(prev.labels, labels)) prev.text += text;
    else segments.push({ text, labels });
  }
  return { segments, notFound };
}

/** A match starting on a collapsed space starts at the beginning of that whitespace run in the original. */
function firstOrigOfRun(original: string, origIdx: number[], collapsedPos: number): number {
  let i = origIdx[collapsedPos]!;
  if (/\s/.test(original[i] ?? "")) while (i > 0 && /\s/.test(original[i - 1]!)) i--;
  return i;
}

const sameLabels = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));
