// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { duplicatesResponse } from "@vernacular/contracts";
import { DuplicatesPage, suggestSurvivor } from "@/features/duplicates/DuplicatesPage";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract.
const CAND = "01a14679-0000-7000-8000-000000002aa1";
const A = "01a14679-0000-7000-8000-000000002ab1";
const B = "01a14679-0000-7000-8000-000000002ab2";
const person = (id: string, name: string, leads: number, calls: number) => ({
  id,
  fullName: name,
  city: "Pune",
  identifiers: [{ kind: "phone", value: "+91******4321" }],
  leads: Array.from({ length: leads }, (_, i) => ({
    id: `01a14679-0000-7000-8000-0000000${id.slice(-5)}${i}`.slice(0, 36),
    stage: "interested",
    cycle: "2026-27",
    program: "B.Des",
    source: "Website",
    createdAt: "2026-09-01T00:00:00.000Z",
  })),
  callCount: calls,
  lastActivityAt: "2026-10-10T00:00:00.000Z",
});
const list = duplicatesResponse.parse({
  nextCursor: null,
  total: 1,
  items: [
    {
      id: CAND,
      reason: "same_phone",
      score: 0.93,
      a: person(A, "Asha Rao", 1, 2),
      b: person(B, "Asha R.", 0, 1),
      detectedAt: "2026-10-17T00:30:00.000Z",
    },
  ],
});

describe("/leads/duplicates (D6-I4-04c)", () => {
  it("side by side: reason, score, identifiers as received, leads; survivor suggested by leads then calls", async () => {
    expect(suggestSurvivor(list.items[0]!)).toBe("a");
    mockApi({ "GET /api/duplicates": () => ({ body: list }) });
    const { container } = renderUI(<DuplicatesPage />, { role: "admission_head" });
    const pair = await screen.findByRole("article", { name: "Asha Rao and Asha R." });
    expect(within(pair).getByText("Same phone number")).toBeTruthy();
    expect(within(pair).getByText(/93% likely/)).toBeTruthy();
    expect(within(pair).getAllByText("+91******4321")).toHaveLength(2);
    expect((within(pair).getAllByRole("radio")[0] as HTMLInputElement).checked).toBe(true);
    expectSmallScreenSafe(container);
  });

  it("merge: confirm states calls are kept; posts only survivor/merged ids; shows what moved", async () => {
    const calls = mockApi({
      "GET /api/duplicates": () => ({ body: list }),
      "POST /api/persons/merge": () => ({
        body: { survivorId: B, moved: { leads: 1, calls: 2, identifiers: 1, notes: 0 } },
      }),
    });
    renderUI(<DuplicatesPage />, { role: "admin" });
    const pair = await screen.findByRole("article", { name: "Asha Rao and Asha R." });
    await userEvent.click(within(pair).getAllByRole("radio")[1]!);
    await userEvent.click(within(pair).getByRole("button", { name: /Merge into Asha R\./ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/No call is deleted/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Merge" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        candidateId: CAND,
        survivorId: B,
        mergedId: A,
      }),
    );
    expect(await screen.findByText(/Merged into Asha R\.: 1 lead\(s\), 2 call\(s\)/)).toBeTruthy();
    expect(screen.getByText("No suspected duplicates")).toBeTruthy();
  });

  it("dismiss removes the pair after the server confirms; counsellors only read", async () => {
    mockApi({
      "GET /api/duplicates": () => ({ body: list }),
      [`POST /api/duplicates/${CAND}/dismiss`]: () => ({ body: { id: CAND, status: "dismissed" } }),
    });
    const a = renderUI(<DuplicatesPage />, { role: "owner" });
    await userEvent.click(await screen.findByRole("button", { name: /Not the same person/ }));
    expect(await screen.findByText("Marked as different people.")).toBeTruthy();
    a.unmount();

    mockApi({ "GET /api/duplicates": () => ({ body: list }) });
    renderUI(<DuplicatesPage />, { role: "counsellor" });
    expect(await screen.findByText(/Ask your admission head/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Merge/ })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("not available; merge errors shown", async () => {
    mockApi({});
    const a = renderUI(<DuplicatesPage />, { role: "admin" });
    expect(await screen.findByText("Duplicates service not available yet")).toBeTruthy();
    a.unmount();

    mockApi({
      "GET /api/duplicates": () => ({ body: list }),
      "POST /api/persons/merge": () => ({
        status: 409,
        body: { error: { code: "ALREADY_MERGED", message: "One of them was already merged" } },
      }),
    });
    renderUI(<DuplicatesPage />, { role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: /Merge into/ }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Merge" }),
    );
    expect((await screen.findAllByText("One of them was already merged")).length).toBeGreaterThan(
      0,
    );
  });
});
