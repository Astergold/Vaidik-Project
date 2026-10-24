import type { WalletResponse, WalletTransaction } from "@vernacular/contracts";
import { AlertTriangle, Loader2, Wallet } from "lucide-react";
import { QueryGate } from "@/components/QueryGate";
import { StateCard } from "@/components/StateCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWallet } from "@/features/billing/billing-api";
import { formatDateTime } from "@/lib/labels";
import { formatPaise } from "@/lib/money";
import { useTenantTimeZone } from "@/lib/session";
import { cn } from "@/lib/utils";

const TX_LABEL: Record<WalletTransaction["kind"], string> = {
  top_up: "Top-up",
  usage: "Usage",
  plan_fee: "Plan fee",
  adjustment: "Adjustment",
};

/** Wallet balance (+ WALLET_EMPTY / low-balance banners) and the ledger, newest first (D6-I4-03). */
export function WalletSection({ children }: { children?: (w: WalletResponse) => React.ReactNode }) {
  const q = useWallet();
  const w = q.data?.pages[0];
  const txs = q.data?.pages.flatMap((p) => p.transactions) ?? [];
  return (
    <QueryGate q={q} what="the wallet" service="Billing">
      {w && (
        <>
          <Balance w={w} />
          {children?.(w)}
          <section className="min-w-0 space-y-2" aria-labelledby="ledger-h">
            <h2 id="ledger-h" className="text-lg font-semibold">
              Transactions
            </h2>
            {txs.length === 0 ? (
              <StateCard icon={Wallet} title="No transactions yet">
                Top-ups, usage and plan fees will appear here.
              </StateCard>
            ) : (
              <Ledger txs={txs} />
            )}
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
          </section>
        </>
      )}
    </QueryGate>
  );
}

function Balance({ w }: { w: WalletResponse }) {
  if (w.billingMode === "postpaid")
    return (
      <section className="min-w-0 rounded-lg border bg-card p-4" aria-label="Wallet">
        <p className="text-sm text-muted-foreground">Billing</p>
        <p className="text-xl font-semibold">Monthly, with overage</p>
        <p className="text-sm text-muted-foreground">
          You&apos;re billed after each month; see Statements below.
        </p>
      </section>
    );
  const balance = w.balancePaise ?? 0;
  const empty = balance <= 0;
  const low = !empty && w.lowBalanceThresholdPaise !== null && balance < w.lowBalanceThresholdPaise;
  return (
    <section className="min-w-0 space-y-3" aria-label="Wallet">
      {empty && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p>
            <span className="font-semibold">
              Your wallet is empty — calls and WhatsApp messages have stopped
            </span>{" "}
            <span className="font-mono text-xs">(WALLET_EMPTY)</span>. Contact Laveric to top up;
            everything resumes as soon as the balance is above zero.
          </p>
        </div>
      )}
      {low && (
        <div
          role="status"
          className="flex gap-3 rounded-lg border border-warning bg-warning/15 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Low balance: below {formatPaise(w.lowBalanceThresholdPaise)}. Top up soon to avoid calls
            stopping.
          </p>
        </div>
      )}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Prepaid wallet balance</p>
        <p className={cn("text-3xl font-semibold tabular-nums", empty && "text-destructive")}>
          {formatPaise(balance)}
        </p>
      </div>
    </section>
  );
}

function Ledger({ txs }: { txs: WalletTransaction[] }) {
  const tz = useTenantTimeZone();
  return (
    <div className="max-w-full overflow-x-auto rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Balance after</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {txs.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="whitespace-nowrap">{formatDateTime(t.at, tz)}</TableCell>
              <TableCell>{TX_LABEL[t.kind]}</TableCell>
              <TableCell className="max-w-56 break-words text-muted-foreground">
                {t.reference ?? "—"}
                {t.createdBy && <span className="block text-xs">by {t.createdBy}</span>}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right whitespace-nowrap tabular-nums",
                  t.amountPaise > 0 ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t.amountPaise > 0 ? "+" : ""}
                {formatPaise(t.amountPaise)}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {formatPaise(t.balanceAfterPaise)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
