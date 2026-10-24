import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errText } from "@/lib/seam";

/**
 * Confirm an action that needs a written, audit-logged reason (suspend a tenant, impersonate, bulk stage change).
 * The caller validates with its contract schema via `validate`; the dialog closes only when the caller says so.
 */
export function ReasonDialog({
  title,
  description,
  label = "Reason",
  placeholder,
  confirmLabel,
  destructive,
  pending,
  error,
  validate,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  description: ReactNode;
  label?: string;
  placeholder?: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  error: unknown;
  /** Returns an error message, or null when the reason is acceptable. */
  validate: (reason: string) => string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const p = validate(reason);
            setProblem(p);
            if (!p) onConfirm(reason.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="reason-text">{label}</Label>
            <Textarea
              id="reason-text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={placeholder}
              maxLength={500}
              rows={3}
              aria-invalid={problem ? true : undefined}
            />
            {problem && <p className="text-sm text-destructive">{problem}</p>}
          </div>
          {error ? <FormAlert>{errText(error, "That didn't work. Try again.")}</FormAlert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
            >
              {pending && <Loader2 className="animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
