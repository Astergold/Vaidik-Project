import { useEffect, useState } from "react";
import { Loader2, LogOut, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentImpersonation, useStopImpersonation } from "@/features/platform/platform-api";
import { isMissingRoute } from "@/lib/api";
import { hardNavigate } from "@/lib/navigation";
import { errText } from "@/lib/seam";
import { useSession } from "@/lib/session";

/** "29:05" from milliseconds left (never negative). */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Shown on every page while a super-admin is impersonating (D6-I4-01). The trigger is the real
 * `GET /api/me → impersonatedBy`; the details and expiry come from `GET /api/platform/impersonate` (proposed).
 * The countdown is a display aid only — the server ends the session at `expiresAt` whatever the browser shows.
 */
export function ImpersonationBanner() {
  const { session } = useSession();
  const active = session.status === "ready" && session.me.impersonatedBy !== null;
  if (!active) return null;
  return <Banner name={session.me.user.name} tenant={session.me.tenant.name} />;
}

function Banner({ name, tenant }: { name: string; tenant: string }) {
  const q = useCurrentImpersonation(true);
  const stop = useStopImpersonation();
  const [now, setNow] = useState(() => Date.now());
  const expiresAt = q.data?.session ? Date.parse(q.data.session.expiresAt) : null;
  useEffect(() => {
    if (expiresAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const left = expiresAt === null ? null : expiresAt - now;
  const expired = left !== null && left <= 0;

  const exit = () =>
    stop.mutate(undefined, {
      onSuccess: () => hardNavigate("/platform/tenants"), // nothing from the tenant session may linger
    });

  return (
    <div
      role="region"
      aria-label="Impersonation"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-warning bg-warning px-3 py-2 text-sm text-warning-foreground md:px-6"
    >
      <UserCog className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 break-words">
        <span className="font-semibold">
          Acting as {q.data?.session?.user.name ?? name} · {q.data?.session?.tenant.name ?? tenant}
        </span>
        {q.data?.session && <span> — reason: {q.data.session.reason}</span>}
        {isMissingRoute(q.error) && <span> — session details aren&apos;t available yet</span>}
        <span className="block text-xs">
          Everything you do is recorded in the audit log with your name.
        </span>
      </p>
      {left !== null && (
        <span
          className="font-mono text-sm tabular-nums"
          aria-live="off"
          aria-label={expired ? "Session expired" : `Ends in ${formatCountdown(left)}`}
        >
          {expired ? "Expired" : `Ends in ${formatCountdown(left)}`}
        </span>
      )}
      {expired ? (
        <Button size="sm" variant="outline" onClick={() => hardNavigate("/")}>
          Reload
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={exit} disabled={stop.isPending}>
          {stop.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
          Exit impersonation
        </Button>
      )}
      {stop.isError && (
        <p role="alert" className="w-full text-xs">
          {errText(stop.error, "Couldn't end the session.")}
        </p>
      )}
    </div>
  );
}
