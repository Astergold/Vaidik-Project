import { useState, type FormEvent } from "react";
import { planBody, type Plan, type PlanBody } from "@vernacular/contracts";
import { Layers, Loader2, Plus } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { StateCard } from "@/components/StateCard";
import { Switch } from "@/components/Switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlans, useSavePlan } from "@/features/platform/platform-api";
import { formatCount } from "@/lib/labels";
import { formatPaise, paiseToInput, parseRupees } from "@/lib/money";
import { errText } from "@/lib/seam";

/** /platform/plans (D6-I4-01): plan list + side-sheet editor. Prices are typed in rupees and sent as paise. */
export function PlansPage() {
  return (
    <RoleGate page="platform.plans">
      <PlansView />
    </RoleGate>
  );
}

function PlansView() {
  const q = usePlans();
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const items = q.data?.items ?? [];
  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 space-y-4">
      <PageHeader
        area="Platform"
        title="Plans"
        description="What each tenant pays, what's included, and overage rates. Changes apply from the next usage event."
        actions={
          q.isSuccess && (
            <Button onClick={() => setEditing("new")}>
              <Plus /> New plan
            </Button>
          )
        }
      />
      <QueryGate
        q={q}
        what="plans"
        service="Platform"
        empty={
          items.length === 0 && (
            <StateCard icon={Layers} title="No plans yet">
              Create a plan before creating tenants.
            </StateCard>
          )
        }
      >
        <div className="max-w-full overflow-x-auto rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Monthly fee</TableHead>
                <TableHead className="text-right">Included</TableHead>
                <TableHead className="text-right">Overage</TableHead>
                <TableHead className="text-right">Seats</TableHead>
                <TableHead className="text-right">Tenants</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id} className={p.isActive ? undefined : "text-muted-foreground"}>
                  <TableCell className="min-w-36">
                    <p className="font-medium">{p.name}</p>
                    <p className="flex flex-wrap gap-1 text-xs capitalize">
                      {p.billingMode}
                      {!p.isActive && <Badge variant="outline">Inactive</Badge>}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(p.monthlyFeePaise)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatCount(p.includedMinutes)} min
                    <span className="block text-xs text-muted-foreground">
                      {formatCount(p.includedWhatsapp)} WhatsApp
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs whitespace-nowrap tabular-nums">
                    {formatPaise(p.overage.callMinutePaise)}/min
                    <span className="block">{formatPaise(p.overage.whatsappPaise)}/message</span>
                    <span className="block">{formatPaise(p.overage.analystRunPaise)}/analysis</span>
                  </TableCell>
                  <TableCell className="text-right">{p.seatLimit ?? "Unlimited"}</TableCell>
                  <TableCell className="text-right">{p.tenantCount}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setEditing(p)}
                      aria-label={`Edit ${p.name}`}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </QueryGate>
      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-4 sm:max-w-md">
          <SheetTitle>{editing === "new" ? "New plan" : "Edit plan"}</SheetTitle>
          <SheetDescription className="mb-4">
            Prices in rupees; stored exactly in paise.
          </SheetDescription>
          {editing && (
            <PlanEditor
              plan={editing === "new" ? null : editing}
              onSaved={() => setEditing(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type Money = "monthlyFeePaise" | "callMinutePaise" | "whatsappPaise" | "analystRunPaise";
const MONEY_LABEL: Record<Money, string> = {
  monthlyFeePaise: "Monthly fee (₹)",
  callMinutePaise: "Per extra call minute (₹)",
  whatsappPaise: "Per extra WhatsApp message (₹)",
  analystRunPaise: "Per extra call analysis (₹)",
};

function PlanEditor({ plan: p, onSaved }: { plan: Plan | null; onSaved: () => void }) {
  const save = useSavePlan(p?.id ?? null);
  const [name, setName] = useState(p?.name ?? "");
  const [billingMode, setBillingMode] = useState<PlanBody["billingMode"]>(
    p?.billingMode ?? "prepaid",
  );
  const [money, setMoney] = useState<Record<Money, string>>({
    monthlyFeePaise: p ? paiseToInput(p.monthlyFeePaise) : "",
    callMinutePaise: p ? paiseToInput(p.overage.callMinutePaise) : "",
    whatsappPaise: p ? paiseToInput(p.overage.whatsappPaise) : "",
    analystRunPaise: p ? paiseToInput(p.overage.analystRunPaise) : "",
  });
  const [includedMinutes, setIncludedMinutes] = useState(String(p?.includedMinutes ?? ""));
  const [includedWhatsapp, setIncludedWhatsapp] = useState(String(p?.includedWhatsapp ?? ""));
  const [seatLimit, setSeatLimit] = useState(
    p?.seatLimit === null || !p ? "" : String(p.seatLimit),
  );
  const [isActive, setIsActive] = useState(p?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const paise = {} as Record<Money, number>;
    for (const k of Object.keys(MONEY_LABEL) as Money[]) {
      const v = parseRupees(money[k]);
      if (v === null) errs[k] = "Enter an amount, e.g. 2.50";
      else paise[k] = v;
    }
    const int = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);
    const body = {
      name,
      billingMode,
      monthlyFeePaise: paise.monthlyFeePaise,
      includedMinutes: int(includedMinutes),
      includedWhatsapp: int(includedWhatsapp),
      overage: {
        callMinutePaise: paise.callMinutePaise,
        whatsappPaise: paise.whatsappPaise,
        analystRunPaise: paise.analystRunPaise,
      },
      seatLimit: seatLimit.trim() === "" ? null : int(seatLimit),
      isActive,
    };
    const r = planBody.safeParse(body);
    if (!r.success)
      for (const i of r.error.issues) {
        const k = i.path[0] === "overage" ? String(i.path[1]) : String(i.path[0]);
        errs[k] ??=
          i.path[0] === "includedMinutes" ||
          i.path[0] === "includedWhatsapp" ||
          i.path[0] === "seatLimit"
            ? "Enter a whole number"
            : i.message;
      }
    setErrors(errs);
    if (Object.keys(errs).length === 0 && r.success) save.mutate(r.data, { onSuccess: onSaved });
  };
  const err = (k: string) => errors[k] && <p className="text-sm text-destructive">{errors[k]}</p>;
  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    k: string,
    hint?: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {err(k)}
    </div>
  );

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      {field("plan-name", "Name", name, setName, "name")}
      <div className="space-y-1.5">
        <Label htmlFor="plan-mode">Billing mode</Label>
        <select
          id="plan-mode"
          value={billingMode}
          onChange={(e) => setBillingMode(e.target.value === "postpaid" ? "postpaid" : "prepaid")}
          className="h-9 w-full rounded-md border bg-card px-2 text-sm"
        >
          <option value="prepaid">Prepaid wallet</option>
          <option value="postpaid">Monthly + overage</option>
        </select>
      </div>
      {field(
        "plan-fee",
        MONEY_LABEL.monthlyFeePaise,
        money.monthlyFeePaise,
        (v) => setMoney({ ...money, monthlyFeePaise: v }),
        "monthlyFeePaise",
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {field(
          "plan-min",
          "Included call minutes",
          includedMinutes,
          setIncludedMinutes,
          "includedMinutes",
        )}
        {field(
          "plan-wa",
          "Included WhatsApp messages",
          includedWhatsapp,
          setIncludedWhatsapp,
          "includedWhatsapp",
        )}
      </div>
      {(["callMinutePaise", "whatsappPaise", "analystRunPaise"] as const).map((k) =>
        field(`plan-${k}`, MONEY_LABEL[k], money[k], (v) => setMoney({ ...money, [k]: v }), k),
      )}
      {field(
        "plan-seats",
        "Seat limit",
        seatLimit,
        setSeatLimit,
        "seatLimit",
        "Active team members. Leave blank for unlimited.",
      )}
      <Switch
        checked={isActive}
        onChange={setIsActive}
        label="Plan offered to new tenants"
        onText="Offered to new tenants"
        offText="Not offered"
      />
      {save.isError && <FormAlert>{errText(save.error, "Couldn't save the plan.")}</FormAlert>}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending && <Loader2 className="animate-spin" />}
        {p ? "Save plan" : "Create plan"}
      </Button>
    </form>
  );
}
