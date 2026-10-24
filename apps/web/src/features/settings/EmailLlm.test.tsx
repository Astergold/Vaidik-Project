// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emailSettings, extractionRulesResponse, llmSettings } from "@vernacular/contracts";
import { EmailPage } from "@/features/settings/EmailPage";
import { LlmPage } from "@/features/settings/LlmPage";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contracts.
const email = emailSettings.parse({
  fromName: "MIT-ADT Admissions",
  fromAddress: "admissions@mitadt.edu",
  domain: {
    name: "mitadt.edu",
    status: "pending",
    lastCheckedAt: "2026-10-17T04:00:00.000Z",
    records: [
      {
        type: "TXT",
        host: "resend._domainkey.mitadt.edu",
        value: "p=MIGfMA0GCS",
        status: "pending",
      },
      {
        type: "TXT",
        host: "mitadt.edu",
        value: "v=spf1 include:amazonses.com ~all",
        status: "verified",
      },
    ],
  },
});
const llm = llmSettings.parse({
  configs: [
    {
      purpose: "analyst",
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      hasKey: true,
      updatedAt: null,
    },
    { purpose: "planner", provider: "openai", model: "gpt-x", hasKey: false, updatedAt: null },
  ],
  suggestedModels: { anthropic: ["claude-sonnet-5-5", "claude-haiku-5-5"] },
});
const RULE = "01a14679-0000-7000-8000-000000000da1";
const rules = extractionRulesResponse.parse({
  items: [
    {
      id: RULE,
      fieldKey: "hostel_needed",
      label: "Hostel needed",
      dataType: "enum",
      enumValues: ["yes", "no"],
      description: "Whether the student says they need a hostel.",
      requiresQuote: true,
      isActive: true,
      sortOrder: 1,
    },
  ],
});
const llmRoutes = (extra: Parameters<typeof mockApi>[0] = {}) => ({
  "GET /api/settings/llm": () => ({ body: llm }),
  "GET /api/settings/extraction-rules": () => ({ body: rules }),
  ...extra,
});

describe("/settings/email (D6-I4-02)", () => {
  it("sender + DNS records with copy fields and statuses; Check again shows the server's result", async () => {
    const calls = mockApi({
      "GET /api/settings/email": () => ({ body: email }),
      "POST /api/settings/email/verify": () => ({
        body: { ...email, domain: { ...email.domain!, status: "verified" } },
      }),
    });
    const { container } = renderUI(<EmailPage />, { role: "admin" });
    expect(((await screen.findByLabelText("Sender address")) as HTMLInputElement).value).toBe(
      "admissions@mitadt.edu",
    );
    const recs = screen.getByRole("region", { name: "Domain records" });
    expect((within(recs).getAllByLabelText("Value")[1] as HTMLInputElement).value).toBe(
      "v=spf1 include:amazonses.com ~all",
    );
    await userEvent.click(within(recs).getByRole("button", { name: /Check again/ }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/verify"))).toBe(true));
    expect(
      await within(screen.getByRole("region", { name: "Domain records" })).findAllByText(
        "verified",
      ),
    ).toHaveLength(2);
    expectSmallScreenSafe(container);
  });

  it("validates and saves the sender (address lowercased)", async () => {
    const calls = mockApi({
      "GET /api/settings/email": () => ({
        body: { fromName: null, fromAddress: null, domain: null },
      }),
      "PUT /api/settings/email": ({ body }) => ({ body: { ...email, ...(body as object) } }),
    });
    renderUI(<EmailPage />, { role: "owner" });
    expect(await screen.findByText(/Save a sender address to see the DNS records/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Save sender" }));
    expect(screen.getByText("Enter the sender name")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Sender name"), "Admissions");
    await userEvent.type(screen.getByLabelText("Sender address"), "Admissions@MITADT.edu");
    await userEvent.click(screen.getByRole("button", { name: "Save sender" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        fromName: "Admissions",
        fromAddress: "admissions@mitadt.edu",
      }),
    );
  });
});

describe("/settings/llm (D6-I4-02)", () => {
  it("per-purpose provider/model; key is write-only (badge, empty box) and sent only when typed", async () => {
    const calls = mockApi(llmRoutes({ "PUT /api/settings/llm": () => ({ body: llm }) }));
    const { container } = renderUI(<LlmPage />, { role: "owner" });
    const analyst = await screen.findByRole("form", { name: "Call analysis" });
    expect(within(analyst).getByText("Key stored")).toBeTruthy();
    expect((within(analyst).getByLabelText(/API key/) as HTMLInputElement).value).toBe("");
    const planner = screen.getByRole("form", { name: "Re-engagement planner" });
    expect(within(planner).getByText("Using the platform's key")).toBeTruthy();
    await userEvent.click(within(analyst).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        purpose: "analyst",
        provider: "anthropic",
        model: "claude-sonnet-5-5",
      }),
    );
    await userEvent.type(within(planner).getByLabelText(/API key/), "sk-test-0000000000");
    await userEvent.click(within(planner).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2));
    expect((calls.filter((c) => c.method === "PUT")[1]!.body as { apiKey: string }).apiKey).toBe(
      "sk-test-0000000000",
    );
    await waitFor(() =>
      expect((within(planner).getByLabelText(/API key/) as HTMLInputElement).value).toBe(""),
    );
    expectSmallScreenSafe(container);
  });

  it("extraction rules: listed; new rule validates reserved keys and enum values, then posts", async () => {
    const calls = mockApi(
      llmRoutes({
        "POST /api/settings/extraction-rules": ({ body }) => ({
          status: 201,
          body: { id: "01a14679-0000-7000-8000-000000000da2", sortOrder: 2, ...(body as object) },
        }),
      }),
    );
    renderUI(<LlmPage />, { role: "admin" });
    expect(await screen.findByText("Hostel needed")).toBeTruthy();
    expect(screen.getByText("Values: yes, no")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /New rule/ }));
    const sheet = await screen.findByRole("dialog");
    await userEvent.type(within(sheet).getByLabelText("Label"), "Temperature");
    await userEvent.type(within(sheet).getByLabelText("Field key"), "temperature");
    await userEvent.selectOptions(within(sheet).getByLabelText("Type"), "enum");
    await userEvent.type(within(sheet).getByLabelText(/Allowed values/), "only");
    await userEvent.type(within(sheet).getByLabelText("Instruction to the model"), "short");
    await userEvent.click(within(sheet).getByRole("button", { name: "Create rule" }));
    expect(within(sheet).getByText("That name is used by the core analysis")).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    await userEvent.clear(within(sheet).getByLabelText("Field key"));
    await userEvent.type(within(sheet).getByLabelText("Field key"), "budget_band");
    await userEvent.clear(within(sheet).getByLabelText(/Allowed values/));
    await userEvent.type(within(sheet).getByLabelText(/Allowed values/), "low, mid, high");
    await userEvent.clear(within(sheet).getByLabelText("Instruction to the model"));
    await userEvent.type(
      within(sheet).getByLabelText("Instruction to the model"),
      "The fee budget the parent mentions.",
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Create rule" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
        fieldKey: "budget_band",
        dataType: "enum",
        enumValues: ["low", "mid", "high"],
        requiresQuote: true,
        isActive: true,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("not available; heads gated", async () => {
    mockApi({});
    const a = renderUI(<LlmPage />, { role: "admin" });
    expect(await screen.findByText("LLM settings service not available yet")).toBeTruthy();
    expect(await screen.findByText("Extraction rules service not available yet")).toBeTruthy();
    a.unmount();
    for (const Page of [LlmPage, EmailPage]) {
      const calls = mockApi({});
      const r = renderUI(<Page />, { role: "admission_head" });
      expect(screen.getByText("Not available for your role")).toBeTruthy();
      expect(calls).toHaveLength(0);
      r.unmount();
    }
  });
});
