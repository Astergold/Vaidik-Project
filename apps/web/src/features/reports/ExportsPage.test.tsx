// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { exportJob } from "@vernacular/contracts";
import { ExportsPage } from "@/features/reports/ExportsPage";
import { saveBlob } from "@/lib/download";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

vi.mock("@/lib/download", () => ({ saveBlob: vi.fn() }));

const job = (over: object = {}) =>
  exportJob.parse({
    id: "01a14679-0000-7000-8000-000000003aa1",
    kind: "applications",
    status: "ready",
    description: "1 Oct – 17 Oct 2026",
    rowCount: 1240,
    requestedBy: "Owner One",
    createdAt: "2026-10-17T05:00:00.000Z",
    readyAt: "2026-10-17T05:01:00.000Z",
    expiresAt: "2026-10-24T05:00:00.000Z",
    failureReason: null,
    ...over,
  });

describe("/reports/exports (D6-I4-04d)", () => {
  it("request validates the range, posts kind + dates, lists the server's job", async () => {
    const calls = mockApi({
      "GET /api/reports/exports": () => ({ body: { items: [] } }),
      "POST /api/reports/exports": () => ({
        status: 202,
        body: job({ status: "queued", rowCount: null, readyAt: null, expiresAt: null }),
      }),
    });
    const { container } = renderUI(<ExportsPage />, { role: "admin" });
    expect(await screen.findByText("No exports yet")).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("What"), "applications");
    await userEvent.type(screen.getByLabelText("From (optional)"), "2026-10-17");
    await userEvent.type(screen.getByLabelText("To (optional)"), "2026-10-01");
    await userEvent.click(screen.getByRole("button", { name: /Create CSV/ }));
    expect(screen.getByText("End after the start")).toBeTruthy();
    await userEvent.clear(screen.getByLabelText("From (optional)"));
    await userEvent.type(screen.getByLabelText("From (optional)"), "2026-09-01");
    await userEvent.click(screen.getByRole("button", { name: /Create CSV/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        kind: "applications",
        from: "2026-09-01",
        to: "2026-10-01",
      }),
    );
    expect(await screen.findByText("Queued")).toBeTruthy();
    expectSmallScreenSafe(container);
  });

  it("ready jobs download as CSV via apiGetBlob; failed jobs show the reason", async () => {
    mockApi({
      "GET /api/reports/exports": () => ({
        body: {
          items: [
            job(),
            job({
              id: "01a14679-0000-7000-8000-000000003aa2",
              kind: "calls",
              status: "failed",
              failureReason: "Too many rows; narrow the dates",
            }),
          ],
        },
      }),
      "GET /api/reports/exports/01a14679-0000-7000-8000-000000003aa1/file": () => ({ body: {} }),
    });
    renderUI(<ExportsPage />, { role: "owner" });
    expect(await screen.findByText("Too many rows; narrow the dates")).toBeTruthy();
    expect(screen.getByText(/1,240 rows · available until 24 Oct/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Download Applications CSV/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(vi.mocked(saveBlob).mock.calls.at(-1)![1]).toBe("applications-2026-10-17.csv");
  });

  it("not available; counsellors gated", async () => {
    mockApi({});
    const a = renderUI(<ExportsPage />, { role: "admin" });
    expect(await screen.findByText("Reports service not available yet")).toBeTruthy();
    a.unmount();
    const calls = mockApi({});
    renderUI(<ExportsPage />, { role: "counsellor" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});
