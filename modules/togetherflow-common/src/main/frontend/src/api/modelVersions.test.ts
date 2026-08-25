/**
 * Model version history (REQUIREMENTS.md §7.4.1).
 *
 * Built on the engine's own model versioning — rows sharing a `key` form a series, and
 * the highest version is the working draft — rather than on a side table. What is worth
 * pinning is the bookkeeping around that: which row a caller should keep editing, that
 * history is never rewritten, and that a failure to record history never costs a deploy.
 */

import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { MODEL_CATEGORY, ModelApi, type ModelResponse } from "./models";

function model(overrides: Partial<ModelResponse> = {}): ModelResponse {
  return {
    id: "m1",
    name: "Invoice approval",
    key: "invoice",
    category: MODEL_CATEGORY.bpmn,
    version: 1,
    ...overrides,
  };
}

/** Records requests and answers them from a small routing table. */
function stubClient(routes: (url: string, init: RequestInit) => unknown) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body });
    const result = routes(url, init);
    if (result instanceof Response) return result;
    return new Response(JSON.stringify(result ?? {}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new ApiClient({
    baseUrl: "/process-api",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    retry: { attempts: 1 },
  });
  return { client, calls };
}

describe("listVersions", () => {
  it("asks for the whole series for a key, newest first", async () => {
    const { client, calls } = stubClient(() => ({
      data: [model({ id: "m2", version: 2 }), model({ id: "m1", version: 1 })],
      total: 2,
      start: 0,
      size: 100,
    }));
    const versions = await new ModelApi(client).listVersions(model({ version: 2 }));

    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(calls[0].url).toContain("key=invoice");
    expect(calls[0].url).toContain("sort=version");
    expect(calls[0].url).toContain("order=desc");
  });

  it("keeps a different model type with the same key out of the series", async () => {
    const { client } = stubClient(() => ({
      data: [
        model({ id: "m2", version: 2 }),
        // A form that happens to share the key is a different thing entirely.
        model({ id: "f1", version: 1, category: MODEL_CATEGORY.form }),
      ],
      total: 2,
      start: 0,
      size: 100,
    }));
    const versions = await new ModelApi(client).listVersions(model({ version: 2 }));
    expect(versions.map((v) => v.id)).toEqual(["m2"]);
  });

  it("returns the model alone when it has no key to group by", async () => {
    const { client, calls } = stubClient(() => ({}));
    const only = await new ModelApi(client).listVersions(model({ key: undefined }));
    expect(only).toHaveLength(1);
    // No query at all — there is nothing to query for.
    expect(calls).toHaveLength(0);
  });
});

describe("cutVersion", () => {
  it("moves the draft on and archives the content at the version it left", async () => {
    const { client, calls } = stubClient((url, init) => {
      if (url.includes("/source")) return undefined;
      if ((init.method ?? "GET") === "PUT") return model({ id: "m1", version: 2 });
      return model({ id: "archive-1", version: 1 });
    });

    const draft = await new ModelApi(client).cutVersion(model({ version: 1 }), "<xml/>");

    // Same row, new version — which is what keeps the editor from re-importing.
    expect(draft.id).toBe("m1");
    expect(draft.version).toBe(2);

    const archive = calls.find((call) => call.method === "POST");
    expect(JSON.parse(String(archive?.body))).toMatchObject({
      key: "invoice",
      category: MODEL_CATEGORY.bpmn,
      version: 1,
    });
    expect(calls.some((call) => call.url.includes("/models/archive-1/source"))).toBe(true);
  });

  it("bumps the draft before creating the archive, so no two rows share a version", async () => {
    const { client, calls } = stubClient((url, init) => {
      if (url.includes("/source")) return undefined;
      if ((init.method ?? "GET") === "PUT") return model({ version: 2 });
      return model({ id: "archive-1", version: 1 });
    });

    await new ModelApi(client).cutVersion(model({ version: 1 }), "<xml/>");

    const bump = calls.findIndex((call) => call.method === "PUT" && !call.url.includes("/source"));
    const archive = calls.findIndex((call) => call.method === "POST");
    expect(bump).toBeLessThan(archive);
  });

  it("treats a model with no version as version 1", async () => {
    const { client, calls } = stubClient((url, init) => {
      if (url.includes("/source")) return undefined;
      if ((init.method ?? "GET") === "PUT") return model({ version: 2 });
      return model({ id: "archive-1" });
    });
    await new ModelApi(client).cutVersion(model({ version: undefined }), "<xml/>");
    const archive = calls.find((call) => call.method === "POST");
    expect(JSON.parse(String(archive?.body)).version).toBe(1);
  });
});

describe("restoreVersion", () => {
  it("writes the old content into the draft, having archived what was there", async () => {
    const { client, calls } = stubClient((url, init) => {
      if (url.includes("/models/old/source") && (init.method ?? "GET") === "GET") {
        return new Response("<old-content/>", {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        });
      }
      if (url.includes("/models/m1/source") && (init.method ?? "GET") === "GET") {
        return new Response("<current-content/>", {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        });
      }
      if (url.includes("/source")) return undefined;
      if ((init.method ?? "GET") === "PUT") return model({ version: 3 });
      return model({ id: "archive-2", version: 2 });
    });

    const draft = await new ModelApi(client).restoreVersion(
      model({ id: "m1", version: 2 }),
      model({ id: "old", version: 1 }),
    );

    expect(draft.version).toBe(3);

    // The state being rolled back from was archived, not lost.
    expect(calls.some((call) => call.url.includes("/models/archive-2/source"))).toBe(true);

    // The old version was read, never written to — history is never rewritten.
    expect(
      calls.some((call) => call.url.includes("/models/old") && call.method !== "GET"),
    ).toBe(false);
  });
});

describe("deploy", () => {
  it("cuts a version once the deployment succeeds, and hands back the new draft", async () => {
    const { client } = stubClient((url, init) => {
      if (url.includes("/repository/deployments")) return { id: "dep-1" };
      if (url.includes("/source")) return undefined;
      if ((init.method ?? "GET") === "PUT") return model({ id: "m1", version: 2 });
      return model({ id: "archive-1", version: 1 });
    });

    const result = await new ModelApi(client).deploy(model({ version: 1 }), "<xml/>");

    expect(result.id).toBe("dep-1");
    // Same draft row, moved on a version.
    expect(result.draft?.id).toBe("m1");
    expect(result.draft?.version).toBe(2);
  });

  it("still reports the deploy as succeeded when the version cannot be recorded", async () => {
    // The deploy really happened; failing it over a bookkeeping error would misreport
    // what the engine did.
    const { client } = stubClient((url) => {
      if (url.includes("/repository/deployments")) return { id: "dep-1" };
      return new Response(JSON.stringify({ message: "no" }), { status: 500 });
    });

    const result = await new ModelApi(client).deploy(model(), "<xml/>");

    expect(result.id).toBe("dep-1");
    expect(result.draft).toBeUndefined();
  });
});
