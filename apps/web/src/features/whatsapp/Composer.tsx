import { useState } from "react";
import type { SendMessageResponse, WhatsappTemplate } from "@vernacular/contracts";
import { Ban, Clock, FileText, Loader2, Send } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { LANGUAGES } from "@/features/agents/AgentsPage";
import { describeRejection } from "@/features/lead360/reject-codes";
import type { flattenMessages } from "@/features/whatsapp/messaging-api";
import { useSendMessage, useTemplates } from "@/features/whatsapp/messaging-api";
import {
  initialValues,
  languagesOf,
  missingVariables,
  templateSegments,
} from "@/features/whatsapp/template-preview";
import { isMissingRoute } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Gate = ReturnType<typeof flattenMessages>;
const languageName = (code: string) => LANGUAGES.find(([c]) => c === code)?.[1] ?? code;

/** A policy block (typed code) as the UI shows it: what happened, why, and when to retry. */
function Rejection({ r }: { r: NonNullable<SendMessageResponse["rejection"]> }) {
  const tz = useTenantTimeZone();
  const v = describeRejection(r.code, r.retryAt, tz);
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <p className="font-medium">Message not sent · {v.title}</p>
      <p className="text-muted-foreground">{v.detail}</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {v.code}
        {v.retry && ` · ${v.retry}`}
      </p>
    </div>
  );
}

/**
 * Send controls under the conversation (D5-I4-02). Gated only by what the server said: `suppression` blocks
 * everything; free text needs `freeTextAllowed` (the server's 24 h window); templates are always offered otherwise.
 */
export function Composer({ leadId, gate }: { leadId: string; gate: Gate }) {
  const tz = useTenantTimeZone();
  const send = useSendMessage(leadId);
  const [text, setText] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const blocked = gate.suppression !== null;
  const canFreeText = gate.freeTextAllowed && !blocked;
  const rejection = send.data?.rejection;

  const submit = () =>
    send.mutate({ leadId, kind: "text", text }, { onSuccess: (r) => r.message && setText("") });

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      {blocked ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Ban className="size-4 shrink-0" aria-hidden /> Sending is blocked for this number.
        </p>
      ) : canFreeText ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3.5 shrink-0" aria-hidden />
          Free-text window open
          {gate.freeTextWindowEndsAt && ` until ${formatDateTime(gate.freeTextWindowEndsAt, tz)}`}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Clock className="size-4 shrink-0" aria-hidden />
          The 24-hour reply window is closed. Send an approved template to restart the conversation.
        </p>
      )}
      <Label htmlFor={`compose-${leadId}`} className="sr-only">
        Message
      </Label>
      <Textarea
        id={`compose-${leadId}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!canFreeText || send.isPending}
        placeholder={canFreeText ? "Type a reply…" : "Free text is unavailable right now"}
        maxLength={4096}
        rows={3}
      />
      {rejection && <Rejection r={rejection} />}
      {send.isError && (
        <FormAlert>
          {isMissingRoute(send.error)
            ? "Sending WhatsApp messages isn't available yet."
            : errText(send.error, "Couldn't send the message.")}
        </FormAlert>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={blocked}
          onClick={() => setTemplateOpen(true)}
        >
          <FileText /> Send template
        </Button>
        <Button
          size="sm"
          disabled={!canFreeText || !text.trim() || send.isPending}
          onClick={submit}
        >
          {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
          Send
        </Button>
      </div>
      {templateOpen && (
        <SendTemplateDialog leadId={leadId} onClose={() => setTemplateOpen(false)} />
      )}
    </div>
  );
}

/** Pick an approved template, fill its variables (pre-filled from the lead), watch the preview, send. */
export function SendTemplateDialog({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const templates = useTemplates(leadId, true);
  const send = useSendMessage(leadId);
  const [language, setLanguage] = useState<string>("");
  const [picked, setPicked] = useState<WhatsappTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const approved = templates.data?.items.filter((t) => t.status === "approved") ?? [];
  const languages = languagesOf(approved);
  const shown = approved.filter((t) => !language || t.language === language);
  const missing = picked ? missingVariables(picked, values) : [];
  const choose = (id: string) => {
    const t = approved.find((x) => x.id === id) ?? null;
    setPicked(t);
    setValues(t ? initialValues(t) : {});
    send.reset();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Send a WhatsApp template</DialogTitle>
        <DialogDescription>
          Approved templates can be sent any time; the student&apos;s reply opens a 24-hour window
          for free text.
        </DialogDescription>
        {templates.isPending ? (
          <Skeleton className="h-24 w-full" aria-busy="true" aria-label="Loading templates" />
        ) : templates.isError ? (
          <FormAlert>
            {isMissingRoute(templates.error)
              ? "WhatsApp templates aren't available yet."
              : errText(templates.error, "Couldn't load templates.")}
          </FormAlert>
        ) : approved.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No approved templates yet. An admin can sync them in Settings → WhatsApp.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-language">Language</Label>
                <select
                  id="tpl-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="h-9 w-full rounded-md border bg-card px-2 text-sm"
                >
                  <option value="">All</option>
                  {languages.map((l) => (
                    <option key={l} value={l}>
                      {languageName(l)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="tpl-template">Template</Label>
                <select
                  id="tpl-template"
                  value={picked?.id ?? ""}
                  onChange={(e) => choose(e.target.value)}
                  className="h-9 w-full rounded-md border bg-card px-2 text-sm"
                >
                  <option value="">Choose a template…</option>
                  {shown.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({languageName(t.language)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {picked && (
              <>
                {picked.variables.map((v) => (
                  <div key={v.key} className="space-y-1.5">
                    <Label htmlFor={`tpl-var-${v.key}`}>
                      {v.label} <span className="text-muted-foreground">{`{{${v.key}}}`}</span>
                    </Label>
                    <Input
                      id={`tpl-var-${v.key}`}
                      value={values[v.key] ?? ""}
                      onChange={(e) => setValues({ ...values, [v.key]: e.target.value })}
                      maxLength={1000}
                      aria-invalid={missing.includes(v.key) || undefined}
                    />
                  </div>
                ))}
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Preview</p>
                  <p
                    aria-label="Template preview"
                    className="rounded-lg rounded-br-sm border bg-accent px-3 py-2 text-sm break-words whitespace-pre-wrap text-accent-foreground"
                  >
                    {templateSegments(picked.body, values).map((s, i) =>
                      s.kind === "text" ? (
                        <span key={i}>{s.text}</span>
                      ) : (
                        <span
                          key={i}
                          className={cn(
                            "rounded px-0.5",
                            s.value ? "font-medium" : "bg-warning/30 text-warning-foreground",
                          )}
                        >
                          {s.value ||
                            `[${picked.variables.find((v) => v.key === s.key)?.label ?? `{{${s.key}}}`}]`}
                        </span>
                      ),
                    )}
                  </p>
                </div>
              </>
            )}
            {send.data?.rejection && <Rejection r={send.data.rejection} />}
            {send.isError && (
              <FormAlert>{errText(send.error, "Couldn't send the template.")}</FormAlert>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={send.isPending}>
            Cancel
          </Button>
          <Button
            disabled={!picked || missing.length > 0 || send.isPending}
            onClick={() =>
              picked &&
              send.mutate(
                { leadId, kind: "template", templateId: picked.id, variables: values },
                {
                  onSuccess: (r) => {
                    if (!r.message) return;
                    toast({
                      title: "Template queued",
                      description: "It will appear with its delivery status.",
                    });
                    onClose();
                  },
                },
              )
            }
          >
            {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            Send template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
