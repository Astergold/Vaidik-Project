import { useState, type FormEvent } from "react";
import {
  putWhatsappSettingsBody,
  TEMPLATE_VARIABLE_FIELDS,
  type TemplateVariableField,
  type WhatsappSettings,
} from "@vernacular/contracts";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
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
import { usePutWhatsappSettings, useWhatsappSettings } from "@/features/whatsapp/messaging-api";
import { formatDateTime } from "@/lib/labels";
import { errText } from "@/lib/seam";
import { useTenantTimeZone } from "@/lib/session";

/** Settings → WhatsApp (D5-I4-02): sender, write-only key, synced templates and variable → lead field mapping. */
export const FIELD_LABEL: Record<TemplateVariableField, string> = {
  full_name: "Full name",
  first_name: "First name",
  program: "Program",
  counsellor_name: "Counsellor name",
  institution_name: "Institution name",
  visit_date: "Next visit date",
  tracked_link: "Tracked link",
};
const STATUS_LABEL = {
  connected: "Connected",
  not_connected: "Not connected",
  error: "Connection error",
};

export function WhatsAppSettingsPage() {
  return (
    <RoleGate page="settings.whatsapp">
      <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
        <PageHeader
          area="Settings"
          title="WhatsApp"
          description="The sender students see, your approved templates, and which lead details fill each template variable."
        />
        <Loaded />
      </div>
    </RoleGate>
  );
}

/** Inside the role gate, so other roles never fire the request. */
function Loaded() {
  const q = useWhatsappSettings();
  // Owned here: the form remounts with the server's reply after a save, and "Saved" must survive that.
  const put = usePutWhatsappSettings();
  return (
    <QueryGate q={q} what="WhatsApp settings" service="WhatsApp">
      {q.data && <SettingsForm key={q.dataUpdatedAt} settings={q.data} put={put} />}
    </QueryGate>
  );
}

type Mappings = Record<string, TemplateVariableField | null>; // `${templateId}:${key}` → field
const mapKey = (templateId: string, key: string) => `${templateId}:${key}`;

function SettingsForm({
  settings: s,
  put,
}: {
  settings: WhatsappSettings;
  put: ReturnType<typeof usePutWhatsappSettings>;
}) {
  const tz = useTenantTimeZone();
  const [senderName, setSenderName] = useState(s.senderName ?? "");
  const [apiKey, setApiKey] = useState("");
  const [mappings, setMappings] = useState<Mappings>(() =>
    Object.fromEntries(
      s.templates.flatMap((t) => t.variables.map((v) => [mapKey(t.id, v.key), v.field])),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const saved = put.isSuccess;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = putWhatsappSettingsBody.safeParse({
      senderName,
      apiKey: apiKey.trim() || undefined,
      variableMappings: s.templates.flatMap((t) =>
        t.variables.map((v) => ({
          templateId: t.id,
          key: v.key,
          field: mappings[mapKey(t.id, v.key)] ?? null,
        })),
      ),
    });
    if (!r.success)
      return setErrors(
        Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
    setErrors({});
    put.mutate(r.data); // success remounts the form with the server's values (and an empty key box)
  };

  return (
    <form method="post" noValidate onSubmit={submit} className="space-y-4">
      <section className="min-w-0 space-y-4 rounded-lg border bg-card p-4" aria-label="Sender">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Sender</h2>
          <Badge
            variant={
              s.status === "connected"
                ? "default"
                : s.status === "error"
                  ? "destructive"
                  : "outline"
            }
          >
            {STATUS_LABEL[s.status]}
          </Badge>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wa-sender">Sender name</Label>
            <Input
              id="wa-sender"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              maxLength={100}
              placeholder="e.g. MIT-ADT Admissions"
            />
            {errors.senderName && <p className="text-sm text-destructive">{errors.senderName}</p>}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Business number</p>
            <p className="flex h-9 items-center text-sm text-muted-foreground">
              {s.senderNumber ?? "Not registered yet"}
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="wa-key" className="flex items-center gap-2">
              API key
              {s.hasApiKey && (
                <Badge variant="secondary">
                  <KeyRound /> Stored
                </Badge>
              )}
            </Label>
            <Input
              id="wa-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                s.hasApiKey
                  ? "Leave blank to keep the stored key"
                  : "Paste the key from your WhatsApp provider"
              }
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">Stored encrypted and never shown again.</p>
            {errors.apiKey && <p className="text-sm text-destructive">{errors.apiKey}</p>}
          </div>
        </div>
      </section>

      <section className="min-w-0 space-y-3 rounded-lg border bg-card p-4" aria-label="Templates">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Templates</h2>
          <p className="text-xs text-muted-foreground">
            {s.lastSyncedAt ? `Synced ${formatDateTime(s.lastSyncedAt, tz)}` : "Not synced yet"}
          </p>
        </div>
        {s.templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No templates yet. They appear here once approved with your WhatsApp provider and synced.
          </p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Variables → lead field</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="min-w-48 align-top">
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.language} · {t.category}
                      </p>
                      <p className="mt-1 max-w-sm text-xs break-words whitespace-pre-wrap text-muted-foreground">
                        {t.body}
                      </p>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge
                        variant={t.status === "approved" ? "secondary" : "outline"}
                        className="capitalize"
                      >
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-56 align-top">
                      {t.variables.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No variables</span>
                      ) : (
                        <ul className="space-y-1.5">
                          {t.variables.map((v) => (
                            <li key={v.key} className="flex flex-wrap items-center gap-2">
                              <label
                                htmlFor={`map-${t.id}-${v.key}`}
                                className="w-28 shrink-0 text-xs"
                              >
                                {`{{${v.key}}}`} {v.label}
                              </label>
                              <select
                                id={`map-${t.id}-${v.key}`}
                                value={mappings[mapKey(t.id, v.key)] ?? ""}
                                onChange={(e) => {
                                  const f = TEMPLATE_VARIABLE_FIELDS.find(
                                    (x) => x === e.target.value,
                                  );
                                  setMappings({ ...mappings, [mapKey(t.id, v.key)]: f ?? null });
                                }}
                                className="h-8 min-w-0 flex-1 rounded-md border bg-card px-2 text-sm"
                              >
                                <option value="">Typed by the sender</option>
                                {TEMPLATE_VARIABLE_FIELDS.map((f) => (
                                  <option key={f} value={f}>
                                    {FIELD_LABEL[f]}
                                  </option>
                                ))}
                              </select>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {put.isError && <FormAlert>{errText(put.error, "Couldn't save the settings.")}</FormAlert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={put.isPending}>
          {put.isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {saved && (
          <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
