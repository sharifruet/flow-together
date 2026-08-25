import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "./client";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("ApiClient.buildUrl", () => {
  const client = new ApiClient({ baseUrl: "/process-api/" });

  it("joins the base and path without duplicating slashes", () => {
    expect(client.buildUrl("/runtime/tasks")).toBe("/process-api/runtime/tasks");
    expect(client.buildUrl("runtime/tasks")).toBe("/process-api/runtime/tasks");
  });

  it("omits undefined and empty query params so they are not sent as literal 'undefined'", () => {
    const url = client.buildUrl("/repository/process-definitions", {
      latest: true,
      size: 10,
      nameLike: undefined,
      tenantId: "",
    });
    expect(url).toBe("/process-api/repository/process-definitions?latest=true&size=10");
  });
});

describe("ApiClient.request", () => {
  it("sends auth headers and a correlation id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = new ApiClient({
      baseUrl: "/process-api",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAuthHeaders: () => ({ Authorization: "Basic abc" }),
    });

    await client.request("/runtime/tasks");

    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBe("Basic abc");
    expect(init.headers["X-Correlation-Id"]).toBeTruthy();
  });

  it("only sets Content-Type when there is a body", async () => {
    // A Response body can only be read once, so each call needs a fresh instance.
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse({}));
    const client = new ApiClient({
      baseUrl: "/process-api",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.request("/runtime/tasks");
    expect(fetchImpl.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();

    await client.request("/query/tasks", { method: "POST", body: { size: 1 } });
    expect(fetchImpl.mock.calls[1][1].headers["Content-Type"]).toBe("application/json");
  });

  it("sends FormData untouched and lets the browser set the multipart boundary", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse({ id: "a1" }));
    const client = new ApiClient({
      baseUrl: "/process-api",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const form = new FormData();
    form.append("name", "notes.txt");
    await client.request("/runtime/tasks/1/attachments", { method: "POST", body: form });

    const [, init] = fetchImpl.mock.calls[0];
    // Setting this header by hand would strip the boundary and break parsing server-side.
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBe(form);
  });

  it("maps 403 to a permission-denied error the UI can branch on", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 403 }));
    const client = new ApiClient({
      baseUrl: "/process-api",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const error = await client.request("/runtime/tasks").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isPermissionDenied).toBe(true);
    expect((error as ApiError).message).toBe("You do not have permission to do that.");
  });

  it("prefers the server's message when it supplies one", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: "Task already completed" }, { status: 409 }));
    const client = new ApiClient({
      baseUrl: "/process-api",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const error = (await client.request("/runtime/tasks/1").catch((cause: unknown) => cause)) as ApiError;
    expect(error.isConflict).toBe(true);
    expect(error.message).toBe("Task already completed");
  });

  it("notifies the host on 401 so the session can be cleared", async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 401 }));
    const client = new ApiClient({
      baseUrl: "/process-api",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onUnauthorized,
    });

    await client.request("/runtime/tasks").catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("reports a network failure as a reachability problem, not a server error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const client = new ApiClient({
      baseUrl: "/process-api",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const error = (await client.request("/runtime/tasks").catch((cause: unknown) => cause)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/could not reach the server/i);
  });

  it("propagates aborts instead of converting them to errors", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchImpl = vi.fn().mockRejectedValue(abortError);
    const client = new ApiClient({
      baseUrl: "/process-api",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.request("/runtime/tasks")).rejects.toBe(abortError);
  });

  it("returns undefined for 204 rather than failing to parse an empty body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new ApiClient({
      baseUrl: "/process-api",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.request("/runtime/tasks/1")).resolves.toBeUndefined();
  });
});
