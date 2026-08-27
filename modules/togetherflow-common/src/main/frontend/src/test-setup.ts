import "@testing-library/jest-dom/vitest";

/*
 * jsdom implements no ResizeObserver. Every browser this product supports has had it
 * since 2020, so this is jsdom's gap rather than something the app should feature-detect
 * around — `DataTable` uses it to size the virtualized window (C1).
 *
 * A no-op rather than a measuring fake: jsdom has no layout, so every box it could report
 * would be zero anyway. The virtualization tests assert on the fallback height instead.
 */
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
