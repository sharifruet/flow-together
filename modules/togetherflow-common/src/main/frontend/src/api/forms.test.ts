import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { FormApi } from "./forms";
import { TaskApi } from "./resources";

function setup(response: unknown = {}, status = 200) {
  const fetchImpl = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(response), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  const client = new ApiClient({ baseUrl: "/form-api", fetchImpl: fetchImpl as unknown as typeof fetch });
  return { api: new FormApi(client), fetchImpl };
}

const call = (fetchImpl: ReturnType<typeof vi.fn>, n = 0) =>
  fetchImpl.mock.calls[n] as [string, RequestInit];

describe("FormApi", () => {
  it("lists definitions under the form repository, latest first by name", async () => {
    const { api, fetchImpl } = setup({ data: [], total: 0 });
    await api.listDefinitions({ key: "salesClearanceForm", latest: true });
    const [url] = call(fetchImpl);
    expect(url).toContain("/form-api/form-repository/form-definitions");
    expect(url).toContain("key=salesClearanceForm");
    expect(url).toContain("latest=true");
  });

  it("deploys editor JSON as a .form file named after the key", async () => {
    const { api, fetchImpl } = setup({ id: "dep-1", name: "salesClearanceForm.form" });
    await api.deployJson("salesClearanceForm", "{\"key\":\"salesClearanceForm\"}");
    const [url, init] = call(fetchImpl);
    expect(url).toContain("/form-api/form-repository/deployments");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    const file = body.get("file0") as File;
    expect(file.name).toBe("salesClearanceForm.form");
    expect(body.get("deploymentName")).toBe("salesClearanceForm.form");
  });

  it("reads a submission back as a model through form-instance-model", async () => {
    const { api, fetchImpl } = setup({ formInstanceId: "fi-1", fields: [] });
    await api.getInstanceModel("fi-1");
    const [url, init] = call(fetchImpl);
    expect(url).toContain("/form-api/form/form-instance-model");
    expect(JSON.parse(init.body as string)).toEqual({ formInstanceId: "fi-1" });
  });

  it("deletes a deployment with an explicit cascade flag", async () => {
    const { api, fetchImpl } = setup({});
    await api.deleteDeployment("dep-1", true);
    const [url, init] = call(fetchImpl);
    expect(url).toContain("/form-api/form-repository/deployments/dep-1");
    expect(url).toContain("cascade=true");
    expect(init.method).toBe("DELETE");
  });
});

describe("TaskApi.completeWithForm", () => {
  it("posts the form definition, outcome and values as one complete action", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(null, { status: 200 }));
    const api = new TaskApi(new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as unknown as typeof fetch }));
    await api.completeWithForm("t1", "def-1", "approve", [{ name: "amount", type: "double", value: 12.5 }]);
    const [url, init] = call(fetchImpl);
    expect(url).toContain("/process-api/runtime/tasks/t1");
    expect(JSON.parse(init.body as string)).toEqual({
      action: "complete",
      formDefinitionId: "def-1",
      outcome: "approve",
      variables: [{ name: "amount", type: "double", value: 12.5 }],
    });
  });

  it("leaves the outcome out when the form has none", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(null, { status: 200 }));
    const api = new TaskApi(new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as unknown as typeof fetch }));
    await api.completeWithForm("t1", "def-1", undefined, []);
    expect(JSON.parse(call(fetchImpl)[1].body as string)).not.toHaveProperty("outcome");
  });

  it("completes a case task through the CMMN API, where the engine that owns it lives", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(null, { status: 200 }));
    const asFetch = fetchImpl as unknown as typeof fetch;
    const api = new TaskApi(
      new ApiClient({ baseUrl: "/process-api", fetchImpl: asFetch }),
      undefined,
      new ApiClient({ baseUrl: "/cmmn-api", fetchImpl: asFetch }),
    );
    await api.completeWithForm("t1", "def-1", "approve", [], { scopeType: "cmmn" });
    await api.complete("t1", [], { scopeType: "cmmn" });
    await api.complete("t2", [], { scopeType: "bpmn" });
    expect(call(fetchImpl, 0)[0]).toContain("/cmmn-api/cmmn-runtime/tasks/t1");
    expect(call(fetchImpl, 1)[0]).toContain("/cmmn-api/cmmn-runtime/tasks/t1");
    expect(call(fetchImpl, 2)[0]).toContain("/process-api/runtime/tasks/t2");
  });

  it("reads a case task's form, live and historic, from the CMMN API", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      async () => new Response(JSON.stringify({ id: "def-1", fields: [] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const asFetch = fetchImpl as unknown as typeof fetch;
    const api = new TaskApi(
      new ApiClient({ baseUrl: "/process-api", fetchImpl: asFetch }),
      undefined,
      new ApiClient({ baseUrl: "/cmmn-api", fetchImpl: asFetch }),
    );
    await api.getFormResult("t1", undefined, { scopeType: "cmmn" });
    await api.getHistoricForm("t1", undefined, { scopeType: "cmmn" });
    await api.getHistoricForm("t2", undefined, { scopeType: null });
    expect(call(fetchImpl, 0)[0]).toContain("/cmmn-api/cmmn-runtime/tasks/t1/form");
    expect(call(fetchImpl, 1)[0]).toContain("/cmmn-api/cmmn-history/historic-task-instances/t1/form");
    expect(call(fetchImpl, 2)[0]).toContain("/process-api/history/historic-task-instances/t2/form");
  });

  it("falls back to the process API for a case task when no CMMN client is configured", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(null, { status: 200 }));
    const api = new TaskApi(new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as unknown as typeof fetch }));
    await api.complete("t1", [], { scopeType: "cmmn" });
    expect(call(fetchImpl)[0]).toContain("/process-api/runtime/tasks/t1");
  });

  it("reports why a task form could not be loaded", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ message: "Bad request", exception: "Form engine is not initialized" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const api = new TaskApi(new ApiClient({ baseUrl: "/process-api", fetchImpl: fetchImpl as unknown as typeof fetch }));
    const result = await api.getFormResult("t1");
    expect(result.form).toBeNull();
    expect(result.status).toBe(400);
  });
});
