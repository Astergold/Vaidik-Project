import type { ReactNode } from "react";
import { CalendarDays, CheckSquare, Users } from "lucide-react";
import { Gate } from "@/features/visits/VisitPages";
import { MeetingCard, VisitCard } from "@/features/visits/VisitParts";
import { useMeetings, useMyTasks, useVisits } from "@/features/visits/visits-api";
import { formatDateTime } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";

/** Today tab, scheduling part (D4-I4-02): today's visits and meetings, and my open tasks due by tonight. */
export function TodaySchedule({ today, endOfToday }: { today: string; endOfToday: string }) {
  const tz = useTenantTimeZone();
  const visits = useVisits({ from: today, to: today });
  const meetings = useMeetings({ from: today, to: today });
  const tasks = useMyTasks(endOfToday);
  return (
    <>
      <Section icon={CalendarDays} title="Campus visits today">
        <Gate q={visits} what="visits">
          {visits.data?.items.length ? (
            <ul className="space-y-2">
              {visits.data.items.map((v) => (
                <li key={v.id}>
                  <VisitCard visit={v} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No visits today.</Empty>
          )}
        </Gate>
      </Section>
      <Section icon={Users} title="Meetings today">
        <Gate q={meetings} what="meetings">
          {meetings.data?.items.length ? (
            <ul className="space-y-2">
              {meetings.data.items.map((m) => (
                <li key={m.id}>
                  <MeetingCard meeting={m} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No meetings today.</Empty>
          )}
        </Gate>
      </Section>
      <Section icon={CheckSquare} title="My tasks due">
        <Gate q={tasks} what="tasks">
          {tasks.data?.items.length ? (
            <ul className="space-y-2">
              {tasks.data.items.map((t) => (
                <li key={t.id} className="rounded-lg border bg-card p-3 text-sm">
                  <p className="font-medium break-words">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.lead.name ?? "Lead"}
                    {t.dueAt && ` · due ${formatDateTime(t.dueAt, tz)}`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No tasks due.</Empty>
          )}
        </Gate>
      </Section>
    </>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Users;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4" aria-hidden /> {title}
      </h2>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: string }) => (
  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{children}</p>
);
