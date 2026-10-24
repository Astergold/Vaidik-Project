import { useState, type FormEvent } from "react";
import {
  inviteBody,
  ROLES,
  type Role,
  type TeamMember,
  type TeamResponse,
} from "@vernacular/contracts";
import { Bot, Loader2, MailPlus, Users, X } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate, useViewerRole } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAgents } from "@/features/agents/agents-api";
import { Allocation } from "@/features/agents/AgentsPage";
import { useTeam, useTeamMutations } from "@/features/settings/team-api";
import { formatDate, formatDateTime } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useSession, useTenantTimeZone } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/sitemap";
import { cn } from "@/lib/utils";

/**
 * /settings/team (D6-I4-02): seats vs plan, invite, change role, deactivate, pending invitations, and which counsellors
 * own each AI agent's leads (the D4 agents allocation). Only owners are offered the Owner role; the API enforces it.
 */
export function TeamPage() {
  return (
    <RoleGate page="settings.team">
      <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6">
        <PageHeader
          area="Settings"
          title="Team"
          description="Who can sign in, what they can do, and which AI agents' leads each counsellor owns."
        />
        <Loaded />
        <AllocationSection />
      </div>
    </RoleGate>
  );
}

function Loaded() {
  const q = useTeam();
  const m = useTeamMutations();
  return (
    <QueryGate q={q} what="the team" service="Team">
      {q.data && (
        <>
          <Seats seats={q.data.seats} />
          <InviteForm
            m={m}
            full={q.data.seats.limit !== null && q.data.seats.used >= q.data.seats.limit}
          />
          <Members team={q.data} m={m} />
          <Invitations team={q.data} m={m} />
        </>
      )}
    </QueryGate>
  );
}

type M = ReturnType<typeof useTeamMutations>;

function Seats({ seats }: { seats: TeamResponse["seats"] }) {
  const pct = seats.limit ? Math.min(100, Math.round((seats.used / seats.limit) * 100)) : 0;
  return (
    <section className="min-w-0 space-y-2 rounded-lg border bg-card p-4" aria-label="Seats">
      <p className="text-sm font-medium">
        {seats.limit === null
          ? `${seats.used} seats used · unlimited on your plan`
          : `${seats.used} of ${seats.limit} seats used`}
      </p>
      {seats.limit !== null && (
        <div
          className="h-2 rounded-full bg-muted"
          role="progressbar"
          aria-label="Seats used"
          aria-valuemin={0}
          aria-valuemax={seats.limit}
          aria-valuenow={seats.used}
        >
          <div
            className={cn("h-2 rounded-full", pct >= 100 ? "bg-destructive" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Active members and pending invitations count. Deactivated people don&apos;t.
      </p>
    </section>
  );
}

function InviteForm({ m, full }: { m: M; full: boolean }) {
  const viewer = useViewerRole();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("counsellor");
  const [problem, setProblem] = useState<string | null>(null);
  const roles = ROLES.filter((r) => r !== "owner" || viewer === "owner");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = inviteBody.safeParse({ email, role });
    if (!r.success) return setProblem(r.error.issues[0]?.message ?? "Check the email");
    setProblem(null);
    m.invite.mutate({ email, role }, { onSuccess: () => setEmail("") });
  };
  return (
    <form
      noValidate
      onSubmit={submit}
      className="min-w-0 space-y-2 rounded-lg border bg-card p-4"
      aria-label="Invite someone"
    >
      <h2 className="text-sm font-semibold">Invite someone</h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56 space-y-1">
          <Label htmlFor="inv-email">Email</Label>
          <Input
            id="inv-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@college.edu"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="inv-role">Role</Label>
          <select
            id="inv-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-9 rounded-md border bg-card px-2 text-sm"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={m.invite.isPending || full}>
          {m.invite.isPending ? <Loader2 className="animate-spin" /> : <MailPlus />}
          Send invite
        </Button>
      </div>
      {full && (
        <p className="text-sm text-muted-foreground">
          All seats are in use. Deactivate someone or ask Laveric for a bigger plan.
        </p>
      )}
      {problem && <p className="text-sm text-destructive">{problem}</p>}
      {m.invite.isError && (
        <FormAlert>{errText(m.invite.error, "Couldn't send the invite.")}</FormAlert>
      )}
    </form>
  );
}

function Members({ team, m }: { team: TeamResponse; m: M }) {
  const tz = useTenantTimeZone();
  const { session } = useSession();
  const me = session.status === "ready" ? session.me.user.id : null;
  const viewer = useViewerRole();
  const errors = [m.setRole, m.setActive].filter((x) => x.isError);
  return (
    <section className="min-w-0 space-y-2" aria-labelledby="members-h">
      <h2 id="members-h" className="text-lg font-semibold">
        Members
      </h2>
      {errors.map((x, i) => (
        <FormAlert key={i}>{errText(x.error, "That didn't work.")}</FormAlert>
      ))}
      {team.members.length === 0 ? (
        <StateCard icon={Users} title="No members yet">
          Invite your first colleague above.
        </StateCard>
      ) : (
        <div className="max-w-full overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>AI agents</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.members.map((p) => (
                <MemberRow
                  key={p.userId}
                  p={p}
                  m={m}
                  self={p.userId === me}
                  canGrantOwner={viewer === "owner"}
                  tz={tz}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function MemberRow({
  p,
  m,
  self,
  canGrantOwner,
  tz,
}: {
  p: TeamMember;
  m: M;
  self: boolean;
  canGrantOwner: boolean;
  tz: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const active = p.status === "active";
  const busy =
    (m.setActive.isPending && m.setActive.variables?.userId === p.userId) ||
    (m.setRole.isPending && m.setRole.variables?.userId === p.userId);
  const roles = ROLES.filter((r) => r !== "owner" || canGrantOwner || p.role === "owner");
  return (
    <TableRow className={active ? undefined : "text-muted-foreground"}>
      <TableCell className="min-w-44">
        <p className="font-medium">
          {p.name} {self && <span className="text-xs text-muted-foreground">(you)</span>}
        </p>
        <p className="text-xs break-all text-muted-foreground">{p.email}</p>
        {!active && <Badge variant="outline">Deactivated</Badge>}
      </TableCell>
      <TableCell>
        <select
          aria-label={`Role of ${p.name}`}
          value={p.role}
          disabled={self || !active || busy || (p.role === "owner" && !canGrantOwner)}
          onChange={(e) =>
            m.setRole.mutate({ userId: p.userId, role: e.target.value as typeof p.role })
          }
          className="h-8 rounded-md border bg-card px-2 text-sm"
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="min-w-40">
        {p.role === "counsellor" ? (
          p.allocatedAgents.length === 0 ? (
            <span className="text-xs text-muted-foreground">None — allocate below</span>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {p.allocatedAgents.map((a) => (
                <li key={a.id}>
                  <Badge variant="outline">{a.name}</Badge>
                </li>
              ))}
            </ul>
          )
        ) : (
          <span className="text-xs text-muted-foreground">All leads</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {p.lastActiveAt
          ? formatDateTime(p.lastActiveAt, tz)
          : `Joined ${formatDate(p.joinedAt, tz)}`}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {self ? null : active ? (
          confirm ? (
            <span className="inline-flex flex-wrap items-center justify-end gap-1.5 text-xs">
              They can&apos;t sign in until reactivated.
              <Button
                size="xs"
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  m.setActive.mutate(
                    { userId: p.userId, active: false },
                    { onSuccess: () => setConfirm(false) },
                  )
                }
              >
                {busy && <Loader2 className="animate-spin" />}
                Deactivate
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button size="xs" variant="outline" onClick={() => setConfirm(true)}>
              Deactivate
            </Button>
          )
        ) : (
          <Button
            size="xs"
            variant="outline"
            disabled={busy}
            onClick={() => m.setActive.mutate({ userId: p.userId, active: true })}
          >
            Reactivate
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function Invitations({ team, m }: { team: TeamResponse; m: M }) {
  const tz = useTenantTimeZone();
  if (team.invitations.length === 0) return null;
  return (
    <section className="min-w-0 space-y-2" aria-labelledby="inv-h">
      <h2 id="inv-h" className="text-lg font-semibold">
        Pending invitations
      </h2>
      {m.cancelInvite.isError && (
        <FormAlert>{errText(m.cancelInvite.error, "Couldn't cancel.")}</FormAlert>
      )}
      <ul className="divide-y rounded-md border bg-card">
        {team.invitations.map((i) => (
          <li
            key={i.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
          >
            <span className="min-w-0 break-all">
              <span className="font-medium">{i.email}</span> · {ROLE_LABELS[i.role]}
              <span className="block text-xs text-muted-foreground">
                Sent {formatDate(i.invitedAt, tz)}
                {i.invitedBy && ` by ${i.invitedBy}`} · expires {formatDate(i.expiresAt, tz)}
              </span>
            </span>
            <Button
              size="xs"
              variant="ghost"
              aria-label={`Cancel invitation for ${i.email}`}
              disabled={m.cancelInvite.isPending}
              onClick={() => m.cancelInvite.mutate(i.id)}
            >
              <X /> Cancel
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Counsellor ↔ AI agent allocation, through the D4 agents contract (PUT /api/agents/:id/counsellors). */
function AllocationSection() {
  const q = useAgents();
  const agents = q.data?.items ?? [];
  return (
    <section className="min-w-0 space-y-2" aria-labelledby="alloc-h">
      <div>
        <h2 id="alloc-h" className="text-lg font-semibold">
          Counsellor allocation
        </h2>
        <p className="text-sm text-muted-foreground">
          A counsellor sees the leads of the AI agents they&apos;re allocated to.
        </p>
      </div>
      <QueryGate
        q={q}
        what="AI agents"
        service="Agent"
        empty={
          agents.length === 0 && (
            <StateCard icon={Bot} title="No AI agents yet">
              Create an agent under AI → Agents first.
            </StateCard>
          )
        }
      >
        <ul className="space-y-2">
          {agents.map((a) => (
            <li
              key={a.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="font-medium break-words">{a.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {a.counsellors.length === 0
                    ? "No counsellors"
                    : a.counsellors.map((c) => c.name).join(", ")}
                </p>
              </div>
              <Allocation agent={a} />
            </li>
          ))}
        </ul>
      </QueryGate>
    </section>
  );
}
