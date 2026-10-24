// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { Switch } from "@/components/Switch";
import { Tabs, tabPanelProps } from "@/components/Tabs";
import { ApiCallError } from "@/lib/api";
import { errText } from "@/lib/seam";
import { renderUI } from "@/test/utils";

const q = (over: Partial<Parameters<typeof QueryGate>[0]["q"]> = {}) => ({
  isPending: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
  ...over,
});
const missing = new ApiCallError(404, "NOT_FOUND", "Route not found");

describe("QueryGate", () => {
  it("loading, not available, forbidden, error (with retry), empty, content", async () => {
    const a = renderUI(
      <QueryGate q={q({ isPending: true })} what="things" service="Things">
        content
      </QueryGate>,
    );
    expect(screen.getByLabelText("Loading things")).toBeTruthy();
    a.unmount();

    const b = renderUI(
      <QueryGate q={q({ isError: true, error: missing })} what="things" service="Things">
        content
      </QueryGate>,
    );
    expect(screen.getByText("Things service not available yet")).toBeTruthy();
    expect(screen.queryByText("content")).toBeNull();
    b.unmount();

    const c = renderUI(
      <QueryGate
        q={q({ isError: true, error: new ApiCallError(403, "FORBIDDEN", "Owners only") })}
        what="things"
        service="Things"
      >
        content
      </QueryGate>,
    );
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(screen.getByText("Owners only")).toBeTruthy();
    c.unmount();

    const failing = q({ isError: true, error: new ApiCallError(500, "INTERNAL", "Boom") });
    const d = renderUI(
      <QueryGate q={failing} what="things" service="Things">
        content
      </QueryGate>,
    );
    expect(screen.getByText("Couldn't load things")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(failing.refetch).toHaveBeenCalled();
    d.unmount();

    const e = renderUI(
      <QueryGate q={q()} what="things" service="Things" empty={<p>Nothing yet</p>}>
        content
      </QueryGate>,
    );
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    e.unmount();

    renderUI(
      <QueryGate q={q()} what="things" service="Things" empty={false}>
        content
      </QueryGate>,
    );
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("errText: missing route, server message, fallback", () => {
    expect(errText(missing, "x")).toBe("This isn't available yet.");
    expect(errText(new ApiCallError(409, "CONFLICT", "Already linked"), "x")).toBe(
      "Already linked",
    );
    expect(errText(new Error("raw"), "fallback")).toBe("fallback");
  });
});

describe("RoleGate", () => {
  it("renders for listed roles only (sitemap is the source of truth)", () => {
    const a = renderUI(<RoleGate page="settings.billing">secret</RoleGate>, {
      role: "counsellor",
    });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(screen.queryByText("secret")).toBeNull();
    a.unmount();
    renderUI(<RoleGate page="settings.billing">secret</RoleGate>, { role: "owner" });
    expect(screen.getByText("secret")).toBeTruthy();
  });
});

describe("Tabs + Switch", () => {
  function Harness() {
    const [v, setV] = useState<"a" | "b" | "c">("a");
    return (
      <>
        <Tabs
          id="t"
          label="Sections"
          value={v}
          onChange={setV}
          items={[
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
            { value: "c", label: "Gamma" },
          ]}
        />
        <div {...tabPanelProps("t", v)}>panel {v}</div>
      </>
    );
  }

  it("arrow keys move selection; panel is labelled by its tab", async () => {
    renderUI(<Harness />);
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    expect(alpha.getAttribute("aria-selected")).toBe("true");
    alpha.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Beta" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Beta" }).textContent).toBe("panel b");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Gamma" }).getAttribute("aria-selected")).toBe("true");
  });

  it("switch reports the next value", async () => {
    const onChange = vi.fn();
    renderUI(<Switch checked={false} onChange={onChange} label="Auto-run" />);
    await userEvent.click(screen.getByRole("switch", { name: "Auto-run" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
