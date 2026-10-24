// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { notificationsResponse } from "@vernacular/contracts";
import { Topbar } from "@/components/Topbar";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

const N1 = "01a14679-0000-7000-8000-000000001ba1";
const N2 = "01a14679-0000-7000-8000-000000001ba2";
const LEAD = "01a14679-0000-7000-8000-000000001bb1";
const page = (unreadOnly: boolean, read = false) =>
  notificationsResponse.parse({
    unreadCount: read ? 1 : 2,
    nextCursor: null,
    items: [
      {
        id: N1,
        kind: "sla_breach",
        title: "Asha Rao: call back overdue",
        body: "Due 2 hours ago",
        link: `/leads/${LEAD}`,
        createdAt: "2026-10-17T05:00:00.000Z",
        readAt: read ? "2026-10-17T06:00:00.000Z" : null,
      },
      {
        id: N2,
        kind: "something_new",
        title: "Phishing?",
        body: null,
        link: "https://evil.example/x",
        createdAt: "2026-10-17T04:00:00.000Z",
        readAt: null,
      },
    ].filter((n) => !unreadOnly || n.readAt === null),
  });

describe("/notifications (D6-I4-04a)", () => {
  it("unread first; known kinds labelled, unknown generic; clicking opens the lead and marks it read", async () => {
    let read = false;
    const calls = mockApi({
      "GET /api/notifications": ({ query }) => ({
        body: page(query.get("unread") === "true", read),
      }),
      [`POST /api/notifications/${N1}/read`]: () => {
        read = true;
        return { body: { ...page(false).items[0], readAt: "2026-10-17T06:00:00.000Z" } };
      },
    });
    const { router, container } = renderUI(<NotificationsPage />, { role: "counsellor" });
    expect(await screen.findByText("Overdue")).toBeTruthy();
    expect(screen.getByText("Update")).toBeTruthy(); // unknown kind
    expect(within(screen.getByRole("tab", { name: /Unread/ })).getByText("2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Phishing?" })).toBeNull(); // absolute link not followed
    await userEvent.click(screen.getByRole("button", { name: "Asha Rao: call back overdue" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/leads/${LEAD}`));
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith(`${N1}/read`))).toBe(true);
    expectSmallScreenSafe(container);
  });

  it("mark all read refetches the server's lists", async () => {
    let cleared = false;
    mockApi({
      "GET /api/notifications": () => ({
        body: cleared ? { items: [], unreadCount: 0, nextCursor: null } : page(true),
      }),
      "POST /api/notifications/read-all": () => {
        cleared = true;
        return { body: { unreadCount: 0 } };
      },
    });
    renderUI(<NotificationsPage />, { role: "admin" });
    await userEvent.click(await screen.findByRole("button", { name: /Mark all read/ }));
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
  });

  it("not available; every role (incl. super-admin) can open it", async () => {
    for (const role of ["super_admin", "owner", "counsellor"] as const) {
      mockApi({});
      const r = renderUI(<NotificationsPage />, { role });
      expect(await screen.findByText("Notifications service not available yet")).toBeTruthy();
      r.unmount();
    }
  });
});

describe("bell badge", () => {
  it("shows the server's unread count; no badge when the API is missing", async () => {
    mockApi({
      "GET /api/notifications": () => ({ body: { items: [], unreadCount: 7, nextCursor: null } }),
    });
    const a = renderUI(<Topbar onOpenNav={() => {}} />, { role: "counsellor" });
    expect(await screen.findByRole("link", { name: "Notifications, 7 unread" })).toBeTruthy();
    a.unmount();
    mockApi({});
    renderUI(<Topbar onOpenNav={() => {}} />, { role: "counsellor" });
    await waitFor(() => expect(screen.getByRole("link", { name: "Notifications" })).toBeTruthy());
  });
});
