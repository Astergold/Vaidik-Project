import { expect } from "vitest";

/**
 * Small-screen structure checks (390 px) that jsdom can make without a layout engine: no fixed widths of 100px+
 * in arbitrary values, and every table scrolls inside its own overflow-x-auto container (never the page).
 * The real pixel check is the D7-I4-02 screenshot sweep.
 */
export function expectSmallScreenSafe(root: ParentNode = document.body) {
  const html = root instanceof Element ? root.outerHTML : document.body.innerHTML;
  expect(html).not.toMatch(/\b(?:min-)?w-\[\d{3,}px\]/);
  for (const table of root.querySelectorAll("table")) {
    expect(
      table.closest(".overflow-x-auto"),
      "table must scroll inside its own container",
    ).not.toBeNull();
  }
}
