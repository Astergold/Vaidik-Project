import { useState, type FormEvent } from "react";
import {
  EXTRACTION_DATA_TYPES,
  extractionRuleBody,
  LLM_PROVIDERS,
  LLM_PURPOSES,
  putLlmBody,
  type ExtractionRule,
  type LlmProvider,
  type LlmPurpose,
  type LlmSettings,
} from "@vernacular/contracts";
import { CheckCircle2, KeyRound, ListPlus, Loader2, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  useExtractionRules,
  useLlmSettings,
  useRuleMutations,
  useSaveLlm,
} from "@/features/settings/llm-api";
import { errText } from "@/lib/seam";

/** /settings/llm (D6-I4-02): which model analyses calls and plans outreach, plus the tenant's custom extraction fields. */
export const PROVIDER_LABEL: Record<LlmProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  openrouter: "OpenRouter",
};
const PURPOSE: Record<LlmPurpose, [string, string]> = {
  analyst: [
    "Call analysis",
    "Reads each transcript: temperature, next step, objections and your custom fields.",
  ],
  planner: [
    "Re-engagement planner",
    "Proposes follow-ups for warm and cold leads (every action still passes the policy engine).",
  ],
};

export function LlmPage() {
  return (
    <RoleGate page="settings.llm">
      <div className="mx-auto w-full max-w-4xl min-w-0 space-y-6">
        <PageHeader
          area="Settings"
          title="LLM provider"
          description="The model behind call analysis and planning, and what else it should extract from calls."
        />
        <Providers />
        <Rules />
      </div>
    </RoleGate>
  );
}

function Providers() {
  const q = useLlmSettings();
  return (
    <QueryGate q={q} what="LLM settings" service="LLM settings">
      {q.data && (
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          {LLM_PURPOSES.map((p) => (
            <ProviderCard key={p} purpose={p} settings={q.data} />
          ))}
        </div>
      )}
    </QueryGate>
  );
}

function ProviderCard({ purpose, settings }: { purpose: LlmPurpose; settings: LlmSettings }) {
  const cfg = settings.configs.find((c) => c.purpose === purpose);
  const save = useSaveLlm();
  const [provider, setProvider] = useState<LlmProvider>(cfg?.provider ?? "anthropic");
  const [model, setModel] = useState(cfg?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const listId = `models-${purpose}`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = putLlmBody.safeParse({
      purpose,
      provider,
      model,
      apiKey: apiKey.trim() || undefined,
    });
    if (!r.success)
      return setErrors(
        Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
    setErrors({});
    save.mutate(r.data, { onSuccess: () => setApiKey("") }); // the key never comes back
  };
  const [title, hint] = PURPOSE[purpose];
  return (
    <form
      method="post"
      noValidate
      onSubmit={submit}
      className="min-w-0 space-y-3 rounded-lg border bg-card p-4"
      aria-label={title}
    >
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`prov-${purpose}`}>Provider</Label>
        <select
          id={`prov-${purpose}`}
          value={provider}
          onChange={(e) => setProvider(e.target.value as LlmProvider)}
          className="h-9 w-full rounded-md border bg-card px-2 text-sm"
        >
          {LLM_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABEL[p]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`model-${purpose}`}>Model</Label>
        <Input
          id={`model-${purpose}`}
          list={listId}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          maxLength={100}
        />
        <datalist id={listId}>
          {(settings.suggestedModels[provider] ?? []).map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {errors.model && <p className="text-sm text-destructive">{errors.model}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`key-${purpose}`} className="flex flex-wrap items-center gap-2">
          API key
          {cfg?.hasKey ? (
            <Badge variant="secondary">
              <KeyRound /> Key stored
            </Badge>
          ) : (
            <span className="text-xs font-normal text-muted-foreground">
              Using the platform&apos;s key
            </span>
          )}
        </Label>
        <Input
          id={`key-${purpose}`}
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            cfg?.hasKey ? "Leave blank to keep the stored key" : "Optional: your own key"
          }
          maxLength={500}
        />
        {errors.apiKey && <p className="text-sm text-destructive">{errors.apiKey}</p>}
      </div>
      {save.isError && <FormAlert>{errText(save.error, "Couldn't save.")}</FormAlert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {save.isSuccess && (
          <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

function Rules() {
  const q = useExtractionRules();
  const m = useRuleMutations();
  const [editing, setEditing] = useState<ExtractionRule | "new" | null>(null);
  const items = [...(q.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="rules-h">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="rules-h" className="text-lg font-semibold">
            Extraction rules
          </h2>
          <p className="text-sm text-muted-foreground">
            Extra fields the analyst pulls from every call, e.g. 12th marks or hostel needed.
          </p>
        </div>
        {q.isSuccess && items.length > 0 && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> New rule
          </Button>
        )}
      </div>
      {m.remove.isError && (
        <FormAlert>{errText(m.remove.error, "Couldn't delete the rule.")}</FormAlert>
      )}
      <QueryGate
        q={q}
        what="extraction rules"
        service="Extraction rules"
        empty={
          items.length === 0 && (
            <StateCard
              icon={ListPlus}
              title="No custom fields yet"
              action={
                <Button size="sm" onClick={() => setEditing("new")}>
                  <Plus /> New rule
                </Button>
              }
            >
              The core analysis (temperature, next step, objections) always runs.
            </StateCard>
          )
        }
      >
        <ul className="space-y-2">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-md border bg-card p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {r.label}
                  <span className="font-mono text-xs text-muted-foreground">{r.fieldKey}</span>
                  <Badge variant="outline">{r.dataType}</Badge>
                  {r.requiresQuote && <Badge variant="outline">Quote required</Badge>}
                  {!r.isActive && <Badge variant="secondary">Off</Badge>}
                </p>
                <p className="mt-0.5 text-xs break-words text-muted-foreground">{r.description}</p>
                {r.dataType === "enum" && (
                  <p className="text-xs text-muted-foreground">Values: {r.enumValues.join(", ")}</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setEditing(r)}
                  aria-label={`Edit ${r.label}`}
                >
                  Edit
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Delete ${r.label}`}
                  disabled={m.remove.isPending}
                  onClick={() => m.remove.mutate(r.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </QueryGate>
      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-4 sm:max-w-md">
          <SheetTitle>
            {editing === "new" ? "New extraction rule" : "Edit extraction rule"}
          </SheetTitle>
          <SheetDescription className="mb-4">
            What should the model look for in each call?
          </SheetDescription>
          {editing && (
            <RuleEditor
              rule={editing === "new" ? null : editing}
              m={m}
              onSaved={() => setEditing(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function RuleEditor({
  rule,
  m,
  onSaved,
}: {
  rule: ExtractionRule | null;
  m: ReturnType<typeof useRuleMutations>;
  onSaved: () => void;
}) {
  const [fieldKey, setFieldKey] = useState(rule?.fieldKey ?? "");
  const [label, setLabel] = useState(rule?.label ?? "");
  const [dataType, setDataType] = useState<ExtractionRule["dataType"]>(rule?.dataType ?? "text");
  const [enumText, setEnumText] = useState(rule?.enumValues.join(", ") ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [requiresQuote, setRequiresQuote] = useState(rule?.requiresQuote ?? true);
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const enumValues =
      dataType === "enum"
        ? enumText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const r = extractionRuleBody.safeParse({
      fieldKey,
      label,
      dataType,
      enumValues,
      description,
      requiresQuote,
      isActive,
    });
    if (!r.success)
      return setErrors(
        Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
    setErrors({});
    m.save.mutate({ id: rule?.id ?? null, body: r.data }, { onSuccess: onSaved });
  };
  const err = (k: string) => errors[k] && <p className="text-sm text-destructive">{errors[k]}</p>;
  return (
    <form method="post" noValidate onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="r-label">Label</Label>
        <Input
          id="r-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          placeholder="12th marks (%)"
        />
        {err("label")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-key">Field key</Label>
        <Input
          id="r-key"
          value={fieldKey}
          onChange={(e) => setFieldKey(e.target.value)}
          className="font-mono"
          maxLength={40}
          placeholder="class12_marks"
          disabled={rule !== null}
        />
        <p className="text-xs text-muted-foreground">
          Used in exports and the API. Can&apos;t change later.
        </p>
        {err("fieldKey")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-type">Type</Label>
        <select
          id="r-type"
          value={dataType}
          onChange={(e) => setDataType(e.target.value as ExtractionRule["dataType"])}
          className="h-9 w-full rounded-md border bg-card px-2 text-sm"
        >
          {EXTRACTION_DATA_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {dataType === "enum" && (
        <div className="space-y-1.5">
          <Label htmlFor="r-enum">Allowed values (comma-separated)</Label>
          <Input
            id="r-enum"
            value={enumText}
            onChange={(e) => setEnumText(e.target.value)}
            placeholder="yes, no, undecided"
          />
          {err("enumValues")}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="r-desc">Instruction to the model</Label>
        <Textarea
          id="r-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="The percentage the student says they scored in class 12, if mentioned."
        />
        {err("description")}
      </div>
      <Switch
        checked={requiresQuote}
        onChange={setRequiresQuote}
        label="Require a quote from the call"
        onText="Quote required"
        offText="No quote needed"
      />
      <Switch
        checked={isActive}
        onChange={setIsActive}
        label="Rule active"
        onText="Active"
        offText="Off"
      />
      {m.save.isError && <FormAlert>{errText(m.save.error, "Couldn't save the rule.")}</FormAlert>}
      <Button type="submit" disabled={m.save.isPending}>
        {m.save.isPending && <Loader2 className="animate-spin" />}
        {rule ? "Save rule" : "Create rule"}
      </Button>
    </form>
  );
}
