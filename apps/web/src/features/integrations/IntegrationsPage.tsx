import { PageHeader } from "@/components/PageHeader";
import { RoleGate } from "@/components/RoleGate";
import { ApiKeysSection } from "@/features/integrations/ApiKeysSection";
import { OtherConnections } from "@/features/integrations/OtherConnections";
import { WebhooksSection } from "@/features/integrations/WebhooksSection";

/** Settings → Integrations (D5-I4-03): API keys, webhooks, and links to lead sources and the API docs. */
export function IntegrationsPage() {
  return (
    <RoleGate page="settings.integrations">
      <div className="mx-auto w-full max-w-5xl min-w-0 space-y-8">
        <PageHeader
          area="Settings"
          title="Integrations"
          description="Connect your ERP, website or any tool: API keys to read and write, webhooks to be told when things happen."
        />
        <ApiKeysSection />
        <WebhooksSection />
        <OtherConnections />
      </div>
    </RoleGate>
  );
}
