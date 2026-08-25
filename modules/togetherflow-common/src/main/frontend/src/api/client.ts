/**
 * HTTP client for the Flowable REST APIs.
 *
 * Auth is injected rather than baked in so the Basic-vs-OIDC decision
 * (REQUIREMENTS.md §11.3 / §13.1) can change without touching call sites.
 */

export type AuthHeaderProvider = () => Record<string, string> | undefined;

export interface ApiClientOptions {
  /** Base URL of the process REST API, e.g. "/process-api". */
  baseUrl: string;
  getAuthHeaders?: AuthHeaderProvider;
  /** Active tenant, applied as a filter by the resource wrappers (§8 multi-tenancy). */
  getTenantId?: () => string | undefined;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  readonly status: number;
  readonly correlationId: string;
  readonly body: unknown;

  constructor(message: string, status: number, correlationId: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.correlationId = correlationId;
    this.body = body;
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
}

export class ApiClient {
  private readonly options: ApiClientOptions;
  private readonly doFetch: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.options = options;
    this.doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
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
    const correlationId = newCorrelationId();
    const headers: Record<string, string> = {
      Accept: "application/json",
      // Ties a browser-side failure to the same request in backend logs (§13.2).
      "X-Correlation-Id": correlationId,
      ...(this.options.getAuthHeaders?.() ?? {}),
    };
    const isMultipart = options.body instanceof FormData;
    // Setting Content-Type by hand on a multipart request strips the boundary the
    // browser generates, and the server then fails to parse any part.
    if (options.body !== undefined && !isMultipart) {
      headers["Content-Type"] = "application/json";
    }

    let response: Response;
    try {
      response = await this.doFetch(this.buildUrl(path, options.query), {
        method: options.method ?? "GET",
        headers,
        credentials: "same-origin",
        body:
          options.body === undefined
            ? undefined
            : isMultipart
              ? (options.body as FormData)
              : JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        throw cause;
      }
      throw new ApiError(
        "Could not reach the server. Check your connection and try again.",
        0,
        correlationId,
        cause,
      );
    }

    if (response.status === 401) {
      this.options.onUnauthorized?.();
    }

    if (!response.ok) {
      const body = await safeParse(response);
      throw new ApiError(messageForStatus(response.status, body), response.status, correlationId, body);
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

function messageForStatus(status: number, body: unknown): string {
  const serverMessage =
    typeof body === "object" && body !== null && "message" in body
      ? String((body as { message: unknown }).message)
      : undefined;

  switch (status) {
    case 400:
      return serverMessage ?? "The server rejected that request as invalid.";
    case 401:
      return "Your session has expired. Sign in again to continue.";
    case 403:
      return "You do not have permission to do that.";
    case 404:
      return serverMessage ?? "That item no longer exists. It may have been completed or deleted.";
    case 409:
      return serverMessage ?? "Someone else changed this item first. Refresh and try again.";
    default:
      return serverMessage ?? `The server returned an unexpected error (${status}).`;
  }
}
