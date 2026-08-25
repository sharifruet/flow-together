/**
 * Frontend error tracking (REQUIREMENTS.md §13.2): unhandled exceptions and API failures
 * captured "with enough context (route, user role, request id) to debug without asking
 * the user to reproduce it — not just a browser console log."
 *
 * Deliberately transport-agnostic. A deployment points `TF_ERROR_ENDPOINT` at whatever it
 * already runs (a Sentry tunnel, an OTLP collector, a log-shipping endpoint of its own);
 * with nothing configured the reports still go to the console, so development loses
 * nothing and a fresh install needs no error-tracking infrastructure to work.
 */

import { ApiError } from "../api/client";

export interface ErrorContext {
  /** Which screen the user was on. */
  route?: string;
  /** What they were doing, where the caller knows — "complete-task", "deploy-model". */
  action?: string;
  /** Ties the report to the same request in backend logs. */
  correlationId?: string;
  [key: string]: unknown;
}

export interface ErrorReportingOptions {
  /** Where reports are POSTed. Unset means console-only. */
  endpoint?: string;
  /** Which app this is — reports from four SPAs land in one place. */
  app: string;
  /** Build identifier, so a report can be tied to the bundle that produced it. */
  release?: string;
  /** Read lazily: the user may not be signed in when the handlers are installed. */
  getUserId?: () => string | undefined;
  getTenantId?: () => string | undefined;
  /** Backstop against a render loop turning into a request flood. */
  maxReportsPerSession?: number;
}

/** A performance sample rather than a fault, but the same destination (§13.5). */
export interface VitalReport {
  app: string;
  release?: string;
  kind: "web-vital";
  metric: string;
  value: number;
  rating: string;
  route?: string;
  userId?: string;
  tenantId?: string;
  timestamp: string;
}

export interface ErrorReport {
  app: string;
  release?: string;
  message: string;
  name: string;
  stack?: string;
  kind: "render" | "unhandled-rejection" | "window-error" | "manual";
  status?: number;
  correlationId?: string;
  route?: string;
  action?: string;
  userId?: string;
  tenantId?: string;
  userAgent: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

const DEFAULT_MAX_REPORTS = 25;

let options: ErrorReportingOptions = { app: "togetherflow" };
let sent = 0;
const seen = new Map<string, number>();
/** Two reports of the same fault inside this window are one fault, not two. */
const DEDUPE_WINDOW_MS = 10_000;

export function configureErrorReporting(next: ErrorReportingOptions): void {
  options = next;
  sent = 0;
  seen.clear();
}

/** Test seam: what the last report would have looked like, without a network. */
export function buildReport(
  error: unknown,
  kind: ErrorReport["kind"],
  context?: ErrorContext,
): ErrorReport {
  const apiError = error instanceof ApiError ? error : undefined;
  const asError = error instanceof Error ? error : undefined;
  const { route, action, correlationId, ...rest } = context ?? {};

  return {
    app: options.app,
    release: options.release,
    kind,
    name: asError?.name ?? typeof error,
    message: asError?.message ?? String(error),
    stack: asError?.stack,
    status: apiError?.status,
    correlationId: correlationId ?? apiError?.correlationId,
    route: route ?? currentRoute(),
    action,
    userId: safeCall(options.getUserId),
    tenantId: safeCall(options.getTenantId),
    userAgent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
    timestamp: new Date().toISOString(),
    context: Object.keys(rest).length > 0 ? rest : undefined,
  };
}

/**
 * Reports an error. Never throws and never rejects — a failure inside error reporting
 * that surfaces to the caller turns one fault into two.
 */
export function reportError(error: unknown, context?: ErrorContext): void {
  // 401/403 are the auth layer working, and 404 is usually a stale link. None of the
  // three tells an operator anything, and all three are high-volume — so they are
  // dropped here rather than in reportInternal, which exists for genuine crashes.
  if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return;
  reportInternal(error, "manual", context);
}

function shouldSend(report: ErrorReport): boolean {
  const max = options.maxReportsPerSession ?? DEFAULT_MAX_REPORTS;
  if (sent >= max) return false;

  const signature = `${report.kind}|${report.name}|${report.message}|${report.route ?? ""}`;
  const now = Date.now();
  const last = seen.get(signature);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
  seen.set(signature, now);
  sent += 1;
  return true;
}

function deliver(report: ErrorReport): void {
  // Always visible locally, whether or not a collector is configured.
  console.error(`[togetherflow] ${report.kind}: ${report.message}`, report);

  const endpoint = options.endpoint;
  if (!endpoint) return;

  const body = JSON.stringify(report);
  // sendBeacon survives the page being closed, which is exactly when a crash report
  // is most likely to be lost.
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const ok = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    if (ok) return;
  }
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Nothing useful to do: the collector is down and we are already in a failure path.
  });
}

/**
 * Captures what React's error boundary cannot see: errors thrown outside the render
 * tree, and promise rejections nobody handled. Returns an uninstall function.
 */
/**
 * Reports a Core Web Vital. Deliberately outside the error path's cap and dedupe: these
 * are a handful of samples once per page, not a fault that can loop, and counting them
 * against the error budget would let a slow page suppress its own crash reports.
 */
export function reportVital(vital: { name: string; value: number; rating: string }): void {
  try {
    const report: VitalReport = {
      app: options.app,
      release: options.release,
      kind: "web-vital",
      metric: vital.name,
      value: vital.value,
      rating: vital.rating,
      route: currentRoute(),
      userId: safeCall(options.getUserId),
      tenantId: safeCall(options.getTenantId),
      timestamp: new Date().toISOString(),
    };

    if (!options.endpoint) {
      // Visible in development without needing a collector. `warn` rather than `info`
      // only because the lint config allows warn and error — a slow page is not an error.
      if (!isProduction()) {
        console.warn(`[togetherflow] ${vital.name}=${vital.value} (${vital.rating})`);
      }
      return;
    }

    const body = JSON.stringify(report);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      // Vitals are flushed as the page is being hidden, which is exactly when a normal
      // request gets cancelled — sendBeacon is the only transport that survives it.
      if (navigator.sendBeacon(options.endpoint, new Blob([body], { type: "application/json" }))) {
        return;
      }
    }
    void fetch(options.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Measurement must never be the thing that breaks the page.
  }
}

/** Vite substitutes this at build time; anywhere else it is simply absent. */
function isProduction(): boolean {
  return (
    (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ===
    "production"
  );
}

export function installGlobalErrorHandlers(): () => void {
  const onError = (event: ErrorEvent) => {
    reportInternal(event.error ?? event.message, "window-error", {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportInternal(event.reason, "unhandled-rejection");
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

/** Shared by the global handlers and the error boundary, which both know their own kind. */
export function reportInternal(
  error: unknown,
  kind: ErrorReport["kind"],
  context?: ErrorContext,
): void {
  try {
    if (error instanceof DOMException && error.name === "AbortError") return;
    const report = buildReport(error, kind, context);
    if (!shouldSend(report)) return;
    deliver(report);
  } catch {
    // As above.
  }
}

function currentRoute(): string | undefined {
  if (typeof window === "undefined") return undefined;
  // The apps route on the hash, so the path alone would report every screen as "/".
  return `${window.location.pathname}${window.location.hash}`;
}

function safeCall(fn: (() => string | undefined) | undefined): string | undefined {
  try {
    return fn?.();
  } catch {
    return undefined;
  }
}
