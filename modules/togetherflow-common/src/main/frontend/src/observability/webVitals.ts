/**
 * Core Web Vitals (REQUIREMENTS.md §13.5: "Core Web Vitals tracked for Work in
 * particular, since it's the daily-use, non-technical-user-facing app").
 *
 * Measured with `PerformanceObserver` directly rather than by adding the `web-vitals`
 * package. The three field metrics that matter here — LCP, CLS and INP — are each a
 * short read over an entry type the browser already exposes, and the same reasoning as
 * [ADR 0013](../../../../../../docs/ui/adr/0013-in-house-i18n.md) applies: a dependency
 * whose value is mostly in attribution and edge-case normalisation, in a bundle with an
 * enforced budget, for numbers a deployment mostly wants as a trend.
 *
 * Reported through the same sink as errors, so a deployment configures one endpoint and
 * gets both. With no endpoint configured this is inert beyond a console line in
 * development — a fresh install needs no analytics infrastructure to work.
 *
 * Honest about what this is: field data from real sessions, not a lab measurement. It
 * tells you what users experienced, not why. Diagnosing a regression still means a
 * Lighthouse or DevTools trace.
 */

export type VitalName = "LCP" | "CLS" | "INP" | "TTFB";

export interface Vital {
  name: VitalName;
  /** Milliseconds, except CLS, which is unitless. */
  value: number;
  /** Google's own thresholds, so a number can be read without a lookup table. */
  rating: "good" | "needs-improvement" | "poor";
}

/** https://web.dev/articles/defining-core-web-vitals-thresholds */
const THRESHOLDS: Record<VitalName, [good: number, poor: number]> = {
  LCP: [2500, 4000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  TTFB: [800, 1800],
};

export function rate(name: VitalName, value: number): Vital["rating"] {
  const [good, poor] = THRESHOLDS[name];
  if (value <= good) return "good";
  return value <= poor ? "needs-improvement" : "poor";
}

function supports(type: string): boolean {
  try {
    return PerformanceObserver.supportedEntryTypes?.includes(type) ?? false;
  } catch {
    return false;
  }
}

/**
 * Starts collecting. `report` is called once per metric when the page is backgrounded or
 * unloaded — which is the only point at which LCP, CLS and INP are final. Returns a
 * function that stops observing.
 */
export function observeWebVitals(report: (vital: Vital) => void): () => void {
  if (typeof PerformanceObserver === "undefined") return () => {};

  const observers: PerformanceObserver[] = [];
  let largestContentfulPaint = 0;
  let cumulativeLayoutShift = 0;
  let worstInteraction = 0;
  let reported = false;

  const observe = (type: string, handle: (entries: PerformanceEntryList) => void) => {
    if (!supports(type)) return;
    try {
      const observer = new PerformanceObserver((list) => handle(list.getEntries()));
      // `buffered` catches entries emitted before this ran — LCP in particular usually
      // happens before any JavaScript of ours executes.
      observer.observe({ type, buffered: true });
      observers.push(observer);
    } catch {
      // A browser that rejects the type simply contributes no metric.
    }
  };

  observe("largest-contentful-paint", (entries) => {
    for (const entry of entries) largestContentfulPaint = entry.startTime;
  });

  observe("layout-shift", (entries) => {
    for (const entry of entries) {
      const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
      // A shift the user caused by interacting is not a fault.
      if (!shift.hadRecentInput) cumulativeLayoutShift += shift.value;
    }
  });

  observe("event", (entries) => {
    for (const entry of entries) {
      const event = entry as PerformanceEntry & { interactionId?: number };
      // Only entries with an interactionId are real interactions; the rest are noise.
      if (event.interactionId) worstInteraction = Math.max(worstInteraction, entry.duration);
    }
  });

  const flush = () => {
    // Once only: `visibilitychange` and `pagehide` both fire on most navigations.
    if (reported) return;
    reported = true;

    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;

    const measured: { name: VitalName; value: number }[] = [
      { name: "LCP", value: Math.round(largestContentfulPaint) },
      // Three decimals: CLS is unitless and small, and rounding it to an integer would
      // report every page as a flat zero.
      { name: "CLS", value: Math.round(cumulativeLayoutShift * 1000) / 1000 },
      { name: "INP", value: Math.round(worstInteraction) },
      ...(navigation ? [{ name: "TTFB" as const, value: Math.round(navigation.responseStart) }] : []),
    ];

    const vitals: Vital[] = measured.map((vital) => ({
      ...vital,
      rating: rate(vital.name, vital.value),
    }));

    for (const vital of vitals) {
      // A page nobody interacted with has no INP; reporting 0 would look like a perfect
      // score rather than an absent measurement.
      if (vital.name === "INP" && worstInteraction === 0) continue;
      report(vital);
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") flush();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  // Safari does not reliably fire visibilitychange on unload.
  window.addEventListener("pagehide", flush);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", flush);
    for (const observer of observers) observer.disconnect();
  };
}
