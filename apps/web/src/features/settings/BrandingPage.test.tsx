// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { brandingSettings } from "@vernacular/contracts";
import { BrandMark } from "@/components/BrandMark";
import { BrandingPage, checkAsset } from "@/features/settings/BrandingPage";
import { BrandingProvider, DEFAULT_BRANDING } from "@/lib/branding";
import { expectSmallScreenSafe } from "@/test/layout";
import { mockApi, renderUI } from "@/test/utils";

// TEST fixtures parsed with the proposed contract.
const saved = brandingSettings.parse({
  productName: "MIT-ADT Admissions",
  logoUrl: null,
  faviconUrl: null,
  brandColor: "#1d4ed8",
  emailFrom: null,
  whatsappSender: null,
  updatedAt: "2026-10-01T00:00:00.000Z",
});
const brand = () => document.documentElement.style.getPropertyValue("--brand");

/** The page plus an app-shell BrandMark outside it, all under one provider (like the real root). */
function App({ show = true }: { show?: boolean }) {
  return (
    <BrandingProvider
      branding={{
        ...DEFAULT_BRANDING,
        productName: saved.productName,
        brandColor: saved.brandColor,
      }}
    >
      <header data-testid="shell">
        <BrandMark />
      </header>
      {show && <BrandingPage />}
    </BrandingProvider>
  );
}

describe("/settings/branding live preview (D6-I4-02)", () => {
  it("typing previews the product name and colour app-wide instantly, with no request", async () => {
    const calls = mockApi({ "GET /api/settings/branding": () => ({ body: saved }) });
    const { container } = renderUI(<App />, { role: "owner" });
    const name = await screen.findByLabelText("Product name");
    const before = calls.length;
    await userEvent.clear(name);
    await userEvent.type(name, "Demo Admissions");
    fireEvent.change(screen.getByLabelText("Brand colour"), { target: { value: "#16a34a" } });
    expect(within(screen.getByTestId("shell")).getByText("Demo Admissions")).toBeTruthy();
    await waitFor(() => expect(brand()).toBe("#16a34a"));
    expect(calls.length).toBe(before); // preview never fetches
    expectSmallScreenSafe(container);
  });

  it("a half-typed hex doesn't reach --brand; Cancel restores the saved branding", async () => {
    mockApi({ "GET /api/settings/branding": () => ({ body: saved }) });
    renderUI(<App />, { role: "owner" });
    const hex = await screen.findByLabelText("Brand colour hex");
    await userEvent.clear(hex);
    await userEvent.type(hex, "#16a");
    await waitFor(() => expect(brand()).toBe("#1d4ed8"));
    await userEvent.type(screen.getByLabelText("Product name"), " X");
    await userEvent.click(screen.getByRole("button", { name: /Cancel changes/ }));
    expect(within(screen.getByTestId("shell")).getByText("MIT-ADT Admissions")).toBeTruthy();
  });

  it("leaving the page drops the preview", async () => {
    mockApi({ "GET /api/settings/branding": () => ({ body: saved }) });
    const r = renderUI(<App />, { role: "owner" });
    await userEvent.type(await screen.findByLabelText("Product name"), " Preview");
    expect(
      within(screen.getByTestId("shell")).getByText("MIT-ADT Admissions Preview"),
    ).toBeTruthy();
    r.rerender(<App show={false} />);
    await waitFor(() =>
      expect(within(screen.getByTestId("shell")).getByText("MIT-ADT Admissions")).toBeTruthy(),
    );
  });

  it("save sends one PUT (logo removal as null) and shows Saved", async () => {
    const withLogo = { ...saved, logoUrl: "/api/files/logo.png" };
    const calls = mockApi({
      "GET /api/settings/branding": () => ({ body: withLogo }),
      "PUT /api/settings/branding": ({ body }) => ({ body: { ...withLogo, ...(body as object) } }),
    });
    renderUI(<App />, { role: "owner" });
    await userEvent.click(await screen.findByRole("button", { name: /Remove/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save branding" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        productName: "MIT-ADT Admissions",
        brandColor: "#1d4ed8",
        logoUrl: null,
      }),
    );
    expect(await screen.findByText("Saved")).toBeTruthy();
  });

  it("asset checks and upload: wrong type/oversize refused before upload; a good file posts multipart", async () => {
    expect(checkAsset({ type: "application/pdf", size: 10 })).toMatch(/PNG, SVG/);
    expect(checkAsset({ type: "image/png", size: 2 * 1024 * 1024 })).toMatch(/limit is 1 MB/);
    expect(checkAsset({ type: "image/png", size: 1000 })).toBeNull();
    const calls = mockApi({
      "GET /api/settings/branding": () => ({ body: saved }),
      "POST /api/settings/branding/assets": () => ({
        body: { ...saved, logoUrl: "/api/files/new-logo.png" },
      }),
    });
    renderUI(<App />, { role: "owner" });
    const input = await screen.findByLabelText("Upload logo");
    await userEvent.upload(input, new File(["png"], "logo.png", { type: "image/png" }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/api/settings/branding/assets")).toBe(true),
    );
    const form = calls.find((c) => c.path === "/api/settings/branding/assets")!.body as FormData;
    expect(form.get("kind")).toBe("logo");
  });

  it("states and roles", async () => {
    mockApi({});
    const a = renderUI(<App />, { role: "owner" });
    expect(await screen.findByText("Branding service not available yet")).toBeTruthy();
    a.unmount();
    const calls = mockApi({});
    renderUI(<BrandingPage />, { role: "admission_head" });
    expect(screen.getByText("Not available for your role")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});

describe("BrandingProvider (root)", () => {
  it("uses GET /api/branding when it exists, defaults when it doesn't", async () => {
    mockApi({
      "GET /api/branding": () => ({
        body: {
          productName: "Demo College",
          logoUrl: null,
          faviconUrl: null,
          brandColor: "#b91c1c",
        },
      }),
    });
    const a = renderUI(
      <BrandingProvider>
        <BrandMark />
      </BrandingProvider>,
    );
    expect(await screen.findByText("Demo College")).toBeTruthy();
    await waitFor(() => expect(brand()).toBe("#b91c1c"));
    a.unmount();
    mockApi({});
    renderUI(
      <BrandingProvider>
        <BrandMark />
      </BrandingProvider>,
    );
    expect(await screen.findByText("Vernacular AI")).toBeTruthy();
  });
});
