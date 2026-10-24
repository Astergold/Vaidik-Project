import type { MessageStatus, WhatsappMessage } from "@vernacular/contracts";
import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** One WhatsApp bubble (D5-I4-02): inbound left, outbound right with its delivery tick. Text only, never HTML. */
export const STATUS_LABEL: Record<MessageStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
};

export function StatusTick({ status }: { status: MessageStatus }) {
  const label = STATUS_LABEL[status];
  const cls = "size-3.5 shrink-0";
  const icon =
    status === "queued" ? (
      <Clock className={cls} aria-hidden />
    ) : status === "sent" ? (
      <Check className={cls} aria-hidden />
    ) : status === "failed" ? (
      <AlertCircle className={cn(cls, "text-destructive")} aria-hidden />
    ) : (
      <CheckCheck className={cn(cls, status === "read" && "text-primary")} aria-hidden />
    );
  return (
    <span className="inline-flex items-center" title={label} role="img" aria-label={label}>
      {icon}
    </span>
  );
}

const SENDER: Record<"user" | "ai" | "system", string> = {
  user: "Counsellor",
  ai: "AI agent",
  system: "Automatic",
};

export function MessageBubble({ message: m, tz }: { message: WhatsappMessage; tz: string }) {
  const out = m.direction === "outbound";
  return (
    <li className={cn("flex", out ? "justify-end" : "justify-start")}>
      <article
        aria-label={`${out ? "Sent" : "Received"} ${formatDateTime(m.createdAt, tz)}`}
        className={cn(
          "max-w-[85%] min-w-0 rounded-lg border px-3 py-2 text-sm sm:max-w-[75%]",
          out ? "rounded-br-sm bg-accent text-accent-foreground" : "rounded-bl-sm bg-card",
          m.status === "failed" && "border-destructive/50",
        )}
      >
        {m.template && (
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Template · {m.template.name}
          </p>
        )}
        <p className="break-words whitespace-pre-wrap">{m.body}</p>
        <p className="mt-1 flex flex-wrap items-center justify-end gap-1.5 text-xs text-muted-foreground">
          {out && m.sentBy && <span>{m.sentBy.name ?? SENDER[m.sentBy.kind]} ·</span>}
          <time dateTime={m.createdAt}>{formatDateTime(m.createdAt, tz)}</time>
          {out && <StatusTick status={m.status} />}
        </p>
        {m.status === "failed" && m.failureReason && (
          <p className="mt-1 text-xs text-destructive">{m.failureReason}</p>
        )}
      </article>
    </li>
  );
}
