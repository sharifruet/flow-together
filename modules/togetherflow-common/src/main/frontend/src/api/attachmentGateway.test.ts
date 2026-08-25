/**
 * How `TaskApi.uploadAttachment` routes a file (REQUIREMENTS.md §7.6).
 *
 * The whole point of the seam is that switching provider is configuration, not code —
 * so these pin that the *only* thing deciding the path is whether a gateway URL was
 * given, and that both paths end in the same kind of attachment.
 */

import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { TaskApi } from "./resources";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(gatewayBaseUrl?: string) {
  const engineFetch = vi.fn().mockImplementation(async () => jsonResponse({ id: "att-1" }));
  const api = new TaskApi(
    new ApiClient({ baseUrl: "/process-api", fetchImpl: engineFetch as unknown as typeof fetch }),
    gatewayBaseUrl,
  );
  return { api, engineFetch };
}

const file = () => new File(["hello"], "notes.txt", { type: "text/plain" });

describe("uploadAttachment without a gateway (the default `db` provider)", () => {
  it("posts the bytes straight to Flowable", async () => {
    const { api, engineFetch } = setup();
    await api.uploadAttachment("task-1", file());

    const [url, init] = engineFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/runtime/tasks/task-1/attachments");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("file")).toBeInstanceOf(File);
    expect(body.get("name")).toBe("notes.txt");
    expect(body.get("type")).toBe("text/plain");
  });

  it("uses the caller's name and type when given", async () => {
    const { api, engineFetch } = setup();
    await api.uploadAttachment("task-1", file(), { name: "Contract", type: "application/pdf" });

    const body = (engineFetch.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect(body.get("name")).toBe("Contract");
    expect(body.get("type")).toBe("application/pdf");
  });
});

describe("uploadAttachment with a gateway configured", () => {
  it("sends the bytes to the gateway, then registers the URL with Flowable", async () => {
    const gatewayFetch = vi.fn().mockImplementation(async () =>
      jsonResponse({ url: "https://files.example/attachments/abc", fileName: "notes.txt" }),
    );
    vi.stubGlobal("fetch", gatewayFetch);

    const { api, engineFetch } = setup("https://gw.example/");
    await api.uploadAttachment("task-1", file(), { description: "signed" });

    // 1. the file went to the gateway, with the task it belongs to
    const [gwUrl, gwInit] = gatewayFetch.mock.calls[0] as [string, RequestInit];
    // The configured base's trailing slash must not double up.
    expect(gwUrl).toBe("https://gw.example/attachments");
    const gwBody = gwInit.body as FormData;
    expect(gwBody.get("taskId")).toBe("task-1");
    expect(gwBody.get("file")).toBeInstanceOf(File);

    // 2. only the URL reached Flowable — no bytes
    const [engineUrl, engineInit] = engineFetch.mock.calls[0] as [string, RequestInit];
    expect(engineUrl).toContain("/runtime/tasks/task-1/attachments");
    expect(JSON.parse(engineInit.body as string)).toEqual({
      name: "notes.txt",
      description: "signed",
      type: "text/plain",
      externalUrl: "https://files.example/attachments/abc",
    });

    vi.unstubAllGlobals();
  });

  /**
   * The engine's credentials belong to the engine. Forwarding them to a separate
   * service would widen their blast radius for no reason.
   */
  it("does not send the engine's auth headers to the gateway", async () => {
    const gatewayFetch = vi.fn().mockImplementation(async () =>
      jsonResponse({ url: "https://files.example/a", fileName: "n" }),
    );
    vi.stubGlobal("fetch", gatewayFetch);

    const engineFetch = vi.fn().mockImplementation(async () => jsonResponse({ id: "att-1" }));
    const api = new TaskApi(
      new ApiClient({
        baseUrl: "/process-api",
        fetchImpl: engineFetch as unknown as typeof fetch,
        getAuthHeaders: () => ({ Authorization: "Basic c2VjcmV0" }),
      }),
      "https://gw.example",
    );
    await api.uploadAttachment("t", file());

    const init = (gatewayFetch.mock.calls[0] as [string, RequestInit])[1];
    expect(init.headers).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("says what to do instead when the gateway is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response("", { status: 502 })),
    );

    const { api, engineFetch } = setup("https://gw.example");
    await expect(api.uploadAttachment("t", file())).rejects.toThrow(
      /Attachment storage is unavailable.*attach a link instead/i,
    );
    // Nothing was registered against the task, so no attachment points at a missing file.
    expect(engineFetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("reports an oversized file distinctly, since retrying will not help", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response("", { status: 413 })),
    );

    const { api } = setup("https://gw.example");
    await expect(api.uploadAttachment("t", file())).rejects.toThrow(/larger than this deployment/i);

    vi.unstubAllGlobals();
  });
});
