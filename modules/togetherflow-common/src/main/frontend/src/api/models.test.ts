import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import {
  ConcurrentEditError,
  MODEL_CATEGORY,
  ModelApi,
  __resetSourceBaselines,
  modelKindOf,
  type ModelResponse,
} from "./models";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function setup() {
  const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse({ id: "dep-1" }));
  const process = new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as never });
  const dmn = new ApiClient({ baseUrl: "/dmn-api", fetchImpl: fetchImpl as never });
  return { fetchImpl, api: new ModelApi(process, dmn) };
}

const bpmnModel: ModelResponse = { id: "m1", name: "Invoice approval", key: "invoiceApproval" };
const dmnModel: ModelResponse = {
  id: "m2",
  name: "Discounts",
  key: "discountRules",
  category: MODEL_CATEGORY.dmn,
};

describe("modelKindOf", () => {
  it("reads the language from the category, defaulting to BPMN", () => {
    expect(modelKindOf(bpmnModel)).toBe("bpmn");
    expect(modelKindOf({ ...bpmnModel, category: MODEL_CATEGORY.bpmn })).toBe("bpmn");
    expect(modelKindOf(dmnModel)).toBe("dmn");
  });
});

describe("ModelApi.saveSource", () => {
  beforeEach(() => __resetSourceBaselines());

  it("sends multipart, which is the only form the source endpoint accepts", async () => {
    const { fetchImpl, api } = setup();
    await api.saveSource("m1", "<xml/>");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/process-api/repository/models/m1/source");
    expect(init.method).toBe("PUT");
    expect(init.body).toBeInstanceOf(FormData);
    // A hand-set Content-Type would strip the multipart boundary.
    expect(init.headers["Content-Type"]).toBeUndefined();
  });
});

/**
 * The concurrent-edit guard (UI_POLISH_BACKLOG.md I1, ENTERPRISE_PARITY_PLAN.md W1.1).
 *
 * The editors autosave every four idle seconds against an unconditional PUT, so before
 * this two people on one model overwrote each other with neither pressing Save.
 */
describe("ModelApi.saveSource — concurrent-edit guard", () => {
  beforeEach(() => __resetSourceBaselines());

  /**
   * jsdom's `File` implements no `.text()`, so the multipart part is read the way a
   * browser without it would: through `FileReader`.
   */
  function readPart(part: FormDataEntryValue): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(part as Blob);
    });
  }

  /** A fetch stub whose stored source can be changed mid-test, as a second editor would. */
  function editorSetup(stored: string) {
    const state = { source: stored, writes: [] as string[] };
    const fetchImpl = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/source")) {
        if ((init?.method ?? "GET") === "PUT") {
          const body = init!.body as FormData;
          const written = await readPart(body.get("file")!);
          state.writes.push(written);
          state.source = written;
          return new Response(null, { status: 204 });
        }
        return new Response(state.source, {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        });
      }
      return jsonResponse({ id: "x" });
    });
    const client = new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as never });
    return { state, fetchImpl, api: new ModelApi(client) };
  }

  it("refuses a save when someone else wrote since this editor last read", async () => {
    const { state, api } = editorSetup("<v1/>");
    expect(await api.getSource("m1")).toBe("<v1/>");

    // A second editor saves.
    state.source = "<theirs/>";

    await expect(api.saveSource("m1", "<mine/>")).rejects.toBeInstanceOf(ConcurrentEditError);
    // The point of the guard: their work is still there.
    expect(state.source).toBe("<theirs/>");
  });

  it("hands the caller what is stored, so reload needs no second fetch", async () => {
    const { state, api } = editorSetup("<v1/>");
    await api.getSource("m1");
    state.source = "<theirs/>";

    const error = await api.saveSource("m1", "<mine/>").catch((cause) => cause);
    expect(error).toBeInstanceOf(ConcurrentEditError);
    expect((error as ConcurrentEditError).modelId).toBe("m1");
    expect((error as ConcurrentEditError).storedSource).toBe("<theirs/>");
  });

  it("overwrites on request, which is the other half of reload-or-overwrite", async () => {
    const { state, api } = editorSetup("<v1/>");
    await api.getSource("m1");
    state.source = "<theirs/>";

    await api.saveSource("m1", "<mine/>", { overwrite: true });
    expect(state.source).toBe("<mine/>");
  });

  it("allows the save when nothing changed underneath", async () => {
    const { state, api } = editorSetup("<v1/>");
    await api.getSource("m1");

    await api.saveSource("m1", "<v2/>");
    expect(state.source).toBe("<v2/>");
  });

  it("treats its own last write as the new baseline, so a second autosave is not refused", async () => {
    const { state, api } = editorSetup("<v1/>");
    await api.getSource("m1");

    await api.saveSource("m1", "<v2/>");
    await api.saveSource("m1", "<v3/>");
    expect(state.writes).toEqual(["<v2/>", "<v3/>"]);
    expect(state.source).toBe("<v3/>");
  });

  it("does not guard a model this browser has never read — a new row has no baseline", async () => {
    const { state, api } = editorSetup("<whatever/>");
    // No getSource first: this is `create` followed by the first `saveSource`.
    await api.saveSource("new-1", "<fresh/>");
    expect(state.source).toBe("<fresh/>");
  });

  it("saves anyway when the guard's own read fails", async () => {
    // A transient read error must not become lost work: failing open is the right
    // trade when the alternative is refusing every save on a flaky connection.
    const { api } = editorSetup("<v1/>");
    await api.getSource("m1");

    const failing = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/source") && (init?.method ?? "GET") === "GET") {
        throw new TypeError("network down");
      }
      return new Response(null, { status: 204 });
    });
    const offline = new ModelApi(
      new ApiClient({ baseUrl: "/process-api", fetchImpl: failing as never, retry: { attempts: 1 } }),
    );

    await expect(offline.saveSource("m1", "<mine/>")).resolves.toBeUndefined();
  });

  it("trackSource declares a baseline without a round trip", async () => {
    const { state, api } = editorSetup("<v1/>");
    api.trackSource("m1", "<v1/>");
    state.source = "<theirs/>";

    await expect(api.saveSource("m1", "<mine/>")).rejects.toBeInstanceOf(ConcurrentEditError);
  });
});

describe("ModelApi.deploy", () => {
  it("deploys to the process engine even when drafts go through the workspace guard", async () => {
    /*
     * Regression (ADR 0017). Pointing the model repository at the guard is the whole
     * mechanism by which drafts get permission-checked — but the guard proxies
     * `/repository/models` and nothing else, so a deployment sent through it 404s. The
     * two clients must stay separable.
     */
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse({ id: "dep-1" }));
    const guard = new ApiClient({ baseUrl: "/workspace-api", fetchImpl: fetchImpl as never });
    const process = new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as never });
    const api = new ModelApi(guard, undefined, undefined, process);

    await api.deploy(bpmnModel, "<definitions/>");

    const deployUrl = fetchImpl.mock.calls
      .map((call) => String(call[0]))
      .find((url) => url.includes("/repository/deployments"));
    expect(deployUrl).toContain("/process-api/repository/deployments");
    expect(deployUrl).not.toContain("/workspace-api");
  });

  it("names the BPMN part so the engine recognises it", async () => {
    const { fetchImpl, api } = setup();
    await api.deploy(bpmnModel, "<definitions/>");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/process-api/repository/deployments");
    // deploymentName is only honoured as a query param, not a form field.
    expect(url).toContain("deploymentName=Invoice+approval");

    const form = init.body as FormData;
    const [fieldName] = [...form.keys()];
    // The engine falls back to the field name when the filename has no known suffix,
    // and matches `.bpmn20.xml` case-sensitively — both must hold.
    expect(fieldName).toBe("invoiceApproval.bpmn20.xml");
    expect(form.get(fieldName)).toBeInstanceOf(Blob);
  });

  it("routes a DMN model to the DMN servlet with a .dmn part", async () => {
    const { fetchImpl, api } = setup();
    await api.deploy(dmnModel, "<definitions/>");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/dmn-api/dmn-repository/deployments");
    // The DMN endpoint accepts no deploymentName parameter.
    expect(url).not.toContain("deploymentName");

    const [fieldName] = [...(init.body as FormData).keys()];
    expect(fieldName).toBe("discountRules.dmn");
  });

  it("sanitises a name that would be illegal in a file name", async () => {
    const { fetchImpl, api } = setup();
    await api.deploy({ id: "m3", name: "Order / cash flow!" }, "<definitions/>");

    const [fieldName] = [...(fetchImpl.mock.calls[0][1].body as FormData).keys()];
    // Runs of illegal characters collapse to a single dash.
    expect(fieldName).toBe("Order-cash-flow-.bpmn20.xml");
  });

  it("refuses a DMN deploy when no DMN client is configured, rather than posting to the wrong servlet", async () => {
    const fetchImpl = vi.fn();
    const api = new ModelApi(new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as never }));

    await expect(api.deploy(dmnModel, "<x/>")).rejects.toThrow(/DMN API/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("ModelApi.getSource", () => {
  it("returns null instead of throwing when a draft has no source yet", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    const api = new ModelApi(new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as never }));

    await expect(api.getSource("m1")).resolves.toBeNull();
  });

  it("returns XML verbatim", async () => {
    const xml = '<?xml version="1.0"?><definitions id="d"/>';
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(xml, { status: 200 }));
    const api = new ModelApi(new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as never }));

    await expect(api.getSource("m1")).resolves.toBe(xml);
  });

  /**
   * App, form and event drafts store JSON. The client's default body handling parses
   * anything that looks like JSON, which would hand back an object here — and the
   * caller, expecting text, would read the draft as empty and silently discard the
   * saved work. Found against a running engine: a saved event draft reopened blank.
   */
  it("returns a JSON source as text rather than a parsed object", async () => {
    const json = '{"event":{"key":"orderPlaced","payload":[]}}';
    const fetchImpl = vi.fn().mockImplementation(
      async () =>
        new Response(json, { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const api = new ModelApi(new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as never }));

    await expect(api.getSource("m1")).resolves.toBe(json);
  });

  it("treats an empty body as no source", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response("", { status: 200 }));
    const api = new ModelApi(new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as never }));

    await expect(api.getSource("m1")).resolves.toBeNull();
  });
});

describe("bundleFileName", () => {
  it("gives each language the suffix the engine matches on", async () => {
    const { bundleFileName } = await import("./apps");
    // BPMN and CMMN suffixes are matched case-sensitively by the engine.
    expect(bundleFileName("bpmn", "invoiceApproval")).toBe("invoiceApproval.bpmn20.xml");
    expect(bundleFileName("cmmn", "onboarding")).toBe("onboarding.cmmn");
    expect(bundleFileName("dmn", "discounts")).toBe("discounts.dmn");
  });

  it("sanitises a key that would be illegal in a file name", async () => {
    const { bundleFileName } = await import("./apps");
    expect(bundleFileName("bpmn", "order / cash!")).toBe("order-cash-.bpmn20.xml");
  });
});

describe("ModelApi.deploy for apps", () => {
  it("refuses to deploy an app as a single file — apps ship as a bundle", async () => {
    const fetchImpl = vi.fn();
    const api = new ModelApi(new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as never }));
    await expect(
      api.deploy({ id: "a1", key: "app", category: MODEL_CATEGORY.app }, "{}"),
    ).rejects.toThrow(/app builder/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
