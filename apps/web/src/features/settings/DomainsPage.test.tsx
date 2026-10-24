// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { tenantDomain } from "@vernacular/contracts";
import { DomainsPage } from "@/features/settings/DomainsPage";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract.
const ID = "01a14679-0000-7000-8000-000000000ba1";
const pending = tenantDomain.parse({
  id: ID,
  hostname: "admissions.college.edu",
  cnameTarget: "app.laveric.com",
  txtName: "_vernacular.admissions.college.edu",
  verificationToken: "vrf_7b1c9e2a",
  verifiedAt: null,
  tlsStatus: "pending",
  lastCheckedAt: "2026-10-17T04:00:00.000Z",
  lastError: "TXT record not found",
  createdAt: "2026-10-17T03:00:00.000Z",
});
const verified = {
  ...pending,
  verifiedAt: "2026-10-17T05:00:00.000Z",
  tlsStatus: "issued",
  lastError: null,
};

describe("/settings/domains (D6-I4-02)", () => {
  it("unverified: CNAME + TXT instructions with copy fields, last error, badges", async () => {
    mockApi({ "GET /api/settings/domains": () => ({ body: { items: [pending] } }) });
    const { container } = renderUI(<DomainsPage />, { role: "owner" });
    const card = await screen.findByRole("article", { name: "admissions.college.edu" });
    expect(within(card).getByText("Not verified")).toBeTruthy();
    expect(within(card).getByText("Certificate pending")).toBeTruthy();
    expect(within(card).getByText("TXT record not found")).toBeTruthy();
    expect((within(card).getAllByLabelText("Value / target")[0] as HTMLInputElement).value).toBe(
      "app.laveric.com",
    );
    expect((within(card).getByLabelText("Value") as HTMLInputElement).value).toBe("vrf_7b1c9e2a");
    expect(within(card).getByText("Last checked 17 Oct, 9:30 am")).toBeTruthy();
    expectSmallScreenSafe(container);
  });

  it("verify shows the server's result (verified + HTTPS active, instructions hidden)", async () => {
    mockApi({
      "GET /api/settings/domains": () => ({ body: { items: [pending] } }),
      [`POST /api/settings/domains/${ID}/verify`]: () => ({ body: verified }),
    });
    renderUI(<DomainsPage />, { role: "owner" });
    await userEvent.click(await screen.findByRole("button", { name: /Verify now/ }));
    expect(await screen.findByText("HTTPS active")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.queryByText(/CNAME — points your address/)).toBeNull();
  });

  it("add validates the hostname (no scheme), lowercases it, and appends the server's domain", async () => {
    const calls = mockApi({
      "GET /api/settings/domains": () => ({ body: { items: [] } }),
      "POST /api/settings/domains": () => ({ status: 201, body: pending }),
    });
    renderUI(<DomainsPage />, { role: "admin" });
    expect(await screen.findByText("No custom domain yet")).toBeTruthy();
    await userEvent.type(
      screen.getByLabelText("Add a domain", { selector: "input" }),
      "https://x.edu",
    );
    await userEvent.click(screen.getByRole("button", { name: /Add domain/ }));
    expect(screen.getByText(/no https:\/\//)).toBeTruthy();
    await userEvent.clear(screen.getByLabelText("Add a domain", { selector: "input" }));
    await userEvent.type(
      screen.getByLabelText("Add a domain", { selector: "input" }),
      "Admissions.College.EDU",
    );
    await userEvent.click(screen.getByRole("button", { name: /Add domain/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        hostname: "admissions.college.edu",
      }),
    );
    expect(await screen.findByRole("article", { name: "admissions.college.edu" })).toBeTruthy();
  });

  it("remove asks first", async () => {
    mockApi({
      "GET /api/settings/domains": () => ({ body: { items: [verified] } }),
      [`DELETE /api/settings/domains/${ID}`]: () => ({ status: 200, body: {} }),
    });
    renderUI(<DomainsPage />, { role: "owner" });
    await userEvent.click(await screen.findByRole("button", { name: /Remove/ }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("No custom domain yet")).toBeTruthy();
  });

  it("states and roles", async () => {
    mockApi({});
    const a = renderUI(<DomainsPage />, { role: "owner" });
    expect(await screen.findByText("Domains service not available yet")).toBeTruthy();
    a.unmount();
    const calls = mockApi({});
    renderUI(<DomainsPage />, { role: "counsellor" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});
