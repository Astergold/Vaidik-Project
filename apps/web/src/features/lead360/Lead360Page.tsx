import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LeadDetail } from "@vernacular/contracts";
import { AlertTriangle, ArrowLeft, Lock, LogIn, SearchX } from "lucide-react";
import { StateCard } from "@/components/StateCard";
import { Tabs, tabPanelProps } from "@/components/Tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadApplicationsPanel } from "@/features/applications/LeadApplicationsPanel";
import { ActionBar } from "@/features/lead360/ActionBar";
import { useLead } from "@/features/lead360/lead360-api";
import { LeadHeader } from "@/features/lead360/LeadHeader";
import { Timeline } from "@/features/lead360/Timeline";
import { LeadVisitsPanel } from "@/features/visits/VisitPages";
import { Composer } from "@/features/whatsapp/Composer";
import { Conversation } from "@/features/whatsapp/Conversation";
import { ApiCallError } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lead 360 (D3-I4-01): header, action bar, timeline, side panel. */
export function Lead360Page({ leadId }: { leadId: string }) {
  const valid = UUID.test(leadId);
  return <Shell>{valid ? <LeadView leadId={leadId} /> : <NotFound />}</Shell>;
}

function LeadView({ leadId }: { leadId: string }) {
  const lead = useLead(leadId);

  if (lead.isPending) return <Loading />;
  if (lead.isError) {
    const status = lead.error instanceof ApiCallError ? lead.error.status : null;
    if (status === 404) return <NotFound />;
    if (status === 403)
      return (
        <StateCard icon={Lock} title="This lead isn't assigned to you">
          Ask your admission head to assign it if you need to work on it.
        </StateCard>
      );
    if (status === 401)
      return (
        <StateCard
          icon={LogIn}
          title="Sign in to see this lead"
          action={
            <Button asChild size="sm">
              <Link to="/login" search={{ redirect: `/leads/${leadId}` }}>
                Sign in
              </Link>
            </Button>
          }
        >
          You&apos;re using the dev session; lead data needs a real sign-in.
        </StateCard>
      );
    return (
      <StateCard
        icon={AlertTriangle}
        title="Couldn't load this lead"
        tone="error"
        action={
          <Button variant="outline" size="sm" onClick={() => void lead.refetch()}>
            Try again
          </Button>
        }
      >
        Check your connection and try again.
      </StateCard>
    );
  }

  const data = lead.data;
  return (
    <div className="space-y-5">
      <LeadHeader lead={data} />
      <ActionBar lead={data} />
      <div className="grid gap-5 lg:grid-cols-3">
        <ActivityTabs leadId={leadId} />
        <SidePanel lead={data} />
      </div>
    </div>
  );
}

type ActivityTab = "timeline" | "conversation";
const ACTIVITY_TABS = [
  { value: "timeline", label: "Timeline" },
  { value: "conversation", label: "Conversation" },
] as const satisfies readonly { value: ActivityTab; label: string }[];

/** Timeline | Conversation (D5-I4-02). Only the open tab mounts, so the WhatsApp poll runs only while it's shown. */
function ActivityTabs({ leadId }: { leadId: string }) {
  const [tab, setTab] = useState<ActivityTab>("timeline");
  return (
    <div className="min-w-0 space-y-3 lg:col-span-2">
      <Tabs
        id="lead-activity"
        label="Lead activity"
        value={tab}
        items={ACTIVITY_TABS}
        onChange={setTab}
      />
      <div {...tabPanelProps("lead-activity", tab)} className="min-w-0 focus-visible:outline-none">
        {tab === "timeline" ? (
          <Timeline leadId={leadId} />
        ) : (
          <Conversation
            leadId={leadId}
            composer={(gate) => <Composer leadId={leadId} gate={gate} />}
          />
        )}
      </div>
    </div>
  );
}

function SidePanel({ lead }: { lead: LeadDetail }) {
  const tz = useTenantTimeZone();
  const facts: [string, string][] = [
    ["Source", lead.source?.name ?? "—"],
    ["Program", lead.program?.name ?? "—"],
    ["Admission cycle", lead.cycle.name],
    ["Language", lead.person.preferredLanguage ?? "—"],
    ["Calls", String(lead.callCount)],
    ["Created", formatDate(lead.createdAt, tz)],
    ["Last updated", formatDateTime(lead.updatedAt, tz)],
  ];
  if (lead.lostReason) facts.push(["Lost because", lead.lostReason]);
  return (
    <aside className="min-w-0 space-y-4" aria-label="Lead details">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Details</h2>
        <dl className="space-y-2 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <LeadApplicationsPanel leadId={lead.id} />
      <LeadVisitsPanel lead={{ id: lead.id, name: lead.person.fullName ?? "this lead" }} />
    </aside>
  );
}

function NotFound() {
  return (
    <StateCard
      icon={SearchX}
      title="Lead not found"
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/leads">Back to leads</Link>
        </Button>
      }
    >
      It may have been merged, or the link is wrong.
    </StateCard>
  );
}

function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading lead">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-80" />
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <Link
        to="/leads"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Leads
      </Link>
      {children}
    </div>
  );
}
