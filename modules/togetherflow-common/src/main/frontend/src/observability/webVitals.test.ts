/**
 * Core Web Vitals (REQUIREMENTS.md §13.5).
 *
 * `PerformanceObserver` cannot be exercised meaningfully in jsdom — there is no layout,
 * so there are no paints or shifts to observe. What is tested is the part that carries
 * the judgement: how a raw number becomes a rating, and that starting collection in an
 * environment without the API is inert rather than a crash.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { observeWebVitals, rate } from "./webVitals";

afterEach(() => vi.unstubAllGlobals());

describe("rate", () => {
  it("applies Google's own thresholds, so a number reads without a lookup table", () => {
    expect(rate("LCP", 2000)).toBe("good");
    expect(rate("LCP", 2500)).toBe("good");
    expect(rate("LCP", 3000)).toBe("needs-improvement");
    expect(rate("LCP", 5000)).toBe("poor");

    expect(rate("CLS", 0.05)).toBe("good");
    expect(rate("CLS", 0.2)).toBe("needs-improvement");
    expect(rate("CLS", 0.5)).toBe("poor");

    expect(rate("INP", 150)).toBe("good");
    expect(rate("INP", 300)).toBe("needs-improvement");
    expect(rate("INP", 900)).toBe("poor");

    expect(rate("TTFB", 500)).toBe("good");
    expect(rate("TTFB", 1000)).toBe("needs-improvement");
    expect(rate("TTFB", 3000)).toBe("poor");
  });

  it("treats a threshold boundary as the better rating, matching the published definition", () => {
    expect(rate("CLS", 0.1)).toBe("good");
    expect(rate("CLS", 0.25)).toBe("needs-improvement");
  });
});

describe("observeWebVitals", () => {
  it("is inert where PerformanceObserver does not exist, rather than throwing", () => {
    vi.stubGlobal("PerformanceObserver", undefined);
    const report = vi.fn();
    const stop = observeWebVitals(report);
    expect(report).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });

  it("survives a browser that rejects an entry type it claims not to support", () => {
    class Rejecting {
      static supportedEntryTypes = ["largest-contentful-paint"];
      observe() {
        throw new Error("unsupported");
      }
      disconnect() {}
    }
    vi.stubGlobal("PerformanceObserver", Rejecting);
    expect(() => observeWebVitals(vi.fn())()).not.toThrow();
  });

  it("stops observing when the returned function is called", () => {
    const disconnect = vi.fn();
    class Fake {
      static supportedEntryTypes = ["largest-contentful-paint", "layout-shift", "event"];
      observe() {}
      disconnect = disconnect;
    }
    vi.stubGlobal("PerformanceObserver", Fake);

    observeWebVitals(vi.fn())();

    expect(disconnect).toHaveBeenCalledTimes(3);
  });
});
