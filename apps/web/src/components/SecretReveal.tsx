import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Read-only value with a copy button. When the clipboard API is blocked (no focus, old browser, policy),
 * the text is selected and the user is told to press Ctrl+C — never a silent failure.
 */
export function CopyField({ label, value, id }: { label: string; value: string; id: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      const el = document.getElementById(id);
      if (el instanceof HTMLInputElement) {
        el.focus();
        el.select();
      }
      setState("manual");
    }
  };
  const copied = state === "copied";
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          readOnly
          value={value}
          className="min-w-0 font-mono text-xs"
          onFocus={(e) => e.target.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copy()}
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {state === "manual" && (
        <p role="status" className="text-xs text-muted-foreground">
          Selected — press Ctrl+C (⌘C on Mac) to copy.
        </p>
      )}
    </div>
  );
}

/**
 * A secret shown exactly once (lead-source token, API key, webhook signing secret). It lives only in this
 * component's props: never cached, refetched or shown again. The user must confirm before it disappears.
 */
export function SecretReveal({
  noun,
  lostHint,
  fields,
  example,
  onDone,
}: {
  /** "token", "API key", "signing secret". */
  noun: string;
  /** What to do if it's lost. */
  lostHint: string;
  fields: { id: string; label: string; value: string }[];
  example?: { label: string; code: string };
  onDone: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-warning bg-warning/15 p-3 text-sm">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
        <p>
          <span className="font-medium">Copy the {noun} now — you won&apos;t see it again.</span>{" "}
          {lostHint}
        </p>
      </div>
      {fields.map((f) => (
        <CopyField key={f.id} {...f} />
      ))}
      {example && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            {example.label}
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">{example.code}</pre>
        </details>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I&apos;ve copied the {noun} somewhere safe
      </label>
      <Button className="w-full" disabled={!confirmed} onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
