import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  startImpersonationBody,
  suspendTenantBody,
  topUpBody,
  type PlatformTenant,
} from "@vernacular/contracts";
import { Building2, Loader2, MoreHorizontal, Plus, Search } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { ReasonDialog } from "@/components/ReasonDialog";
import { RoleGate } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  useStartImpersonation,
  useTenantActions,
  useTenants,
} from "@/features/platform/platform-api";
import { formatCount, formatDate } from "@/lib/labels";
import { formatPaise, parseRupees } from "@/lib/money";
import { hardNavigate } from "@/lib/navigation";
import { errText } from "@/lib/seam";
import { cn } from "@/lib/utils";

type StatusFilter = "active" | "suspended" | undefined;
const STATUS_CHIPS: [StatusFilter, string][] = [
  [undefined, "All"],
  ["active", "Active"],
  ["suspended", "Suspended"],
];

/** /platform/tenants (D6-I4-01): every tenant with status, plan, usage and wallet; super-admin actions per row. */
export function TenantsPage() {
  return (
    <RoleGate page="platform.tenants">
      <div className="mx-auto w-full max-w-7xl min-w-0 space-y-4">
        <PageHeader
          area="Platform"
          title="Tenants"
          description="Every institution on the platform."
          actions={
            <Button asChild>
              <Link to="/platform/tenants/new">
                <Plus /> Create tenant
              </Link>
            </Button>
          }
        />
        <TenantList />
      </div>
    </RoleGate>
  );
}

function TenantList() {
  const [term, setTerm] = useState("");
  const [q, setQ] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<StatusFilter>(undefined);
  const tenants = useTenants({ q, status });
  const items = tenants.data?.items ?? [];
  const filtered = Boolean(q || status);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Status"
          className="inline-flex rounded-md border bg-card p-0.5"
        >
          {STATUS_CHIPS.map(([v, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={status === v}
              onClick={() => setStatus(v)}
              className={cn(
                "rounded px-2.5 py-1 text-sm font-medium text-muted-foreground",
                status === v && "bg-primary text-primary-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          role="search"
          className="relative min-w-0 flex-1 basis-56"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setQ(term.trim() || undefined);
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Name or slug"
            aria-label="Search tenants"
            className="h-8 pl-8"
            maxLength={100}
          />
        </form>
      </div>
      <QueryGate
        q={tenants}
        what="tenants"
        service="Platform"
        empty={
          items.length === 0 && (
            <StateCard
              icon={Building2}
              title={filtered ? "No tenants match" : "No tenants yet"}
              action={
                !filtered && (
                  <Button asChild size="sm">
                    <Link to="/platform/tenants/new">
                      <Plus /> Create tenant
                    </Link>
                  </Button>
                )
              }
            >
              {filtered
                ? "Try another name or status."
                : "Create the first institution to get started."}
            </StateCard>
          )
        }
      >
        <div className="max-w-full overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Usage this month</TableHead>
                <TableHead className="text-right">Wallet</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => (
                <TenantRow key={t.id} tenant={t} />
              ))}
            </TableBody>
          </Table>
        </div>
      </QueryGate>
    </>
  );
}

function TenantRow({ tenant: t }: { tenant: PlatformTenant }) {
  const a = useTenantActions(t.id);
  const [dialog, setDialog] = useState<"suspend" | "topup" | "impersonate" | null>(null);
  const low = t.walletBalancePaise !== null && t.walletBalancePaise <= 0;
  return (
    <TableRow>
      <TableCell className="min-w-44">
        <p className="font-medium">{t.name}</p>
        <p className="text-xs text-muted-foreground">
          {t.slug} · {t.timezone} · since {formatDate(t.createdAt, t.timezone)}
        </p>
      </TableCell>
      <TableCell>
        <Badge variant={t.status === "active" ? "secondary" : "destructive"} className="capitalize">
          {t.status}
        </Badge>
        {t.status === "suspended" && t.suspendedReason && (
          <p className="mt-0.5 max-w-48 text-xs break-words text-muted-foreground">
            {t.suspendedReason}
          </p>
        )}
        {!t.voiceEngineConnected && (
          <p className="mt-0.5 text-xs text-muted-foreground">Voice Engine not connected</p>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {t.plan?.name ?? "—"}
        <span className="block text-xs text-muted-foreground capitalize">{t.billingMode}</span>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap tabular-nums">
        {formatCount(Math.round(t.usageThisMonth.callMinutes))} min
        <span className="block text-xs text-muted-foreground">
          {formatCount(t.usageThisMonth.whatsappMessages)} WhatsApp
        </span>
      </TableCell>
      <TableCell
        className={cn(
          "text-right whitespace-nowrap tabular-nums",
          low && "font-medium text-destructive",
        )}
      >
        {t.billingMode === "prepaid" ? formatPaise(t.walletBalancePaise) : "Postpaid"}
      </TableCell>
      <TableCell className="max-w-48 truncate" title={t.ownerEmail ?? undefined}>
        {t.ownerEmail ?? "—"}
      </TableCell>
      <TableCell className="text-right">
        {a.activate.isError && (
          <span className="mr-2 text-xs text-destructive">
            {errText(a.activate.error, "Couldn't activate.")}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.name}`}>
              {a.activate.isPending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {t.status === "active" && (
              <DropdownMenuItem onSelect={() => setDialog("impersonate")}>
                Impersonate owner
              </DropdownMenuItem>
            )}
            {t.billingMode === "prepaid" && (
              <DropdownMenuItem onSelect={() => setDialog("topup")}>Top up wallet</DropdownMenuItem>
            )}
            {t.status === "active" ? (
              <DropdownMenuItem className="text-destructive" onSelect={() => setDialog("suspend")}>
                Suspend
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => a.activate.mutate()}>Activate</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {dialog === "suspend" && (
          <ReasonDialog
            title={`Suspend ${t.name}?`}
            description="Their users can't sign in and no calls or messages go out until you activate them again."
            confirmLabel="Suspend tenant"
            destructive
            pending={a.suspend.isPending}
            error={a.suspend.error}
            validate={(r) =>
              suspendTenantBody.safeParse({ reason: r }).error?.issues[0]?.message ?? null
            }
            onConfirm={(r) => a.suspend.mutate(r, { onSuccess: () => setDialog(null) })}
            onClose={() => {
              a.suspend.reset();
              setDialog(null);
            }}
          />
        )}
        {dialog === "topup" && (
          <TopUpDialog tenant={t} mutation={a.topUp} onClose={() => setDialog(null)} />
        )}
        {dialog === "impersonate" && (
          <ImpersonateDialog tenant={t} onClose={() => setDialog(null)} />
        )}
      </TableCell>
    </TableRow>
  );
}

function TopUpDialog({
  tenant: t,
  mutation,
  onClose,
}: {
  tenant: PlatformTenant;
  mutation: ReturnType<typeof useTenantActions>["topUp"];
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amountPaise = parseRupees(amount);
    if (amountPaise === null)
      return setErrors({ amountPaise: "Enter an amount in rupees, e.g. 5000 or 2500.50" });
    const r = topUpBody.safeParse({ amountPaise, reference });
    if (!r.success)
      return setErrors(
        Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
    setErrors({});
    mutation.mutate(r.data, { onSuccess: onClose });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Top up {t.name}</DialogTitle>
        <DialogDescription>
          Current balance {formatPaise(t.walletBalancePaise)}. The top-up is recorded in their
          wallet ledger.
        </DialogDescription>
        <form noValidate onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="topup-amount">Amount (₹)</Label>
            <Input
              id="topup-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="5000"
            />
            {errors.amountPaise && <p className="text-sm text-destructive">{errors.amountPaise}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topup-ref">Payment reference</Label>
            <Input
              id="topup-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. NEFT UTR or invoice no."
              maxLength={200}
            />
            {errors.reference && <p className="text-sm text-destructive">{errors.reference}</p>}
          </div>
          {mutation.isError && <FormAlert>{errText(mutation.error, "Couldn't top up.")}</FormAlert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              Add to wallet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Start a 30-minute, audit-logged session as the tenant's owner; the app reloads into that tenant. */
function ImpersonateDialog({
  tenant: t,
  onClose,
}: {
  tenant: PlatformTenant;
  onClose: () => void;
}) {
  const start = useStartImpersonation();
  return (
    <ReasonDialog
      title={`Impersonate ${t.name}'s owner?`}
      description={`You'll see the app as ${t.ownerEmail ?? "the owner"} for up to 30 minutes. Every action is recorded with your name and this reason.`}
      placeholder="e.g. Support ticket #142: owner can't see their campaign"
      confirmLabel="Start impersonating"
      pending={start.isPending}
      error={start.error}
      validate={(r) =>
        startImpersonationBody.safeParse({ tenantId: t.id, reason: r }).error?.issues[0]?.message ??
        null
      }
      onConfirm={(reason) =>
        start.mutate(
          { tenantId: t.id, reason },
          {
            // Full reload: the next /api/me is the impersonated user; nothing platform-side may linger.
            onSuccess: () => hardNavigate("/"),
          },
        )
      }
      onClose={onClose}
    />
  );
}
