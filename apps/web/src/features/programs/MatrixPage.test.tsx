// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { programsListResponse } from "@vernacular/contracts";
import { academicYearOf, nextYear, tuitionFor } from "@/features/programs/matrix";
import { MatrixPage } from "@/features/programs/MatrixPage";
import { todayIn } from "@/features/dashboard/dashboard-search";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

const AY = academicYearOf(todayIn("Asia/Kolkata"));
const PID = "01a14679-0000-7000-8000-000000003ba1";
const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
const programs = programsListResponse.parse({
  items: [
    {
      id: PID,
      name: "B.Des",
      code: "BDES",
      isActive: true,
      fees: [
        {
          id: "01a14679-0000-7000-8000-000000003bb1",
          amount: 250000,
          currency: "INR",
          academicYear: AY,
          kind: "tuition",
        },
        {
          id: "01a14679-0000-7000-8000-000000003bb2",
          amount: 90000,
          currency: "INR",
          academicYear: AY,
          kind: "hostel",
        },
      ],
      seats: [{ academicYear: AY, bucket: "open" }],
      deadlines: [
        { id: "01a14679-0000-7000-8000-000000003bc1", kind: "application", dueAt: future },
        { id: "01a14679-0000-7000-8000-000000003bc2", kind: "fee_payment", dueAt: past },
      ],
      eligibility: null,
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
  ],
});

describe("/programs/matrix (D6-I4-04d)", () => {
  it("academic year starts in June; tuition = lowest tuition fee of the year", () => {
    expect(academicYearOf("2026-10-17")).toBe("2026-27");
    expect(academicYearOf("2027-03-10")).toBe("2026-27");
    expect(academicYearOf("2026-06-01")).toBe("2026-27");
    expect(nextYear("2026-27")).toBe("2027-28");
    expect(tuitionFor(programs.items[0]!, AY)).toBe(250000);
    expect(tuitionFor(programs.items[0]!, nextYear(AY))).toBeNull();
  });

  it("grid: bucket (categorical), tuition, only upcoming deadlines; admins flip the bucket inline via the D4 seat endpoint", async () => {
    const calls = mockApi({
      "GET /api/programs": () => ({ body: programs }),
      [`PUT /api/programs/${PID}/seat`]: ({ body }) => ({
        body: { ...programs.items[0], seats: [body] },
      }),
    });
    const { container } = renderUI(<MatrixPage />, { role: "admin" });
    const row = (await screen.findByText("B.Des")).closest("tr")!;
    expect(within(row).getByText("₹2,50,000")).toBeTruthy();
    expect(within(row).getByText(/Applications ·/)).toBeTruthy();
    expect(within(row).queryByText(/Fee payment/)).toBeNull();
    const group = within(row).getByRole("group", { name: "Seats for B.Des" });
    expect(
      within(group).getByRole("button", { name: "Seats open" }).getAttribute("aria-pressed"),
    ).toBe("true");
    await userEvent.click(within(group).getByRole("button", { name: "Limited seats" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        academicYear: AY,
        bucket: "limited",
      }),
    );
    await waitFor(() =>
      expect(
        within(group).getByRole("button", { name: "Limited seats" }).getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(container.textContent).not.toMatch(/\d+ seats? (left|available)/i);
    expectSmallScreenSafe(container);
  });

  it("next year has no bucket yet; heads read only; not available", async () => {
    mockApi({ "GET /api/programs": () => ({ body: programs }) });
    const a = renderUI(<MatrixPage />, { role: "admission_head" });
    expect(await screen.findByText("Seats open")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Seats for B.Des" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: nextYear(AY) }));
    expect(await screen.findByText("Not set")).toBeTruthy();
    a.unmount();
    mockApi({});
    renderUI(<MatrixPage />, { role: "admin" });
    expect(await screen.findByText("Programs service not available yet")).toBeTruthy();
  });
});
