import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { CaseApi, availablePlanItemActions } from "./cases";

function setup(response: unknown = {}) {
  const fetchImpl = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  const api = new CaseApi(
    new ApiClient({ baseUrl: "/cmmn-api", fetchImpl: fetchImpl as unknown as typeof fetch }),
  );
  return { api, fetchImpl };
}

const call = (fetchImpl: ReturnType<typeof vi.fn>, n = 0) =>
  fetchImpl.mock.calls[n] as [string, RequestInit];

describe("CaseApi.query", () => {
  it("posts to /cmmn-query, which is where the CMMN servlet accepts queries", async () => {
    const { api, fetchImpl } = setup({ data: [], total: 0 });
    await api.query({ businessKey: "CUST-1" });

    const [url, init] = call(fetchImpl);
    expect(url).toContain("/cmmn-api/cmmn-query/case-instances");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ businessKey: "CUST-1" });
  });

  it("sorts newest-first by default, and keeps paging out of the body", async () => {
    const { api, fetchImpl } = setup({ data: [], total: 0 });
    await api.query({ start: 25, size: 25 });

    const [url, init] = call(fetchImpl);
    expect(url).toContain("sort=startTime");
    expect(url).toContain("order=desc");
    expect(url).toContain("start=25");
    // Paging is a query parameter; sending it in the body would filter, not page.
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("queries history separately, since the runtime tables drop finished cases", async () => {
    const { api, fetchImpl } = setup({ data: [], total: 0 });
    await api.queryHistoric({ involvedUser: "alice" });

    expect(call(fetchImpl)[0]).toContain("/cmmn-query/historic-case-instances");
  });
});

describe("CaseApi.listHistoricVariables", () => {
  /**
   * The historic endpoint wraps each row and nests the variable under `variable`,
   * unlike the runtime endpoint which returns a bare array — confirmed against a
   * running engine. Returning the rows unflattened would render an empty grid.
   */
  it("unwraps the nested variable rows", async () => {
    const { api } = setup({
      data: [
        { id: "v1", variable: { name: "customer", type: "string", value: "Northwind" } },
        { id: "v2" },
      ],
      total: 2,
    });

    await expect(api.listHistoricVariables("c1")).resolves.toEqual([
      { name: "customer", type: "string", value: "Northwind" },
    ]);
  });
});

describe("CaseApi lifecycle actions", () => {
  it("terminates and deletes through different endpoints", async () => {
    const { api, fetchImpl } = setup();
    await api.terminate("c1");
    await api.delete("c1");

    expect(call(fetchImpl, 0)[0]).toMatch(/case-instances\/c1$/);
    expect(call(fetchImpl, 0)[1].method).toBe("DELETE");
    expect(call(fetchImpl, 1)[0]).toMatch(/case-instances\/c1\/delete$/);
  });

  it("sends a plan item action as the engine's action body", async () => {
    const { api, fetchImpl } = setup();
    await api.performPlanItemAction("p1", "trigger");

    const [url, init] = call(fetchImpl);
    expect(url).toContain("/cmmn-runtime/plan-item-instances/p1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ action: "trigger" });
  });

  it("encodes ids that would otherwise break the path", async () => {
    const { api, fetchImpl } = setup();
    await api.get("a/b c");
    expect(call(fetchImpl)[0]).toContain("a%2Fb%20c");
  });
});

describe("availablePlanItemActions", () => {
  /**
   * The engine refuses `start` on an AVAILABLE item ("Can only enable a plan item
   * instance which is in state ENABLED"), so offering the button would guarantee an
   * error toast. These mappings come from PlanItemInstanceResource.
   */
  it("offers nothing for an item still blocked on its sentry", () => {
    expect(availablePlanItemActions("available")).toEqual([]);
  });

  it("lets an enabled item be started or disabled", () => {
    expect(availablePlanItemActions("enabled")).toEqual(["start", "disable"]);
  });

  it("lets a disabled item be re-enabled", () => {
    expect(availablePlanItemActions("disabled")).toEqual(["enable"]);
  });

  it("lets an active item be triggered", () => {
    expect(availablePlanItemActions("active")).toEqual(["trigger"]);
  });

  it("is case-insensitive, since the engine reports states in upper case", () => {
    expect(availablePlanItemActions("ENABLED")).toEqual(["start", "disable"]);
  });

  it("offers nothing for a completed or unknown state", () => {
    expect(availablePlanItemActions("completed")).toEqual([]);
    expect(availablePlanItemActions(undefined)).toEqual([]);
  });

  /**
   * Verified against a running engine: triggering an ACTIVE human task returns 204 and
   * completes it, bypassing the form, the assignee and any validation. Fine as an admin
   * escape hatch, unacceptable beside the task in an end-user's case view.
   */
  it("hides trigger on a human task by default, so a form cannot be bypassed", () => {
    expect(availablePlanItemActions("active", { planItemDefinitionType: "humantask" })).toEqual([]);
  });

  it("offers it to an admin surface that opts in", () => {
    expect(
      availablePlanItemActions("active", {
        planItemDefinitionType: "humantask",
        allowTriggeringHumanTasks: true,
      }),
    ).toEqual(["trigger"]);
  });

  it("still triggers non-human plan items without opting in", () => {
    expect(availablePlanItemActions("active", { planItemDefinitionType: "stage" })).toEqual([
      "trigger",
    ]);
  });

  it("matches the engine's upper-case definition types", () => {
    expect(availablePlanItemActions("active", { planItemDefinitionType: "HUMANTASK" })).toEqual([]);
  });

  it("leaves non-trigger actions on a human task alone", () => {
    expect(availablePlanItemActions("enabled", { planItemDefinitionType: "humantask" })).toEqual([
      "start",
      "disable",
    ]);
  });
});
