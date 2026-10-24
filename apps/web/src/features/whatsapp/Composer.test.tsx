// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { templatesResponse, whatsappMessage } from "@vernacular/contracts";
import { Composer } from "@/features/whatsapp/Composer";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract.
const LEAD = "01a14679-0000-7000-8000-0000000001a1";
const TPL = "01a14679-0000-7000-8000-0000000003a1";
const open = {
  messages: [],
  freeTextAllowed: true,
  freeTextWindowEndsAt: "2026-10-18T05:00:00.000Z",
  suppression: null,
};
const closed = { ...open, freeTextAllowed: false, freeTextWindowEndsAt: null };
const queued = whatsappMessage.parse({
  id: "01a14679-0000-7000-8000-0000000002f1",
  direction: "outbound",
  status: "queued",
  kind: "text",
  body: "See you Monday",
  template: null,
  sentBy: { kind: "user", name: "Chitra" },
  failureReason: null,
  createdAt: "2026-10-17T05:00:00.000Z",
  statusAt: null,
});
const templates = templatesResponse.parse({
  syncedAt: "2026-10-17T00:00:00.000Z",
  items: [
    {
      id: TPL,
      name: "visit_reminder",
      language: "en",
      category: "utility",
      body: "Hi {{1}}, your visit is on {{2}}.",
      status: "approved",
      variables: [
        { key: "1", label: "Student name", field: "first_name", defaultValue: "Asha" },
        { key: "2", label: "Visit date", field: null, defaultValue: null },
      ],
    },
    {
      id: "01a14679-0000-7000-8000-0000000003a2",
      name: "pending_one",
      language: "en",
      category: "marketing",
      body: "x",
      status: "pending",
      variables: [],
    },
  ],
});

describe("WhatsApp composer (D5-I4-02)", () => {
  it("24 h window closed (server says so): free text disabled with a notice; template still offered", () => {
    mockApi({});
    renderUI(<Composer leadId={LEAD} gate={closed} />);
    expect(screen.getByText(/24-hour reply window is closed/)).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: /Send template/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("window open: shows when it closes (tenant tz) and sends free text; box clears when the server queues it", async () => {
    const calls = mockApi({
      "POST /api/messages": () => ({ status: 201, body: { message: queued } }),
    });
    renderUI(<Composer leadId={LEAD} gate={open} />);
    expect(screen.getByText(/Free-text window open until 18 Oct/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Message"), "See you Monday");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(calls[0]?.body).toEqual({ leadId: LEAD, kind: "text", text: "See you Monday" }),
    );
    await waitFor(() =>
      expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe(""),
    );
  });

  it("a policy block comes back as a typed rejection and is explained (text kept)", async () => {
    mockApi({
      "POST /api/messages": () => ({ body: { message: null, rejection: { code: "NO_CONSENT" } } }),
    });
    renderUI(<Composer leadId={LEAD} gate={open} />);
    await userEvent.type(screen.getByLabelText("Message"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Message not sent");
    expect(alert.textContent).toContain("NO_CONSENT");
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Hello");
  });

  it("suppressed (STOP): every send control is disabled", () => {
    mockApi({});
    renderUI(
      <Composer
        leadId={LEAD}
        gate={{ ...open, suppression: { reason: "opt_out", since: "2026-10-16T00:00:00.000Z" } }}
      />,
    );
    expect(screen.getByText("Sending is blocked for this number.")).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: /Send template/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("template dialog: approved only, variables pre-filled from the lead, live preview, send needs every variable", async () => {
    const calls = mockApi({
      "GET /api/whatsapp/templates": () => ({ body: templates }),
      "POST /api/messages": () => ({
        status: 201,
        body: { message: { ...queued, kind: "template" } },
      }),
    });
    renderUI(<Composer leadId={LEAD} gate={closed} />);
    await userEvent.click(screen.getByRole("button", { name: /Send template/ }));
    const dialog = await screen.findByRole("dialog");
    const select = await within(dialog).findByLabelText("Template");
    expect(within(select).queryByText(/pending_one/)).toBeNull();
    await userEvent.selectOptions(select, TPL);
    expect((within(dialog).getByLabelText(/Student name/) as HTMLInputElement).value).toBe("Asha");
    const preview = within(dialog).getByLabelText("Template preview");
    expect(preview.textContent).toBe("Hi Asha, your visit is on [Visit date].");
    const send = within(dialog).getByRole("button", { name: "Send template" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText(/Visit date/), "Mon 20 Oct, 11 am");
    expect(preview.textContent).toBe("Hi Asha, your visit is on Mon 20 Oct, 11 am.");
    await userEvent.click(send);
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        leadId: LEAD,
        kind: "template",
        templateId: TPL,
        variables: { "1": "Asha", "2": "Mon 20 Oct, 11 am" },
      }),
    );
    expect(calls.find((c) => c.path === "/api/whatsapp/templates")!.query.get("leadId")).toBe(LEAD);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("template service missing → says so in the dialog", async () => {
    mockApi({});
    renderUI(<Composer leadId={LEAD} gate={closed} />);
    await userEvent.click(screen.getByRole("button", { name: /Send template/ }));
    expect(await screen.findByText("WhatsApp templates aren't available yet.")).toBeTruthy();
  });
});
