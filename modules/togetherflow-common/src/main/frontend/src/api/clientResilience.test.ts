/**
 * Network resilience (REQUIREMENTS.md §13.4): "retry-with-backoff on transient API
 * failures (not on failed business operations — don't retry a rejected task-completion),
 * request timeouts surfaced to the user rather than an indefinite spinner."
 *
 * The requirement names both halves, so both are pinned here — in particular that a
 * mutation is never replayed, which is the half that would cause real damage.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError, isRetryable } from "./client";

function ok(body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function status(code: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ message: "nope" }), { status: code, headers });
}

function client(fetchImpl: typeof fetch, options: Record<string, unknown> = {}) {
  return new ApiClient({
    baseUrl: "/process-api",
    fetchImpl,
    // No jitter delay worth waiting for in a test.
    retry: { attempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
    ...options,
  });
}

afterEach(() => vi.useRealTimers());

describe("retrying transient failures", () => {
  it("retries a GET that fails with 503 and returns the eventual success", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(ok({ value: 1 }));
    const result = await client(fetchImpl as unknown as typeof fetch).request<{ value: number }>(
      "/runtime/tasks",
    );
    expect(result).toEqual({ value: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a network failure, where no response arrived at all", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(ok());
    await client(fetchImpl as unknown as typeof fetch).request("/runtime/tasks");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured number of attempts and reports the last failure", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => status(503));
    await expect(
      client(fetchImpl as unknown as typeof fetch).request("/runtime/tasks"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a mutation — a rejected completion must not be replayed", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => status(503));
    await expect(
      client(fetchImpl as unknown as typeof fetch).request("/runtime/tasks/1", {
        method: "POST",
        body: { action: "complete" },
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 4xx, which says the request itself was wrong", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => status(400));
    await expect(
      client(fetchImpl as unknown as typeof fetch).request("/runtime/tasks"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never replays a multipart upload, whose body is a one-shot stream", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => status(503));
    const body = new FormData();
    body.append("file", new Blob(["x"]), "x.txt");
    await expect(
      client(fetchImpl as unknown as typeof fetch).request("/upload", {
        method: "GET",
        body,
        retry: true,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps one correlation id across attempts, so every try is findable", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => status(503));
    await expect(
      client(fetchImpl as unknown as typeof fetch).request("/runtime/tasks"),
    ).rejects.toThrow();
    const ids = fetchImpl.mock.calls.map(
      (call) => (call[1] as RequestInit).headers as Record<string, string>,
    );
    expect(ids[0]["X-Correlation-Id"]).toBe(ids[1]["X-Correlation-Id"]);
    expect(ids[1]["X-Retry-Attempt"]).toBe("2");
  });

  it("classifies which failures are worth retrying", () => {
    expect(isRetryable(new ApiError("x", 503, "c", {}))).toBe(true);
    expect(isRetryable(new ApiError("x", 429, "c", {}))).toBe(true);
    expect(isRetryable(new ApiError("x", 0, "c", {}))).toBe(true);
    expect(isRetryable(new ApiError("x", 409, "c", {}))).toBe(false);
    expect(isRetryable(new ApiError("x", 500, "c", {}))).toBe(false);
  });
});

describe("timeouts", () => {
  it("fails a hung request rather than spinning indefinitely", async () => {
    // Never resolves, and never rejects — precisely the case a bare fetch cannot escape.
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const call = client(fetchImpl as unknown as typeof fetch, { retry: { attempts: 1 } }).request(
      "/runtime/tasks",
      { timeoutMs: 10 },
    );
    await expect(call).rejects.toMatchObject({ timedOut: true, status: 0 });
  });

  it("reports a caller-cancelled request as an abort, not as a timeout", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const call = client(fetchImpl as unknown as typeof fetch).request("/runtime/tasks", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(call).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("Retry-After", () => {
  it("honours the server's own backoff hint", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(status(429, { "Retry-After": "0" }))
      .mockResolvedValueOnce(ok());
    await client(fetchImpl as unknown as typeof fetch).request("/runtime/tasks");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("translated error copy", () => {
  it("uses the injected translator rather than hard-coded English", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => status(403));
    const translate = vi.fn(() => "Zugriff verweigert");
    await expect(
      client(fetchImpl as unknown as typeof fetch, { translate }).request("/runtime/tasks"),
    ).rejects.toThrow("Zugriff verweigert");
  });

  it("falls back to English when no translator is injected", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => status(403));
    await expect(
      client(fetchImpl as unknown as typeof fetch).request("/runtime/tasks"),
    ).rejects.toThrow("You do not have permission to do that.");
  });
});
