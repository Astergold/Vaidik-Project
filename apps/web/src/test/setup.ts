import { afterEach, vi } from "vitest";

// Testing Library only auto-cleans with vitest globals; we don't enable globals, so do it here.
afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
  vi.unstubAllGlobals();
});

// jsdom lacks a few browser APIs Radix menus/popovers touch. No-op stubs, test-only.
if (typeof window !== "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
}
