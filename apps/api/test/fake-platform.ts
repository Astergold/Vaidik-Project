/**
 * In-memory calling platform for campaign tests. Behaves like the real API where the CRM depends on it:
 * CSV upload → campaign create (state "created") → start/pause/resume, runs carrying the CSV columns in
 * initial_context. `finishWave` simulates the platform finishing all calls of a campaign.
 */
import {
  PlatformError,
  type CallPlatform,
  type CampaignPlatform,
  type CreatePlatformCampaign,
  type PlatformCampaign,
  type PlatformRun,
} from "@vernacular/integration-dograh";

export const WF2_UUID = "2c1b7a3e-0000-4000-8000-000000000002";

interface Stored {
  campaign: PlatformCampaign;
  request: CreatePlatformCampaign;
  rows: Record<string, string>[];
  runs: PlatformRun[];
}

function parseCsv(csv: string): Record<string, string>[] {
  const [head, ...lines] = csv.trim().split("\n");
  const cols = head!.split(",");
  return lines.map((l) => {
    const cells = l.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
  });
}

export class FakePlatform implements CampaignPlatform, CallPlatform {
  readonly files = new Map<string, string>();
  readonly campaigns = new Map<number, Stored>();
  readonly calls: string[] = [];
  /** Errors thrown (in order) by the next calls to the named method. */
  failNext: Partial<Record<keyof (CampaignPlatform & CallPlatform), Error[]>> = {};
  /** Single calls placed through the public trigger, keyed by run id. */
  readonly workflowRuns = new Map<number, PlatformRun & { workflowId: number }>();
  private nextId = 100;
  private nextRun = 1;

  private gate(name: keyof (CampaignPlatform & CallPlatform)) {
    this.calls.push(name);
    const e = this.failNext[name]?.shift();
    if (e) throw e;
  }

  async listWorkflows() {
    this.gate("listWorkflows");
    return [
      { id: 2, name: "Admissions outreach", status: "active", workflow_uuid: WF2_UUID },
      {
        id: 3,
        name: "Follow-up",
        status: "active",
        workflow_uuid: "3c1b7a3e-0000-4000-8000-000000000003",
      },
    ];
  }
  async listTelephonyConfigs() {
    this.gate("listTelephonyConfigs");
    return [
      {
        id: 1,
        name: "main-line",
        provider: "vobiz",
        is_default_outbound: true,
        phone_number_count: 1,
      },
    ];
  }
  async getCampaignDefaults() {
    this.gate("getCampaignDefaults");
    return {
      concurrent_call_limit: 10,
      default_max_concurrency: 3,
      from_numbers_count: 1,
      default_retry_config: {
        enabled: true,
        max_retries: 1,
        retry_delay_seconds: 120,
        retry_on_busy: true,
        retry_on_no_answer: true,
        retry_on_voicemail: false,
      },
    };
  }
  async uploadCsv(fileName: string, csv: string) {
    this.gate("uploadCsv");
    const key = `campaigns/${this.files.size + 1}/${fileName}`;
    this.files.set(key, csv);
    return key;
  }
  async createCampaign(c: CreatePlatformCampaign) {
    this.gate("createCampaign");
    const csv = this.files.get(c.sourceFileKey);
    if (!csv) throw new PlatformError("REJECTED", "Unknown source file", false, 400);
    const rows = parseCsv(csv);
    const campaign: PlatformCampaign = {
      id: this.nextId++,
      name: c.name,
      workflow_id: c.workflowId,
      state: "created",
      total_rows: rows.length,
      processed_rows: 0,
      failed_rows: 0,
      started_at: null,
      completed_at: null,
    };
    this.campaigns.set(campaign.id, { campaign, request: c, rows, runs: [] });
    return { ...campaign };
  }
  async listCampaigns() {
    this.gate("listCampaigns");
    return [...this.campaigns.values()].map((s) => ({ ...s.campaign }));
  }
  private get(id: number) {
    const s = this.campaigns.get(id);
    if (!s) throw new PlatformError("NOT_FOUND", "Campaign not found", false, 404);
    return s;
  }
  async getCampaign(id: number) {
    this.gate("getCampaign");
    return { ...this.get(id).campaign };
  }
  private setState(id: number, state: string) {
    const s = this.get(id);
    s.campaign.state = state;
    if (state === "running") s.campaign.started_at ??= new Date().toISOString();
    return { ...s.campaign };
  }
  async startCampaign(id: number) {
    this.gate("startCampaign");
    return this.setState(id, "running");
  }
  async pauseCampaign(id: number) {
    this.gate("pauseCampaign");
    return this.setState(id, "paused");
  }
  async resumeCampaign(id: number) {
    this.gate("resumeCampaign");
    return this.setState(id, "running");
  }
  async listAllRuns(id: number) {
    this.gate("listAllRuns");
    return this.get(id).runs.map((r) => ({ ...r }));
  }

  async triggerCall(c: {
    workflowUuid: string;
    phoneE164: string;
    initialContext: Record<string, unknown>;
  }) {
    this.gate("triggerCall");
    const wf = (await this.listWorkflows()).find((w) => w.workflow_uuid === c.workflowUuid);
    if (!wf) throw new PlatformError("NOT_FOUND", "Workflow not found", false, 404);
    const run = {
      id: this.nextRun++,
      workflowId: wf.id,
      created_at: new Date().toISOString(),
      is_completed: false,
      initial_context: { ...c.initialContext, phone_number: c.phoneE164 },
      gathered_context: {},
    };
    this.workflowRuns.set(run.id, run);
    return { runId: run.id };
  }
  async listWorkflowRuns(workflowId: number, limit: number) {
    this.gate("listWorkflowRuns");
    return [...this.workflowRuns.values()]
      .filter((r) => r.workflowId === workflowId)
      .reverse()
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }
  async getWorkflowRun(workflowId: number, runId: number) {
    this.gate("getWorkflowRun");
    const r = this.workflowRuns.get(runId);
    if (!r || r.workflowId !== workflowId)
      throw new PlatformError("NOT_FOUND", "Run not found", false, 404);
    return { ...r };
  }
  /** The platform finishes a single call. */
  completeWorkflowRun(runId: number, disposition: string, seconds: number) {
    const r = this.workflowRuns.get(runId)!;
    r.is_completed = true;
    r.gathered_context = { mapped_call_disposition: disposition };
    r.cost_info = { call_duration_seconds: seconds };
  }

  /** The platform places a call for one CSV row. */
  addRun(
    platformCampaignId: number,
    row: Record<string, string>,
    disposition: string,
    seconds: number,
  ) {
    const s = this.get(platformCampaignId);
    const run: PlatformRun = {
      id: this.nextRun++,
      created_at: new Date().toISOString(),
      is_completed: true,
      cost_info: { call_duration_seconds: seconds },
      initial_context: { ...row },
      gathered_context: { mapped_call_disposition: disposition },
    };
    s.runs.push(run);
    s.campaign.processed_rows += 1;
    return run;
  }

  /** Every row gets a run (connected 60 s unless `outcome` says otherwise) and the campaign completes. */
  finishWave(
    platformCampaignId: number,
    outcome: (row: Record<string, string>) => [string, number] = () => ["user_hangup", 60],
  ) {
    const s = this.get(platformCampaignId);
    for (const row of s.rows) {
      const [d, sec] = outcome(row);
      this.addRun(platformCampaignId, row, d, sec);
    }
    s.campaign.state = "completed";
    s.campaign.completed_at = new Date().toISOString();
  }

  /** The most recently created platform campaign. */
  latest(): Stored {
    const all = [...this.campaigns.values()];
    return all[all.length - 1]!;
  }
}
