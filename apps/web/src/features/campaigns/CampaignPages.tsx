import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { CampaignAction } from "@vernacular/contracts";
import { AlertTriangle, ArrowLeft, Lock, Plus } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { StateCard } from "@/components/StateCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignForm } from "@/features/campaigns/CampaignForm";
import {
  CampaignDetailView,
  CampaignNotFound,
  CampaignsListView,
  CampaignUnavailable,
} from "@/features/campaigns/CampaignViews";
import {
  useCampaign,
  useCampaignAction,
  useCampaigns,
  useCreateCampaign,
  usePatchCampaign,
} from "@/features/campaigns/campaigns-api";
import {
  actionsFor,
  emptyCampaignForm,
  formFromCampaign,
} from "@/features/campaigns/campaign-logic";
import { ApiCallError, isMissingRoute } from "@/lib/api";
import type { Remote } from "@/lib/remote";
import { useTenantTimeZone } from "@/lib/session";

/** Campaign pages (D3-I4-04): containers wiring the proposed API to the views. */
const errText = (err: unknown, fallback: string) =>
  err instanceof ApiCallError && err.message ? err.message : fallback;

function Page({ back, children }: { back?: boolean; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      {back && (
        <Link
          to="/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Campaigns
        </Link>
      )}
      {children}
    </div>
  );
}

export function CampaignsPage() {
  const list = useCampaigns();
  const state: Remote<NonNullable<typeof list.data>["items"]> = list.data
    ? { kind: "ready", data: list.data.items }
    : list.isError
      ? {
          kind: "error",
          message: errText(list.error, "Please try again."),
          retry: () => void list.refetch(),
        }
      : { kind: "loading" };
  const unavailable = isMissingRoute(list.error);
  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Call a chosen set of leads with an AI agent, inside your calling hours.
          </p>
        </div>
        {!unavailable && (
          <Button asChild>
            <Link to="/campaigns/new">
              <Plus /> New campaign
            </Link>
          </Button>
        )}
      </div>
      <CampaignsListView state={state} unavailable={unavailable} canCreate />
    </Page>
  );
}

export function NewCampaignPage() {
  const navigate = useNavigate();
  const create = useCreateCampaign();
  return (
    <Page back>
      <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
      <CampaignForm
        initial={emptyCampaignForm()}
        submitLabel="Create campaign"
        pending={create.isPending}
        serverError={
          create.isError &&
          (isMissingRoute(create.error) ? (
            <CampaignUnavailable />
          ) : (
            <FormAlert>{errText(create.error, "Couldn't create the campaign.")}</FormAlert>
          ))
        }
        onSubmit={(body) =>
          create.mutate(body, {
            onSuccess: (c) =>
              void navigate({
                to: "/campaigns/$campaignId",
                params: { campaignId: c.id },
              }),
          })
        }
        onCancel={() => void navigate({ to: "/campaigns" })}
      />
    </Page>
  );
}

/** Loading / not-available / not-found / error states shared by detail and edit. */
function useCampaignState(id: string) {
  const q = useCampaign(id);
  let gate: ReactNode = null;
  if (q.isPending)
    gate = <Skeleton className="h-64 w-full" aria-busy="true" aria-label="Loading campaign" />;
  else if (isMissingRoute(q.error)) gate = <CampaignUnavailable />;
  else if (q.error instanceof ApiCallError && q.error.status === 404) gate = <CampaignNotFound />;
  else if (q.isError)
    gate = (
      <StateCard
        icon={AlertTriangle}
        title="Couldn't load this campaign"
        tone="error"
        action={
          <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
            Try again
          </Button>
        }
      >
        {errText(q.error, "Please try again.")}
      </StateCard>
    );
  return { q, gate };
}

export function CampaignDetailPage({ id }: { id: string }) {
  const tz = useTenantTimeZone();
  const { q, gate } = useCampaignState(id);
  const action = useCampaignAction(id);
  const [confirm, setConfirm] = useState<"start" | "stop" | null>(null);
  if (gate || !q.data) return <Page back>{gate}</Page>;
  return (
    <Page back>
      <CampaignDetailView
        campaign={q.data}
        tz={tz}
        confirm={confirm}
        pendingAction={action.isPending ? (action.variables ?? null) : null}
        actionError={
          action.isError ? errText(action.error, "That didn't work. Please try again.") : null
        }
        onAsk={(k) => {
          action.reset();
          setConfirm(k);
        }}
        onCancelConfirm={() => setConfirm(null)}
        onAction={(a: CampaignAction) =>
          // The page then shows the status the server returned (setQueryData in onSuccess), never an optimistic one.
          action.mutate(a, { onSettled: () => setConfirm(null) })
        }
      />
    </Page>
  );
}

export function EditCampaignPage({ id }: { id: string }) {
  const navigate = useNavigate();
  const { q, gate } = useCampaignState(id);
  const patch = usePatchCampaign(id);
  if (gate || !q.data) return <Page back>{gate}</Page>;
  const c = q.data;
  if (!actionsFor(c.status).edit) {
    return (
      <Page back>
        <StateCard
          icon={Lock}
          title="This campaign can't be edited now"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/campaigns/$campaignId" params={{ campaignId: id }}>
                Back to the campaign
              </Link>
            </Button>
          }
        >
          {c.status === "running"
            ? "Pause it first, then edit."
            : "Stopped and completed campaigns are read-only."}
        </StateCard>
      </Page>
    );
  }
  return (
    <Page back>
      <h1 className="text-2xl font-semibold tracking-tight">Edit {c.name}</h1>
      <CampaignForm
        initial={formFromCampaign(c)}
        submitLabel="Save changes"
        pending={patch.isPending}
        serverError={
          patch.isError && (
            <FormAlert>{errText(patch.error, "Couldn't save the campaign.")}</FormAlert>
          )
        }
        onSubmit={(body) =>
          patch.mutate(body, {
            onSuccess: () =>
              void navigate({
                to: "/campaigns/$campaignId",
                params: { campaignId: id },
              }),
          })
        }
        onCancel={() =>
          void navigate({
            to: "/campaigns/$campaignId",
            params: { campaignId: id },
          })
        }
      />
    </Page>
  );
}
