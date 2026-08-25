import { describe, expect, it } from "vitest";
import {
  applyGesture,
  connectElements,
  connectionPath,
  contains,
  elementAtPoint,
  normalise,
  type ModelGesture,
} from "./CmmnCanvas";
import type { CmmnCase, CmmnElement } from "./cmmnModel";

function element(id: string, x: number, y: number, extra: Partial<CmmnElement> = {}): CmmnElement {
  return {
    planItemId: id,
    definitionId: `def_${id}`,
    type: "humanTask",
    name: id,
    bounds: { x, y, width: 100, height: 60 },
    parentId: null,
    attributes: {},
    entrySentries: [],
    exitSentries: [],
    ...extra,
  };
}

const model: CmmnCase = {
  caseId: "c",
  caseName: "Case",
  planModelId: "plan",
  planModelName: "Plan",
  planModelBounds: { x: 20, y: 20, width: 800, height: 500 },
  elements: [element("a", 100, 100), element("b", 300, 100), element("c", 500, 100)],
};

describe("normalise / contains", () => {
  it("normalises a rectangle dragged in any direction", () => {
    expect(normalise(100, 100, 40, 30)).toEqual({ x: 40, y: 30, width: 60, height: 70 });
    expect(normalise(40, 30, 100, 100)).toEqual({ x: 40, y: 30, width: 60, height: 70 });
  });

  /**
   * A marquee selects only what it fully contains. Partial overlap would make a small
   * element inside a stage impossible to select without also grabbing the stage.
   */
  it("requires full containment", () => {
    const outer = { x: 0, y: 0, width: 200, height: 200 };
    expect(contains(outer, { x: 10, y: 10, width: 50, height: 50 })).toBe(true);
    expect(contains(outer, { x: 180, y: 10, width: 50, height: 50 })).toBe(false);
    // Exactly flush counts as inside.
    expect(contains(outer, { x: 0, y: 0, width: 200, height: 200 })).toBe(true);
  });
});

describe("elementAtPoint", () => {
  it("finds the element under a point", () => {
    expect(elementAtPoint(model, { x: 150, y: 130 })).toBe("a");
    expect(elementAtPoint(model, { x: 350, y: 130 })).toBe("b");
  });

  it("returns nothing for empty canvas space", () => {
    expect(elementAtPoint(model, { x: 700, y: 400 })).toBeUndefined();
  });

  it("ignores the element being dragged from", () => {
    expect(elementAtPoint(model, { x: 150, y: 130 }, "a")).toBeUndefined();
  });

  /** The last-drawn element is visually on top, so it wins a hit test. */
  it("prefers the topmost element when they overlap", () => {
    const overlapping: CmmnCase = {
      ...model,
      elements: [element("under", 100, 100), element("over", 120, 110)],
    };
    expect(elementAtPoint(overlapping, { x: 150, y: 130 })).toBe("over");
  });
});

describe("connectElements", () => {
  /**
   * CMMN has no sequence flow. A drawn connection is an entry criterion on the target
   * with a `planItemOnPart` listening to the source.
   */
  it("adds an entry sentry on the target pointing at the source", () => {
    const next = connectElements(model, "a", "b");
    const target = next.elements.find((e) => e.planItemId === "b")!;
    expect(target.entrySentries).toEqual([
      { id: "b_on_a", sourceRef: "a", standardEvent: "complete" },
    ]);
    // The source is untouched — the criterion belongs to the target.
    expect(next.elements.find((e) => e.planItemId === "a")!.entrySentries).toEqual([]);
  });

  it("refuses to connect an element to itself", () => {
    expect(connectElements(model, "a", "a")).toBe(model);
  });

  it("is idempotent, so drawing the same link twice adds one sentry", () => {
    const once = connectElements(model, "a", "b");
    expect(connectElements(once, "a", "b")).toBe(once);
  });

  it("keeps existing criteria when adding another source", () => {
    const next = connectElements(connectElements(model, "a", "c"), "b", "c");
    const target = next.elements.find((e) => e.planItemId === "c")!;
    expect(target.entrySentries.map((s) => s.sourceRef)).toEqual(["a", "b"]);
  });

  it("ignores a target that does not exist", () => {
    expect(connectElements(model, "a", "ghost")).toBe(model);
  });
});

describe("connectionPath", () => {
  it("leaves the source's right edge and enters the target's left edge", () => {
    const path = connectionPath(
      { x: 0, y: 0, width: 100, height: 60 },
      { x: 200, y: 100, width: 100, height: 60 },
    );
    expect(path.startsWith("M 100 30")).toBe(true);
    expect(path.endsWith("L 200 130")).toBe(true);
  });
});

describe("applyGesture — multi-element move", () => {
  const move = (alsoMoving: string[]): ModelGesture => ({
    kind: "move",
    planItemId: "a",
    startX: 0,
    startY: 0,
    origin: { x: 100, y: 100, width: 100, height: 60 },
    alsoMoving,
  });

  it("moves only the grabbed element by default", () => {
    const next = applyGesture(model, move(["a"]), 50, 20);
    expect(next.elements.find((e) => e.planItemId === "a")!.bounds).toMatchObject({
      x: 150,
      y: 120,
    });
    expect(next.elements.find((e) => e.planItemId === "b")!.bounds).toMatchObject({ x: 300 });
  });

  /**
   * Every moved element shifts by the same snapped offset. Snapping each independently
   * would change their relative positions, which is not what dragging a group means.
   */
  it("moves the whole selection by one shared offset", () => {
    const next = applyGesture(model, move(["a", "b"]), 47, 23);
    const a = next.elements.find((e) => e.planItemId === "a")!.bounds;
    const b = next.elements.find((e) => e.planItemId === "b")!.bounds;
    expect(a.x).toBe(150);
    expect(b.x).toBe(350);
    expect(b.x - a.x).toBe(200);
  });

  it("carries a stage's children along with it", () => {
    const nested: CmmnCase = {
      ...model,
      elements: [
        element("stage", 100, 100, { type: "stage" }),
        element("child", 120, 120, { parentId: "stage" }),
      ],
    };
    const next = applyGesture(
      nested,
      { ...move(["stage"]), planItemId: "stage" },
      50,
      0,
    );
    expect(next.elements.find((e) => e.planItemId === "child")!.bounds.x).toBe(170);
  });

  it("resizes only the element grabbed, never the selection", () => {
    const next = applyGesture(
      model,
      {
        kind: "resize",
        planItemId: "a",
        startX: 0,
        startY: 0,
        origin: { x: 100, y: 100, width: 100, height: 60 },
      },
      40,
      20,
    );
    expect(next.elements.find((e) => e.planItemId === "a")!.bounds).toMatchObject({
      width: 140,
      height: 80,
    });
    expect(next.elements.find((e) => e.planItemId === "b")!.bounds.width).toBe(100);
  });

  it("keeps a resized element above the minimum size", () => {
    const next = applyGesture(
      model,
      {
        kind: "resize",
        planItemId: "a",
        startX: 0,
        startY: 0,
        origin: { x: 100, y: 100, width: 100, height: 60 },
      },
      -500,
      -500,
    );
    const bounds = next.elements.find((e) => e.planItemId === "a")!.bounds;
    expect(bounds.width).toBeGreaterThanOrEqual(60);
    expect(bounds.height).toBeGreaterThanOrEqual(40);
  });
});
