import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { MODEL_CATEGORY, ModelApi, modelKindOf, type ModelResponse } from "./models";

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

describe("ModelApi.deploy", () => {
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
