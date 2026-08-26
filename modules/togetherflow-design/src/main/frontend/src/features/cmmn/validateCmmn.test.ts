import { describe, expect, it } from "vitest";

import { createElement, emptyCase, type CmmnCase, type CmmnElement } from "./cmmnModel";
import { problemMarkers, validateCmmn } from "./validateCmmn";

/** A case with the given elements, all directly under the plan model. */
function caseWith(...elements: CmmnElement[]): CmmnCase {
  const model = emptyCase("caseA", "Case A");
  return { ...model, elements: elements.map((e) => ({ ...e, parentId: model.planModelId })) };
}

function make(type: Parameters<typeof createElement>[0], name = "Thing"): CmmnElement {
  return { ...createElement(type, { x: 0, y: 0 }, "plan"), name };
}

function messages(model: CmmnCase): string[] {
  return validateCmmn(model).map((issue) => issue.message);
}

describe("validateCmmn", () => {
  it("passes a case whose elements are all configured", () => {
    const human = make("humanTask", "Approve");
    const process = { ...make("processTask", "Notify"), plainAttributes: { processRef: "notify" } };
    expect(validateCmmn(caseWith(human, process))).toEqual([]);
  });

  it("reports every element sharing a definition id once", () => {
    const first = { ...make("humanTask", "One"), definitionId: "shared" };
    const second = { ...make("humanTask", "Two"), definitionId: "shared" };

    const duplicates = messages(caseWith(first, second)).filter((m) => m.includes("more than one"));
    expect(duplicates).toHaveLength(0);
    expect(messages(caseWith(first, second))).toContain(
      'More than one element has the id "shared". Ids have to be unique.',
    );
  });

  it("warns about an unnamed element rather than blocking it", () => {
    const nameless = { ...make("humanTask"), name: "  " };
    const [issue] = validateCmmn(caseWith(nameless));

    expect(issue.severity).toBe("warning");
    expect(issue.elementId).toBe(nameless.planItemId);
  });

  it("marks the problem against the plan item, which is what the canvas draws", () => {
    const task = make("processTask", "Notify");
    const [issue] = validateCmmn(caseWith(task));

    expect(issue.elementId).toBe(task.planItemId);
    expect(issue.source).toBe("browser");
  });

  it("reports a process task with no process to start", () => {
    expect(messages(caseWith(make("processTask", "Notify")))).toContain(
      'The process task "Notify" names no process to start.',
    );
  });

  it("reports a case task with no case to start", () => {
    expect(messages(caseWith(make("caseTask", "Sub")))).toContain(
      'The case task "Sub" names no case to start.',
    );
  });

  it("reports a timer with no expression", () => {
    expect(messages(caseWith(make("timerEventListener", "Deadline")))).toContain(
      'The timer "Deadline" has no expression, so it never fires.',
    );
  });

  it("accepts a timer once it has an expression", () => {
    const timer = { ...make("timerEventListener", "Deadline"), timerExpression: "PT1H" };
    expect(validateCmmn(caseWith(timer))).toEqual([]);
  });

  it("reports a service task with neither a type nor an implementation", () => {
    expect(messages(caseWith(make("serviceTask", "Call")))).toContain(
      'The task "Call" has no implementation, so it fails when reached.',
    );
  });

  it.each(["class", "expression", "delegateExpression"])(
    "accepts a service task implemented by %s",
    (attribute) => {
      const task = { ...make("serviceTask", "Call"), attributes: { [attribute]: "x" } };
      expect(validateCmmn(caseWith(task))).toEqual([]);
    },
  );

  it("reports the fields an http task cannot run without", () => {
    const http = { ...make("serviceTask", "Fetch"), attributes: { type: "http" } };

    expect(messages(caseWith(http))).toEqual([
      'The HTTP task "Fetch" has no requestUrl field.',
      'The HTTP task "Fetch" has no requestMethod field.',
    ]);
  });

  it("accepts an http task once both fields are set", () => {
    const http = {
      ...make("serviceTask", "Fetch"),
      attributes: { type: "http" },
      fields: [
        { name: "requestUrl", valueKind: "string" as const, value: "https://example.test" },
        { name: "requestMethod", valueKind: "string" as const, value: "GET" },
      ],
    };
    expect(validateCmmn(caseWith(http))).toEqual([]);
  });

  it("reports an empty stage", () => {
    expect(messages(caseWith(make("stage", "Review")))).toContain(
      'The stage "Review" is empty, so nothing happens inside it.',
    );
  });

  it("accepts a stage with a child", () => {
    const stage = make("stage", "Review");
    const model = caseWith(stage, make("humanTask", "Approve"));
    const withChild = {
      ...model,
      elements: model.elements.map((element) =>
        element.type === "humanTask" ? { ...element, parentId: stage.planItemId } : element,
      ),
    };

    expect(validateCmmn(withChild)).toEqual([]);
  });

  it("reports a criterion that waits for nothing", () => {
    const task = { ...make("humanTask", "Approve"), entrySentries: [{ id: "s1", onParts: [] }] };
    expect(messages(caseWith(task))).toContain(
      'An entry criterion on "Approve" waits for nothing, so it never fires.',
    );
  });

  it("accepts a criterion guarded only by an ifPart", () => {
    const task = {
      ...make("humanTask", "Approve"),
      entrySentries: [{ id: "s1", onParts: [], ifPart: "${ready}" }],
    };
    expect(validateCmmn(caseWith(task))).toEqual([]);
  });

  it("reports an exit criterion whose trigger names no source", () => {
    const task = {
      ...make("humanTask", "Approve"),
      exitSentries: [{ id: "s1", onParts: [{ sourceRef: "  ", standardEvent: "complete" }] }],
    };
    expect(messages(caseWith(task))).toContain(
      'An exit criterion on "Approve" has a trigger with no element chosen.',
    );
  });

  it("falls back to the id when naming an unnamed element in a message", () => {
    const task = { ...make("processTask"), name: "" };
    expect(messages(caseWith(task))).toContain(
      `The process task "${task.definitionId}" names no process to start.`,
    );
  });

  /*
   * The engine's own validator reports four problems. Repeating any of them here would
   * put the same problem in the panel twice in two wordings, so none of them appear.
   */
  it("leaves the engine's own four checks alone", () => {
    const decision = make("decisionTask", "Decide");
    const emptyPlanModel = emptyCase("caseB", "Case B");

    expect(validateCmmn(caseWith(decision))).toEqual([]);
    expect(validateCmmn(emptyPlanModel)).toEqual([]);
  });
});

describe("problemMarkers", () => {
  const task = make("humanTask", "Approve");
  const model = caseWith(task);

  it("marks nothing when there are no issues", () => {
    expect(problemMarkers(null, model).size).toBe(0);
    expect(problemMarkers([], model).size).toBe(0);
  });

  it("marks by plan item id when the issue already names one", () => {
    const markers = problemMarkers(
      [{ severity: "error", message: "x", elementId: task.planItemId }],
      model,
    );
    expect(markers.get(task.planItemId)).toBe("error");
  });

  it("resolves the definition id the engine reports back to its plan item", () => {
    const markers = problemMarkers(
      [{ severity: "error", message: "x", elementId: task.definitionId, source: "engine" }],
      model,
    );

    expect(markers.get(task.planItemId)).toBe("error");
    expect(markers.has(task.definitionId)).toBe(false);
  });

  it("keeps the error when an element has both an error and a warning", () => {
    const warningFirst = problemMarkers(
      [
        { severity: "warning", message: "w", elementId: task.planItemId },
        { severity: "error", message: "e", elementId: task.planItemId },
      ],
      model,
    );
    const errorFirst = problemMarkers(
      [
        { severity: "error", message: "e", elementId: task.planItemId },
        { severity: "warning", message: "w", elementId: task.planItemId },
      ],
      model,
    );

    expect(warningFirst.get(task.planItemId)).toBe("error");
    expect(errorFirst.get(task.planItemId)).toBe("error");
  });

  it("ignores issues that name no element", () => {
    expect(problemMarkers([{ severity: "error", message: "x" }], model).size).toBe(0);
  });

  it("marks nothing before a model has loaded", () => {
    expect(problemMarkers([{ severity: "error", message: "x", elementId: "a" }], null).size).toBe(0);
  });
});
