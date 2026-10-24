import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Notification } from "@vernacular/contracts";
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  CheckCheck,
  FileUp,
  Headset,
  Loader2,
  PhoneCall,
  Sparkles,
  Wallet,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Tabs, tabPanelProps } from "@/components/Tabs";
import { Button } from "@/components/ui/button";
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
} from "@/features/notifications/notifications-api";
import { safeRedirect } from "@/lib/errors";
import { formatDateTime } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

const KIND: Record<string, [LucideIcon, string]> = {
  sla_breach: [AlertTriangle, "Overdue"],
  needs_counsellor: [Headset, "Needs a counsellor"],
  review_call: [PhoneCall, "Call to review"],
  visit_booked: [CalendarCheck, "Visit booked"],
  low_balance: [Wallet, "Low balance"],
  wallet_empty: [Wallet, "Wallet empty"],
  import_finished: [FileUp, "Import finished"],
  webhook_disabled: [Webhook, "Webhook turned off"],
  planner_approval: [Sparkles, "Needs approval"],
};
const kindOf = (k: string): [LucideIcon, string] => KIND[k] ?? [Bell, "Update"];

/** /notifications (D6-I4-04a): everything that needs your attention; open one to go to it, mark read. */
export function NotificationsPage() {
  return (
    <RoleGate page="system.notifications">
      <View />
    </RoleGate>
  );
}

function View() {
  const [tab, setTab] = useState<"all" | "unread">("unread");
  const q = useNotifications(tab === "unread");
  const markAll = useMarkAllRead();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = q.data?.pages[0]?.unreadCount ?? 0;
  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 space-y-4">
      <PageHeader
        area="System"
        title="Notifications"
        description="Overdue follow-ups, students asking for a counsellor, calls to review and account alerts."
        actions={
          unread > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              {markAll.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
              Mark all read
            </Button>
          )
        }
      />
      {markAll.isError && (
        <FormAlert>{errText(markAll.error, "Couldn't mark them read.")}</FormAlert>
      )}
      <Tabs
        id="notif"
        label="Notifications"
        value={tab}
        onChange={setTab}
        items={[
          { value: "unread", label: "Unread", badge: unread > 0 ? String(unread) : undefined },
          { value: "all", label: "All" },
        ]}
      />
      <div
        {...tabPanelProps("notif", tab)}
        className="min-w-0 space-y-3 focus-visible:outline-none"
      >
        <QueryGate
          q={q}
          what="notifications"
          service="Notifications"
          empty={
            items.length === 0 && (
              <StateCard
                icon={Bell}
                title={tab === "unread" ? "You're all caught up" : "No notifications yet"}
              >
                New alerts appear here and on the bell.
              </StateCard>
            )
          }
        >
          <ul className="space-y-2" aria-label="Notification list">
            {items.map((n) => (
              <NotificationRow key={n.id} n={n} />
            ))}
          </ul>
          {q.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
            >
              {q.isFetchingNextPage && <Loader2 className="animate-spin" />}
              Load older
            </Button>
          )}
        </QueryGate>
      </div>
    </div>
  );
}

function NotificationRow({ n }: { n: Notification }) {
  const tz = useTenantTimeZone();
  const navigate = useNavigate();
  const mark = useMarkRead();
  const [Icon, label] = kindOf(n.kind);
  const unread = n.readAt === null;
  // Only same-site app paths are followed; anything else (absolute URLs) is ignored.
  const target = n.link && safeRedirect(n.link) === n.link ? n.link : null;
  const open = () => {
    if (unread) mark.mutate(n.id);
    if (target) void navigate({ to: target });
  };
  return (
    <li
      className={cn(
        "flex min-w-0 gap-3 rounded-lg border bg-card p-3",
        unread && "border-primary/40",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{label}</span>
          <time dateTime={n.createdAt}>{formatDateTime(n.createdAt, tz)}</time>
          {unread && <span className="font-medium text-primary">New</span>}
        </p>
        {target ? (
          <button
            type="button"
            onClick={open}
            className="text-left font-medium break-words hover:underline"
          >
            {n.title}
          </button>
        ) : (
          <p className="font-medium break-words">{n.title}</p>
        )}
        {n.body && <p className="text-sm break-words text-muted-foreground">{n.body}</p>}
        {mark.isError && (
          <p className="text-xs text-destructive">
            {errText(mark.error, "Couldn't mark it read.")}
          </p>
        )}
      </div>
      {unread && (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => mark.mutate(n.id)}
          disabled={mark.isPending}
          aria-label={`Mark "${n.title}" read`}
        >
          Mark read
        </Button>
      )}
    </li>
  );
}
