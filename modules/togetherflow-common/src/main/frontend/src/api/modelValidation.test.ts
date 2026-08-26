import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { ModelValidationApi, elementIdOf, type ServerValidationResult } from "./models";

const CLEAN: ServerValidationResult = { valid: true, errorCount: 0, warningCount: 0, errors: [] };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(body: unknown = CLEAN) {
  const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse(body));
  const process = new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as never });
  const cmmn = new ApiClient({ baseUrl: "/cmmn-api", fetchImpl: fetchImpl as never });
  return { fetchImpl, api: new ModelValidationApi(process, cmmn) };
}

describe("ModelValidationApi", () => {
  it("posts the XML verbatim rather than JSON-encoding it", async () => {
    const { fetchImpl, api } = setup();
    await api.validateBpmn("<definitions/>");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/process-api/repository/model-validation");
    expect(init.method).toBe("POST");
    // The endpoint parses the body as XML: a JSON-encoded string would be unparseable.
    expect(init.body).toBe("<definitions/>");
    expect(init.headers["Content-Type"]).toBe("application/xml;charset=UTF-8");
  });

  it("sends case models to the CMMN servlet, not the process one", async () => {
    const { fetchImpl, api } = setup();
    await api.validateCmmn("<definitions/>");

    expect(fetchImpl.mock.calls[0][0]).toBe("/cmmn-api/cmmn-repository/model-validation");
  });

  it("refuses to validate a case model when no CMMN client was configured", async () => {
    const fetchImpl = vi.fn();
    const api = new ModelValidationApi(
      new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as never }),
    );

    await expect(api.validateCmmn("<definitions/>")).rejects.toThrow(/CMMN/);
    // Rather than silently posting a case model to the BPMN validator.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns the engine's verdict as-is", async () => {
    const verdict: ServerValidationResult = {
      valid: false,
      errorCount: 1,
      warningCount: 1,
      errors: [
        { problem: "flowable-servicetask-missing-implementation", activityId: "doWork", warning: false },
        { problem: "flowable-plan-model-empty", itemId: "planModel", warning: true },
      ],
    };
    const { api } = setup(verdict);

    await expect(api.validateBpmn("<definitions/>")).resolves.toEqual(verdict);
  });
});

describe("elementIdOf", () => {
  it("reads whichever element identifier the engine used", () => {
    // BPMN reports activityId; CMMN reports itemId. One panel renders both.
    expect(elementIdOf({ activityId: "doWork" })).toBe("doWork");
    expect(elementIdOf({ itemId: "planItem1" })).toBe("planItem1");
    expect(elementIdOf({})).toBeUndefined();
  });
});
