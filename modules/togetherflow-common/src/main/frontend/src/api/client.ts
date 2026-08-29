/**
 * HTTP client for the Flowable REST APIs.
 *
 * Auth is injected rather than baked in so the Basic-vs-OIDC decision
 * (REQUIREMENTS.md §11.3 / §13.1) can change without touching call sites.
 *
 * Resilience (§13.4) lives here rather than in each screen: every request carries a
 * timeout, and *safe* requests retry with backoff. Mutations deliberately do not — the
 * requirement is explicit that a rejected task completion must not be retried, and the
 * engine's action endpoints are not idempotent.
 */

import { commonEn } from "../i18n/messages";
import type { MessageParams, TFunction } from "../i18n/I18nContext";

export type AuthHeaderProvider = () => Record<string, string> | undefined;

/** Retries are bounded and jittered: a struggling engine must not be stampeded. */
export interface RetryPolicy {
  /** Total attempts including the first. 1 disables retrying. */
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { attempts: 3, baseDelayMs: 300, maxDelayMs: 4000 };

/**
 * Long enough for the engine's heavier history queries, short enough that a hung
 * connection surfaces as an error the user can act on rather than an endless spinner.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface ApiClientOptions {
  /** Base URL of the process REST API, e.g. "/process-api". */
  baseUrl: string;
  getAuthHeaders?: AuthHeaderProvider;
  /** Active tenant, applied as a filter by the resource wrappers (§8 multi-tenancy). */
  getTenantId?: () => string | undefined;
  /**
   * Active workspace, sent as `X-Workspace-Id` (ADR 0017).
   *
   * A header rather than a query parameter because it applies to writes as much as
   * reads: creating a model has to say which workspace it lands in, and a POST body is
   * the engine's shape, not ours to add a field to.
   */
  getWorkspaceId?: () => string | undefined;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
  /** Per-request deadline. Overridable per call. */
  timeoutMs?: number;
  retry?: Partial<RetryPolicy>;
  /**
   * Localises the error copy the UI ends up showing (§8 i18n). Defaults to the English
   * catalogue, so a client constructed without one behaves exactly as before.
   */
  translate?: TFunction;
}

/** English fallback, used when no translator is injected. */
const defaultTranslate: TFunction = (key: string, params?: MessageParams) => {
  const template = (commonEn as Record<string, string>)[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
};

export class ApiError extends Error {
  readonly status: number;
  readonly correlationId: string;
  readonly body: unknown;
  /** True when the request hit its own deadline rather than being answered. */
  readonly timedOut: boolean;
  /** How many attempts were made, so a report can distinguish flaky from dead. */
  readonly attempts: number;

  constructor(
    message: string,
    status: number,
    correlationId: string,
    body: unknown,
    options: { timedOut?: boolean; attempts?: number } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.correlationId = correlationId;
    this.body = body;
    this.timedOut = options.timedOut ?? false;
    this.attempts = options.attempts ?? 1;
  }

  /** Distinguishes the permission-denied empty state (§14.1) from a generic failure. */
  get isPermissionDenied(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Conflicts/optimistic-locking failures are worth retrying only after a refresh. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** No response at all — offline, DNS, TLS, or a deadline. */
  get isNetworkFailure(): boolean {
    return this.status === 0;
  }
}

function newCorrelationId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && "randomUUID" in cryptoObj) {
    return cryptoObj.randomUUID();
  }
  return `tf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface RequestOptions {
  method?: string;
  /** A FormData body is sent as-is so the browser can set the multipart boundary. */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /**
   * How to read a successful body. The default sniffs the payload and hands back a
   * parsed object when it happens to be JSON, which is right for the REST endpoints
   * but wrong for anything that stores opaque bytes: a model source that is itself
   * JSON would come back parsed and no longer be the text that was stored. Callers
   * fetching raw content pass "text" to keep it verbatim.
   */
  responseType?: "json" | "text";
  /**
   * Content type for the request body. Left unset, a body is serialised as JSON, which is
   * right for every REST resource that takes a JSON document. Set it to send the body
   * verbatim instead — the model-validation endpoints take BPMN/CMMN XML as the body, and
   * JSON-encoding that would send a quoted string the server cannot parse.
   */
  contentType?: string;
  timeoutMs?: number;
  /**
   * Forces retry on or off for this call. Left unset, only safe methods retry — see
   * `isRetryable`. Set it to true only for a mutation that is genuinely idempotent.
   */
  retry?: boolean;
}

/** Transient by nature: nothing about the request itself was wrong. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 502, 503, 504]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class ApiClient {
  private readonly options: ApiClientOptions;
  private readonly doFetch: typeof fetch;
  private readonly retry: RetryPolicy;
  private readonly t: TFunction;

  constructor(options: ApiClientOptions) {
    this.options = options;
    this.doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.retry = { ...DEFAULT_RETRY, ...options.retry };
    this.t = options.translate ?? defaultTranslate;
  }

  get tenantId(): string | undefined {
    return this.options.getTenantId?.();
  }

  buildUrl(path: string, query?: RequestOptions["query"]): string {
    const base = this.options.baseUrl.replace(/\/$/, "");
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        params.append(key, String(value));
      }
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    // One id for the whole logical request, retries included: an operator chasing a
    // reference the user quoted wants every attempt, not just the last one.
    const correlationId = newCorrelationId();
    const method = (options.method ?? "GET").toUpperCase();
    const retryable = options.retry ?? SAFE_METHODS.has(method);
    // A FormData body is a one-shot stream in some runtimes, so replaying it is unsafe.
    const attempts = retryable && !(options.body instanceof FormData) ? this.retry.attempts : 1;

    let lastError: ApiError | undefined;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.attempt<T>(path, options, method, correlationId, attempt);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        lastError = error;

        const canRetry = attempt < attempts && isRetryable(error);
        if (!canRetry) throw error;

        await sleep(this.backoffFor(attempt, error), options.signal);
      }
    }

    /* c8 ignore next */
    throw lastError;
  }

  /** Exponential with full jitter, honouring Retry-After when the server sent one. */
  private backoffFor(attempt: number, error: ApiError): number {
    const retryAfter = retryAfterMs(error.body);
    if (retryAfter !== undefined) return Math.min(retryAfter, this.retry.maxDelayMs);
    const ceiling = Math.min(this.retry.baseDelayMs * 2 ** (attempt - 1), this.retry.maxDelayMs);
    return Math.random() * ceiling;
  }

  private async attempt<T>(
    path: string,
    options: RequestOptions,
    method: string,
    correlationId: string,
    attempt: number,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      // Ties a browser-side failure to the same request in backend logs (§13.2).
      "X-Correlation-Id": correlationId,
      ...(this.options.getAuthHeaders?.() ?? {}),
    };
    const workspaceId = this.options.getWorkspaceId?.();
    if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
    if (attempt > 1) headers["X-Retry-Attempt"] = String(attempt);

    const isMultipart = options.body instanceof FormData;
    // A body with an explicit content type is sent verbatim rather than JSON-encoded.
    const isVerbatim = !isMultipart && options.contentType !== undefined;
    // Setting Content-Type by hand on a multipart request strips the boundary the
    // browser generates, and the server then fails to parse any part.
    if (options.body !== undefined && !isMultipart) {
      headers["Content-Type"] = options.contentType ?? "application/json";
    }

    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = withDeadline(options.signal, timeoutMs);

    let response: Response;
    try {
      response = await this.doFetch(this.buildUrl(path, options.query), {
        method,
        headers,
        credentials: "same-origin",
        body:
          options.body === undefined
            ? undefined
            : isMultipart
              ? (options.body as FormData)
              : isVerbatim
                ? (options.body as BodyInit)
                : JSON.stringify(options.body),
        signal: deadline.signal,
      });
    } catch (cause) {
      if (deadline.timedOut) {
        throw new ApiError(this.t("api.error.timeout"), 0, correlationId, cause, {
          timedOut: true,
          attempts: attempt,
        });
      }
      // The caller cancelled — a navigation or a superseded query, not a fault.
      if (cause instanceof DOMException && cause.name === "AbortError") {
        throw cause;
      }
      throw new ApiError(this.t("api.error.offline"), 0, correlationId, cause, {
        attempts: attempt,
      });
    } finally {
      deadline.dispose();
    }

    if (response.status === 401) {
      this.options.onUnauthorized?.();
    }

    if (!response.ok) {
      const body = await safeParse(response);
      throw new ApiError(
        this.messageForStatus(response.status, body),
        response.status,
        correlationId,
        withRetryAfter(body, response.headers.get("Retry-After")),
        { attempts: attempt },
      );
    }

    if (response.status === 204 || response.headers.get("Content-Length") === "0") {
      return undefined as T;
    }
    if (options.responseType === "text") {
      const text = await response.text();
      return (text === "" ? undefined : text) as T;
    }
    return (await safeParse(response)) as T;
  }

  private messageForStatus(status: number, body: unknown): string {
    const serverMessage =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : undefined;

    switch (status) {
      case 400:
        return serverMessage ?? this.t("api.error.400");
      case 401:
        return this.t("api.error.401");
      case 403:
        return this.t("api.error.403");
      case 404:
        return serverMessage ?? this.t("api.error.404");
      case 409:
        return serverMessage ?? this.t("api.error.409");
      default:
        return serverMessage ?? this.t("api.error.unexpected", { status });
    }
  }
}

export function isRetryable(error: ApiError): boolean {
  if (error.timedOut) return true;
  if (error.isNetworkFailure) return true;
  return RETRYABLE_STATUSES.has(error.status);
}

/**
 * Combines the caller's signal with a deadline, reporting which of the two fired —
 * `AbortSignal.any`/`AbortSignal.timeout` would lose that distinction, and a cancelled
 * request must not be reported to the user as a timeout.
 */
function withDeadline(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; timedOut: boolean; dispose: () => void } {
  const controller = new AbortController();
  const state = { signal: controller.signal, timedOut: false, dispose: () => {} };

  if (callerSignal?.aborted) {
    controller.abort(callerSignal.reason);
    return state;
  }

  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener("abort", onCallerAbort);

  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort();
  }, timeoutMs);

  state.dispose = () => {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  };
  return state;
}

/** Abortable delay, so a retry wait doesn't outlive the screen that started it. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Carries Retry-After onto the error so the backoff can honour it. */
function withRetryAfter(body: unknown, header: string | null): unknown {
  if (!header) return body;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  if (!Number.isFinite(ms) || ms < 0) return body;
  return typeof body === "object" && body !== null
    ? { ...(body as object), retryAfterMs: ms }
    : { retryAfterMs: ms };
}

function retryAfterMs(body: unknown): number | undefined {
  if (typeof body === "object" && body !== null && "retryAfterMs" in body) {
    const value = (body as { retryAfterMs: unknown }).retryAfterMs;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

async function safeParse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
