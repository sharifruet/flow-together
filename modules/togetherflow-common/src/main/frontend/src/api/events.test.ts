import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { EventRegistryApi, emptyChannel, emptyEventDraft, parseEventDraft } from "./events";

function clientWith(response: unknown) {
  const fetchMock = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  const client = new ApiClient({
    baseUrl: "/event-registry-api",
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
  return { client, fetchMock };
}

describe("EventRegistryApi.deploy", () => {
  it("posts a single file named after the key and kind", async () => {
    const { client, fetchMock } = clientWith({ id: "d1" });
    await new EventRegistryApi(client).deploy("event", "orderPlaced", "{}");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/event-registry-repository/deployments");
    expect(init.method).toBe("POST");

    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect([...body.keys()]).toEqual(["orderPlaced.event"]);
    expect((body.get("orderPlaced.event") as File).name).toBe("orderPlaced.event");
  });

  it("uses the .channel suffix for a channel", async () => {
    const { client, fetchMock } = clientWith({ id: "d2" });
    await new EventRegistryApi(client).deploy("channel", "orderChannel", "{}");

    const body = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect([...body.keys()]).toEqual(["orderChannel.channel"]);
  });

  it("sanitises a key that would make an unusable file name", async () => {
    const { client, fetchMock } = clientWith({ id: "d3" });
    await new EventRegistryApi(client).deploy("event", "order placed/v2", "{}");

    const body = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect([...body.keys()]).toEqual(["order-placed-v2.event"]);
  });

  it("leaves the multipart Content-Type to the browser so the boundary survives", async () => {
    const { client, fetchMock } = clientWith({ id: "d4" });
    await new EventRegistryApi(client).deploy("event", "e", "{}");

    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });
});

describe("parseEventDraft", () => {
  it("reads a saved draft carrying both an event and a channel", () => {
    const source = JSON.stringify({
      event: { key: "e1", name: "E One", payload: [{ name: "id", type: "string" }] },
      channel: emptyChannel("e1", "E One"),
    });
    const draft = parseEventDraft(source, "fallback", "Fallback");
    expect(draft.event?.key).toBe("e1");
    expect(draft.channel?.key).toBe("e1Channel");
  });

  it("keeps a draft that has only a channel", () => {
    const source = JSON.stringify({ channel: emptyChannel("e1", "E One") });
    const draft = parseEventDraft(source, "fallback", "Fallback");
    expect(draft.event).toBeUndefined();
    expect(draft.channel?.channelType).toBe("inbound");
  });

  it("falls back to a fresh draft when the source is missing or malformed", () => {
    expect(parseEventDraft(null, "k", "N")).toEqual(emptyEventDraft("k", "N"));
    expect(parseEventDraft("{not json", "k", "N")).toEqual(emptyEventDraft("k", "N"));
    // An empty object carries neither an event nor a channel, so it is not a draft.
    expect(parseEventDraft("{}", "k", "N")).toEqual(emptyEventDraft("k", "N"));
  });
});

describe("emptyEventDraft", () => {
  it("seeds a correlation parameter, which an event needs to match a waiting instance", () => {
    const draft = emptyEventDraft("orderPlaced", "Order placed");
    expect(draft.event?.payload).toEqual([{ name: "id", type: "string", correlationParameter: true }]);
    expect(draft.channel).toBeUndefined();
  });
});

describe("emptyChannel", () => {
  it("points an inbound channel at the event it feeds", () => {
    const channel = emptyChannel("orderPlaced", "Order placed");
    expect(channel.channelType).toBe("inbound");
    expect(channel.channelEventKeyDetection?.fixedValue).toBe("orderPlaced");
  });
});
