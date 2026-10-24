import { PageHeader } from "@/components/PageHeader";
import { RoleGate } from "@/components/RoleGate";
import { Statements } from "@/features/billing/Statements";
import { PlanCard, UsageSection } from "@/features/billing/UsagePlan";
import { WalletSection } from "@/features/billing/WalletSection";

/** /settings/billing (D6-I4-03): wallet, ledger, usage, plan and statements — all from the server's ledger. */
export function BillingPage() {
  return (
    <RoleGate page="settings.billing">
      <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6">
        <PageHeader
          area="Settings"
          title="Billing"
          description="Your balance, what you've used, and monthly statements."
        />
        <WalletSection>{(w) => <PlanCard w={w} />}</WalletSection>
        <UsageSection />
        <Statements />
      </div>
    </RoleGate>
  );
}
