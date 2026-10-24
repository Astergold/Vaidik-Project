import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { changePasswordBody, updateUserBody } from "@vernacular/contracts";
import { CheckCircle2, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, changePasswordErrorMessage, updateOwnName } from "@/lib/auth";
import { errText } from "@/lib/seam";
import { useSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/sitemap";

/**
 * /profile (D6-I4-02) — LIVE: identity from GET /api/me; name and password through Better Auth
 * (POST /api/auth/update-user, POST /api/auth/change-password). Errors show inline.
 */
export function ProfilePage() {
  return (
    <RoleGate page="system.profile">
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-4">
        <PageHeader area="System" title="Profile" description="Your name, sign-in and password." />
        <Identity />
        <NameForm />
        <PasswordForm />
      </div>
    </RoleGate>
  );
}

function Identity() {
  const { session } = useSession();
  if (session.status !== "ready") return null;
  const rows: [string, string][] = [
    ["Email", session.me.user.email],
    ["Role", ROLE_LABELS[session.viewerRole]],
    [
      "Institution",
      session.viewerRole === "super_admin" ? "Laveric platform" : session.me.tenant.name,
    ],
  ];
  return (
    <section className="min-w-0 rounded-lg border bg-card p-4" aria-label="Account">
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        Ask an owner or admin to change your email or role.
      </p>
    </section>
  );
}

function NameForm() {
  const { session } = useSession();
  const qc = useQueryClient();
  const current = session.status === "ready" ? session.me.user.name : "";
  const [name, setName] = useState(current);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (n: string) => updateOwnName(n),
    meta: { silent: true },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = updateUserBody.safeParse({ name });
    if (!r.success) return setProblem(r.error.issues[0]?.message ?? "Enter your name");
    setProblem(null);
    save.mutate(r.data.name);
  };
  return (
    <form
      method="post"
      noValidate
      onSubmit={submit}
      className="min-w-0 space-y-3 rounded-lg border bg-card p-4"
      aria-label="Name"
    >
      <div className="space-y-1.5">
        <Label htmlFor="pf-name">Your name</Label>
        <Input
          id="pf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoComplete="name"
        />
        {problem && <p className="text-sm text-destructive">{problem}</p>}
      </div>
      {save.isError && <FormAlert>{errText(save.error, "Couldn't save your name.")}</FormAlert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={save.isPending || name.trim() === current}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Save name
        </Button>
        {save.isSuccess && (
          <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revokeOtherSessions, setRevoke] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = useMutation({
    mutationFn: changePassword,
    meta: { silent: true },
    onSuccess: () => {
      setCurrent("");
      setNew("");
      setConfirm("");
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = changePasswordBody.safeParse({ currentPassword, newPassword, revokeOtherSessions });
    const errs: Record<string, string> = r.success
      ? {}
      : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
    if (newPassword !== confirm) errs.confirm = "The two new passwords don't match";
    setErrors(errs);
    if (r.success && !errs.confirm) change.mutate(r.data);
  };
  const err = (k: string) => errors[k] && <p className="text-sm text-destructive">{errors[k]}</p>;
  return (
    <form
      method="post"
      noValidate
      onSubmit={submit}
      className="min-w-0 space-y-3 rounded-lg border bg-card p-4"
      aria-label="Change password"
    >
      <h2 className="text-sm font-semibold">Change password</h2>
      <div className="space-y-1.5">
        <Label htmlFor="pf-current">Current password</Label>
        <Input
          id="pf-current"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
        {err("currentPassword")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-new">New password</Label>
          <Input
            id="pf-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
          />
          {err("newPassword")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-confirm">Repeat new password</Label>
          <Input
            id="pf-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {err("confirm")}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={revokeOtherSessions}
          onChange={(e) => setRevoke(e.target.checked)}
        />
        Sign out my other browsers and devices
      </label>
      {change.isError && <FormAlert>{changePasswordErrorMessage(change.error)}</FormAlert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={change.isPending}>
          {change.isPending && <Loader2 className="animate-spin" />}
          Change password
        </Button>
        {change.isSuccess && (
          <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" /> Password changed
          </span>
        )}
      </div>
    </form>
  );
}
