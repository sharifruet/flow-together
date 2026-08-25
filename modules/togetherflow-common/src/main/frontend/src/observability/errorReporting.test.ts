/**
 * Frontend error tracking (REQUIREMENTS.md §13.2). The bar the requirement sets is
 * "enough context to debug without asking the user to reproduce it", so the tests are
 * about what a report carries and what it deliberately drops — plus the rule that
 * reporting must never itself break the page.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import {
  buildReport,
  configureErrorReporting,
  installGlobalErrorHandlers,
  reportError,
} from "./errorReporting";

beforeEach(() => {
  configureErrorReporting({ app: "togetherflow-work", release: "test" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("buildReport", () => {
  it("carries the context an operator needs to find the same failure server-side", () => {
    configureErrorReporting({
      app: "togetherflow-work",
      release: "1.2.3",
      getUserId: () => "kermit",
      getTenantId: () => "acme",
    });
    const report = buildReport(new ApiError("boom", 500, "corr-1", {}), "manual", {
      action: "complete-task",
    });
    expect(report).toMatchObject({
      app: "togetherflow-work",
      release: "1.2.3",
      status: 500,
      correlationId: "corr-1",
      action: "complete-task",
      userId: "kermit",
      tenantId: "acme",
    });
  });

  it("survives a user/tenant getter that throws rather than failing the report", () => {
    configureErrorReporting({
      app: "togetherflow-work",
      getUserId: () => {
        throw new Error("no session");
      },
    });
    expect(() => buildReport(new Error("boom"), "render")).not.toThrow();
  });

  it("describes a non-Error throw rather than dropping it", () => {
    const report = buildReport("just a string", "window-error");
    expect(report.message).toBe("just a string");
  });
});

describe("reportError", () => {
  it("posts to the configured collector", () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    configureErrorReporting({ app: "w", endpoint: "/collect" });

    reportError(new Error("boom"));

    expect(beacon).toHaveBeenCalledWith("/collect", expect.any(Blob));
    vi.unstubAllGlobals();
  });

  it("drops 401/403/404, which say the system is working, not failing", () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    configureErrorReporting({ app: "w", endpoint: "/collect" });

    reportError(new ApiError("denied", 403, "c", {}));
    reportError(new ApiError("gone", 404, "c", {}));

    expect(beacon).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("collapses a repeat of the same fault, so a render loop is not a request flood", () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    configureErrorReporting({ app: "w", endpoint: "/collect" });

    reportError(new Error("same"));
    reportError(new Error("same"));

    expect(beacon).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("stops after the session cap", () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    configureErrorReporting({ app: "w", endpoint: "/collect", maxReportsPerSession: 2 });

    for (let i = 0; i < 5; i++) reportError(new Error(`distinct ${i}`));

    expect(beacon).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("never throws, even when the transport does", () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      sendBeacon: () => {
        throw new Error("transport down");
      },
    });
    configureErrorReporting({ app: "w", endpoint: "/collect" });
    expect(() => reportError(new Error("boom"))).not.toThrow();
    vi.unstubAllGlobals();
  });

  it("logs to the console when no collector is configured", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    configureErrorReporting({ app: "w" });
    reportError(new Error("boom"));
    expect(logged).toHaveBeenCalled();
  });
});

describe("installGlobalErrorHandlers", () => {
  it("captures an unhandled rejection and can be uninstalled", () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    configureErrorReporting({ app: "w", endpoint: "/collect" });

    const uninstall = installGlobalErrorHandlers();
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), { reason: new Error("unhandled") }),
    );
    expect(beacon).toHaveBeenCalledTimes(1);

    uninstall();
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), { reason: new Error("after uninstall") }),
    );
    expect(beacon).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
