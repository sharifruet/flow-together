/**
 * The inbound event log client (REQUIREMENTS.md §7.2, ADR 0015).
 *
 * These assert the request the recorder actually receives, because this endpoint has no
 * OpenAPI document behind it — the contract-drift check in §8 covers the engine's own
 * specs, and cannot cover a TogetherFlow module that publishes none.
 */

import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { EventRecorderApi } from "./eventRecorder";

function clientFor(response: unknown, tenantId?: string) {
  const fetchImpl = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  const client = new ApiClient({
    baseUrl: "/recorder",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    getTenantId: () => tenantId,
  });
  return { client, fetchImpl };
}

function urlOf(fetchImpl: ReturnType<typeof vi.fn>): URL {
  return new URL(String(fetchImpl.mock.calls[0][0]), "http://localhost");
}

const EMPTY = { data: [], total: 0, start: 0, size: 25 };

describe("EventRecorderApi", () => {
  it("asks for the first page newest-first by default", async () => {
    const { client, fetchImpl } = clientFor(EMPTY);

    await new EventRecorderApi(client).list();

    const url = urlOf(fetchImpl);
    expect(url.pathname).toBe("/recorder/event-recorder/events");
    expect(url.searchParams.get("size")).toBe("25");
  });

  it("passes every filter through", async () => {
    const { client, fetchImpl } = clientFor(EMPTY);

    await new EventRecorderApi(client).list({
      channelKey: "orders",
      status: "UNRESOLVED",
      receivedAfter: "2026-08-25T10:00:00Z",
      start: 50,
      size: 10,
    });

    const url = urlOf(fetchImpl);
    expect(url.searchParams.get("channelKey")).toBe("orders");
    expect(url.searchParams.get("status")).toBe("UNRESOLVED");
    expect(url.searchParams.get("receivedAfter")).toBe("2026-08-25T10:00:00Z");
    expect(url.searchParams.get("start")).toBe("50");
    expect(url.searchParams.get("size")).toBe("10");
  });

  it("scopes to the active tenant like every other list (§8)", async () => {
    const { client, fetchImpl } = clientFor(EMPTY, "acme");

    await new EventRecorderApi(client).list();

    expect(urlOf(fetchImpl).searchParams.get("tenantId")).toBe("acme");
  });

  it("lets an explicit tenant win over the ambient one", async () => {
    const { client, fetchImpl } = clientFor(EMPTY, "acme");

    await new EventRecorderApi(client).list({ tenantId: "globex" });

    expect(urlOf(fetchImpl).searchParams.get("tenantId")).toBe("globex");
  });

  it("returns the page as the recorder sent it", async () => {
    const { client } = clientFor({
      data: [
        {
          id: "r1",
          receivedAt: "2026-08-25T12:00:00Z",
          channelKey: "orders",
          eventKey: null,
          status: "UNRESOLVED",
          payload: '{"unknown":true}',
          truncated: false,
        },
      ],
      total: 1,
      start: 0,
      size: 25,
    });

    const page = await new EventRecorderApi(client).list();

    expect(page.total).toBe(1);
    expect(page.data[0].status).toBe("UNRESOLVED");
    expect(page.data[0].eventKey).toBeNull();
  });
});
