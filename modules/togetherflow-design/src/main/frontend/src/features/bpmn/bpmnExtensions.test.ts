/**
 * The nested parts of a Flowable BPMN model (REQUIREMENTS.md §7.4.2).
 *
 * The failure worth guarding hardest against is silent loss: a model that round-trips
 * through this editor must come back carrying everything it arrived with, including the
 * extension elements this panel does not itself understand. That is the same class of
 * bug the moddle descriptor exists to prevent, one level further in.
 */

import { describe, expect, it, vi } from "vitest";
import {
  applyTimer,
  buildMultiInstance,
  isBoundaryEvent,
  readListeners,
  readMultiInstance,
  readTimer,
  supportsExecutionListeners,
  supportsMultiInstance,
  writeListeners,
  type ModdleElement,
  type ModdleFactory,
} from "./bpmnExtensions";

/** Stands in for bpmn-js's moddle: records the type and returns a plain object. */
function fakeFactory(): ModdleFactory & { create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(
    (type: string, properties: Record<string, unknown> = {}): ModdleElement => ({
      $type: type,
      ...properties,
    }),
  );
  return { create };
}

function listener(type: string, props: Record<string, unknown>): ModdleElement {
  return { $type: type, ...props };
}

describe("listeners", () => {
  it("reads execution listeners and the implementation each one uses", () => {
    const bo = {
      $type: "bpmn:UserTask",
      extensionElements: {
        values: [
          listener("flowable:ExecutionListener", { event: "start", class: "com.acme.OnStart" }),
          listener("flowable:ExecutionListener", {
            event: "end",
            delegateExpression: "${auditor}",
          }),
        ],
      },
    };
    expect(readListeners(bo, "execution")).toEqual([
      { event: "start", implementationType: "class", value: "com.acme.OnStart" },
      { event: "end", implementationType: "delegateExpression", value: "${auditor}" },
    ]);
  });

  it("keeps the two listener kinds apart", () => {
    const bo = {
      $type: "bpmn:UserTask",
      extensionElements: {
        values: [
          listener("flowable:ExecutionListener", { event: "start", class: "A" }),
          listener("flowable:TaskListener", { event: "create", class: "B" }),
        ],
      },
    };
    expect(readListeners(bo, "execution")).toHaveLength(1);
    expect(readListeners(bo, "task")).toEqual([
      { event: "create", implementationType: "class", value: "B" },
    ]);
  });

  it("reads a listener with no implementation without dropping it", () => {
    const bo = {
      $type: "bpmn:UserTask",
      extensionElements: { values: [listener("flowable:ExecutionListener", { event: "start" })] },
    };
    expect(readListeners(bo, "execution")).toEqual([
      { event: "start", implementationType: "class", value: "" },
    ]);
  });

  it("returns nothing for an element with no extension elements", () => {
    expect(readListeners({ $type: "bpmn:Task" }, "execution")).toEqual([]);
  });

  it("preserves extension elements it does not understand", () => {
    const factory = fakeFactory();
    const formProperty = listener("flowable:FormProperty", { id: "amount" });
    const bo = {
      $type: "bpmn:UserTask",
      extensionElements: {
        values: [formProperty, listener("flowable:ExecutionListener", { event: "start", class: "A" })],
      },
    };

    const result = writeListeners(factory, bo, "execution", [
      { event: "end", implementationType: "expression", value: "${done}" },
    ]);

    const values = result?.values as ModdleElement[];
    // The form property survives; only the execution listener was replaced.
    expect(values[0]).toBe(formProperty);
    expect(values[1]).toMatchObject({
      $type: "flowable:ExecutionListener",
      event: "end",
      expression: "${done}",
    });
  });

  it("preserves the other listener kind when rewriting one of them", () => {
    const factory = fakeFactory();
    const taskListener = listener("flowable:TaskListener", { event: "create", class: "B" });
    const bo = { $type: "bpmn:UserTask", extensionElements: { values: [taskListener] } };

    const result = writeListeners(factory, bo, "execution", [
      { event: "start", implementationType: "class", value: "A" },
    ]);

    expect((result?.values as ModdleElement[])).toContain(taskListener);
  });

  it("drops a row with no implementation — the engine cannot run it", () => {
    const factory = fakeFactory();
    const result = writeListeners(factory, { $type: "bpmn:Task" }, "execution", [
      { event: "start", implementationType: "class", value: "   " },
    ]);
    expect(result).toBeUndefined();
  });

  it("returns undefined rather than an empty extensionElements element", () => {
    const factory = fakeFactory();
    expect(writeListeners(factory, { $type: "bpmn:Task" }, "execution", [])).toBeUndefined();
  });
});

describe("multi-instance", () => {
  it("reports none for an element with no loop characteristics", () => {
    expect(readMultiInstance({ $type: "bpmn:UserTask" }).mode).toBe("none");
  });

  it("reads a parallel loop with its collection and element variable", () => {
    const bo = {
      $type: "bpmn:UserTask",
      loopCharacteristics: {
        $type: "bpmn:MultiInstanceLoopCharacteristics",
        isSequential: false,
        collection: "${approvers}",
        elementVariable: "approver",
        completionCondition: { $type: "bpmn:FormalExpression", body: "${nrOfCompletedInstances >= 2}" },
      },
    };
    expect(readMultiInstance(bo)).toEqual({
      mode: "parallel",
      collection: "${approvers}",
      elementVariable: "approver",
      cardinality: "",
      completionCondition: "${nrOfCompletedInstances >= 2}",
    });
  });

  it("reads a sequential loop", () => {
    const bo = {
      $type: "bpmn:UserTask",
      loopCharacteristics: {
        $type: "bpmn:MultiInstanceLoopCharacteristics",
        isSequential: true,
      },
    };
    expect(readMultiInstance(bo).mode).toBe("sequential");
  });

  it("ignores a standard loop, which is not multi-instance", () => {
    const bo = {
      $type: "bpmn:UserTask",
      loopCharacteristics: { $type: "bpmn:StandardLoopCharacteristics" },
    };
    expect(readMultiInstance(bo).mode).toBe("none");
  });

  it("builds a sequential loop with an expression cardinality", () => {
    const factory = fakeFactory();
    const built = buildMultiInstance(factory, {
      mode: "sequential",
      collection: "",
      elementVariable: "",
      cardinality: "3",
      completionCondition: "",
    });
    expect(built).toMatchObject({
      $type: "bpmn:MultiInstanceLoopCharacteristics",
      isSequential: true,
      loopCardinality: { $type: "bpmn:FormalExpression", body: "3" },
    });
  });

  it("omits blank fields rather than writing empty attributes", () => {
    const factory = fakeFactory();
    const built = buildMultiInstance(factory, {
      mode: "parallel",
      collection: "  ",
      elementVariable: "",
      cardinality: "",
      completionCondition: "",
    });
    expect(built).toEqual({ $type: "bpmn:MultiInstanceLoopCharacteristics", isSequential: false });
  });

  it("clears the loop when the mode is none", () => {
    const factory = fakeFactory();
    expect(
      buildMultiInstance(factory, {
        mode: "none",
        collection: "${x}",
        elementVariable: "y",
        cardinality: "",
        completionCondition: "",
      }),
    ).toBeUndefined();
  });

  it("applies to activities but not to events or gateways", () => {
    expect(supportsMultiInstance("bpmn:UserTask")).toBe(true);
    expect(supportsMultiInstance("bpmn:SubProcess")).toBe(true);
    expect(supportsMultiInstance("bpmn:CallActivity")).toBe(true);
    expect(supportsMultiInstance("bpmn:StartEvent")).toBe(false);
    expect(supportsMultiInstance("bpmn:ExclusiveGateway")).toBe(false);
  });
});

describe("timer event definitions", () => {
  it("reads whichever timer expression is set", () => {
    const bo = {
      $type: "bpmn:BoundaryEvent",
      eventDefinitions: [
        {
          $type: "bpmn:TimerEventDefinition",
          timeCycle: { $type: "bpmn:FormalExpression", body: "R3/PT10M" },
        },
      ],
    };
    expect(readTimer(bo)).toEqual({ kind: "cycle", value: "R3/PT10M" });
  });

  it("reports an unconfigured timer rather than nothing", () => {
    const bo = {
      $type: "bpmn:BoundaryEvent",
      eventDefinitions: [{ $type: "bpmn:TimerEventDefinition" }],
    };
    expect(readTimer(bo)).toEqual({ kind: "duration", value: "" });
  });

  it("returns null for an event that is not a timer", () => {
    const bo = {
      $type: "bpmn:BoundaryEvent",
      eventDefinitions: [{ $type: "bpmn:ErrorEventDefinition" }],
    };
    expect(readTimer(bo)).toBeNull();
  });

  it("writes only the chosen kind, so a timer is never ambiguous", () => {
    const factory = fakeFactory();
    const bo = {
      $type: "bpmn:BoundaryEvent",
      eventDefinitions: [
        {
          $type: "bpmn:TimerEventDefinition",
          timeDuration: { $type: "bpmn:FormalExpression", body: "PT1H" },
        },
      ],
    };

    const [definition] = applyTimer(factory, bo, { kind: "date", value: "2026-12-24T09:00:00" });

    expect(definition).toEqual({
      $type: "bpmn:TimerEventDefinition",
      timeDate: { $type: "bpmn:FormalExpression", body: "2026-12-24T09:00:00" },
    });
    expect(definition.timeDuration).toBeUndefined();
  });

  it("leaves other event definitions alone", () => {
    const factory = fakeFactory();
    const error = { $type: "bpmn:ErrorEventDefinition" };
    const bo = {
      $type: "bpmn:BoundaryEvent",
      eventDefinitions: [error, { $type: "bpmn:TimerEventDefinition" }],
    };
    expect(applyTimer(factory, bo, { kind: "duration", value: "PT5M" })[0]).toBe(error);
  });
});

describe("element capability checks", () => {
  it("recognises a boundary event", () => {
    expect(isBoundaryEvent("bpmn:BoundaryEvent")).toBe(true);
    expect(isBoundaryEvent("bpmn:IntermediateCatchEvent")).toBe(false);
  });

  it("allows execution listeners on flow nodes, sequence flows and the process", () => {
    expect(supportsExecutionListeners("bpmn:Process")).toBe(true);
    expect(supportsExecutionListeners("bpmn:SequenceFlow")).toBe(true);
    expect(supportsExecutionListeners("bpmn:ServiceTask")).toBe(true);
    expect(supportsExecutionListeners("bpmn:ExclusiveGateway")).toBe(true);
    expect(supportsExecutionListeners("bpmn:StartEvent")).toBe(true);
    // Not a flow node — a lane carries no behaviour to listen to.
    expect(supportsExecutionListeners("bpmn:Lane")).toBe(false);
  });
});
