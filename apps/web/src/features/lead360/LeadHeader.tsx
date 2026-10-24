import type { ReactNode } from "react";
import type { LeadDetail } from "@vernacular/contracts";
import { AtSign, Bot, CalendarClock, Hash, Phone, ShieldAlert, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TemperatureTag } from "@/features/leads/LeadsTable";
import { formatDateTime, NEXT_STEP_LABEL, STAGE_LABEL } from "@/lib/labels";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

const ID_ICON = { phone: Phone, email: AtSign, application_no: Hash, external_id: Hash } as const;
const ID_LABEL = {
  phone: "Phone",
  email: "Email",
  application_no: "Application no.",
  external_id: "External id",
} as const;

/** Identity + pipeline position. Identifiers render exactly as received (masked for counsellors). */
export function LeadHeader({ lead }: { lead: LeadDetail }) {
  const tz = useTenantTimeZone();
  const p = lead.person;
  const sub = [lead.program?.name, [p.city, p.state].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" · ");
  const overdue = lead.nextStepDueAt !== null && new Date(lead.nextStepDueAt) < new Date();
  const closed = lead.stage === "lost" || lead.stage === "invalid";

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {p.fullName ?? "Unnamed lead"}
          </h1>
          {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={closed ? "outline" : "secondary"}
            className={cn("text-sm", closed && "text-muted-foreground")}
          >
            {STAGE_LABEL[lead.stage]}
            {lead.subStage && <span className="font-normal"> · {lead.subStage.name}</span>}
          </Badge>
          <TemperatureTag value={lead.temperature} />
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Contact details">
        {p.identifiers.length === 0 && (
          <li className="text-muted-foreground">No contact details</li>
        )}
        {p.identifiers.map((i) => {
          const Icon = ID_ICON[i.kind];
          return (
            <li key={i.id} className="flex min-w-0 items-center gap-1.5">
              <Icon
                className="size-4 shrink-0 text-muted-foreground"
                aria-label={ID_LABEL[i.kind]}
              />
              <span className="truncate tabular-nums">{i.value}</span>
              {i.isPrimary && p.identifiers.filter((x) => x.kind === i.kind).length > 1 && (
                <span className="text-xs text-muted-foreground">primary</span>
              )}
            </li>
          );
        })}
        {p.ndncStatus === "listed" && (
          <li className="flex items-center gap-1.5 text-destructive">
            <ShieldAlert className="size-4" aria-hidden /> On the Do-Not-Call registry
          </li>
        )}
      </ul>

      <dl className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-3">
        <Fact icon={CalendarClock} label="Next step">
          {lead.nextStep && lead.nextStep !== "none" ? (
            <>
              {NEXT_STEP_LABEL[lead.nextStep]}
              {lead.nextStepDueAt && (
                <span
                  className={cn(
                    "block text-xs",
                    overdue ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {overdue ? "Overdue · " : "Due "}
                  {formatDateTime(lead.nextStepDueAt, tz)}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">None set</span>
          )}
        </Fact>
        <Fact icon={UserRound} label="Owner">
          {lead.owner?.name ?? <span className="text-muted-foreground">Unassigned</span>}
        </Fact>
        <Fact icon={Bot} label="AI agent">
          {lead.aiAgent?.displayName ?? <span className="text-muted-foreground">None</span>}
        </Fact>
      </dl>
    </header>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Bot;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium break-words">{children}</dd>
      </div>
    </div>
  );
}
