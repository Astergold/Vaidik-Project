// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { statementsResponse } from "@vernacular/contracts";
import { BillingPage } from "@/features/billing/BillingPage";
import { saveBlob } from "@/lib/download";
import { walletFixture } from "@/test/fixtures/billing";
import { mockApi, renderUI } from "@/test/utils";

vi.mock("@/lib/download", () => ({ saveBlob: vi.fn() }));

const ID = "01a14679-0000-7000-8000-000000000fb1";
const statements = statementsResponse.parse({
  items: [
    {
      id: ID,
      period: "2026-09",
      totals: {
        planFeePaise: 1_500_000,
        usagePaise: 350_000,
        overagePaise: 120_050,
        topUpsPaise: 2_000_000,
        totalDuePaise: 1_620_050,
      },
      createdAt: "2026-10-01T00:30:00.000Z",
      formats: ["csv", "pdf"],
    },
  ],
});
const base = {
  "GET /api/billing/wallet": () => ({ body: walletFixture() }),
  "GET /api/billing/usage": () => ({
    body: { from: "2026-10-01", to: "2026-10-17", days: [], totals: [] },
  }),
};

describe("/settings/billing statements (D6-I4-03)", () => {
  it("lists the server's totals and downloads CSV/PDF through apiGetBlob", async () => {
    const calls = mockApi({
      ...base,
      "GET /api/billing/statements": () => ({ body: statements }),
      [`GET /api/billing/statements/${ID}/file`]: () => ({ body: {} }),
    });
    renderUI(<BillingPage />, { role: "owner" });
    const row = (await screen.findByText("September 2026")).closest("tr")!;
    for (const t of ["₹15,000", "₹3,500", "₹1,200.5", "₹20,000", "₹16,200.5"])
      expect(within(row).getByText(t)).toBeTruthy();
    await userEvent.click(
      within(row).getByRole("button", { name: "Download September 2026 as PDF" }),
    );
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(vi.mocked(saveBlob).mock.calls.at(-1)![1]).toBe("statement-2026-09.pdf");
    expect(calls.find((c) => c.path.endsWith("/file"))!.query.get("format")).toBe("pdf");
  });

  it("a failed download is explained; empty and not-available states", async () => {
    mockApi({
      ...base,
      "GET /api/billing/statements": () => ({ body: statements }),
      [`GET /api/billing/statements/${ID}/file`]: () => ({
        status: 410,
        body: { error: { code: "GONE", message: "That file has expired" } },
      }),
    });
    const a = renderUI(<BillingPage />, { role: "owner" });
    await userEvent.click(
      await screen.findByRole("button", { name: "Download September 2026 as CSV" }),
    );
    expect(await screen.findByText("That file has expired")).toBeTruthy();
    a.unmount();

    mockApi({ ...base, "GET /api/billing/statements": () => ({ body: { items: [] } }) });
    const b = renderUI(<BillingPage />, { role: "owner" });
    expect(await screen.findByText("No statements yet")).toBeTruthy();
    b.unmount();

    mockApi(base);
    renderUI(<BillingPage />, { role: "owner" });
    const section = (await screen.findByRole("heading", { name: "Statements" })).closest(
      "section",
    )!;
    expect(await within(section).findByText("Billing service not available yet")).toBeTruthy();
  });
});
