/**
 * Positions for a case that arrived without a diagram.
 *
 * The bug this replaces is quiet: CMMNDI is optional, hand-written `.cmmn` files routinely
 * have none, and every element then landed on the same coordinate — one visible shape with
 * the rest hidden underneath, which reads as an empty case rather than an undrawn one.
 *
 * So what is pinned here is not "it ran" but "the result is legible": nothing overlaps,
 * children are inside their container, and a container is big enough to hold what is in it.
 * Those are checkable, and they are what a person actually notices.
 */

import { describe, expect, it } from "vitest";

import { autoLayout } from "./autoLayout";
import {
  createElement,
  emptyCase,
  parseCmmn,
  type Bounds,
  type CmmnCase,
  type CmmnElement,
  type CmmnElementType,
} from "./cmmnModel";

let counter = 0;

function add(model: CmmnCase, type: CmmnElementType, parentId?: string): CmmnElement {
  counter += 1;
  const element = createElement(type, { x: 0, y: 0 }, parentId ?? model.planModelId);
  element.planItemId = `pi_${counter}`;
  element.definitionId = `def_${counter}`;
  model.elements.push(element);
  return element;
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

/** `inner` sits wholly within `outer`. */
function encloses(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

describe("autoLayout", () => {
  it("leaves a case with no elements alone", () => {
    const empty = emptyCase("c", "C");
    expect(autoLayout(empty)).toBe(empty);
  });

  it("gives siblings positions that do not overlap", () => {
    const model = emptyCase("c", "C");
    for (let i = 0; i < 7; i += 1) add(model, "humanTask");

    const { elements } = autoLayout(model);

    for (let i = 0; i < elements.length; i += 1) {
      for (let j = i + 1; j < elements.length; j += 1) {
        expect(
          overlaps(elements[i].bounds, elements[j].bounds),
          `${elements[i].planItemId} overlaps ${elements[j].planItemId}`,
        ).toBe(false);
      }
    }
  });

  it("puts children inside their stage", () => {
    const model = emptyCase("c", "C");
    const stage = add(model, "stage");
    add(model, "humanTask", stage.planItemId);
    add(model, "humanTask", stage.planItemId);

    const out = autoLayout(model);
    const laidOutStage = out.elements.find((el) => el.type === "stage")!;
    const children = out.elements.filter((el) => el.parentId === stage.planItemId);

    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(encloses(laidOutStage.bounds, child.bounds), child.planItemId).toBe(true);
    }
  });

  it("grows a stage to hold what is in it", () => {
    const small = emptyCase("c", "C");
    const oneChild = add(small, "stage");
    add(small, "humanTask", oneChild.planItemId);

    const big = emptyCase("c", "C");
    const manyChildren = add(big, "stage");
    for (let i = 0; i < 6; i += 1) add(big, "humanTask", manyChildren.planItemId);

    const smallStage = autoLayout(small).elements.find((el) => el.type === "stage")!;
    const bigStage = autoLayout(big).elements.find((el) => el.type === "stage")!;

    expect(bigStage.bounds.height).toBeGreaterThan(smallStage.bounds.height);
  });

  it("nests two levels deep without escaping either container", () => {
    const model = emptyCase("c", "C");
    const outer = add(model, "stage");
    const inner = add(model, "stage", outer.planItemId);
    const leaf = add(model, "humanTask", inner.planItemId);

    const out = autoLayout(model);
    const byId = new Map(out.elements.map((el) => [el.planItemId, el.bounds]));

    expect(encloses(byId.get(outer.planItemId)!, byId.get(inner.planItemId)!)).toBe(true);
    expect(encloses(byId.get(inner.planItemId)!, byId.get(leaf.planItemId)!)).toBe(true);
  });

  it("keeps everything inside the case plan model", () => {
    const model = emptyCase("c", "C");
    const stage = add(model, "stage");
    add(model, "humanTask", stage.planItemId);
    add(model, "milestone");
    add(model, "timerEventListener");

    const out = autoLayout(model);
    const top = out.elements.filter((el) => el.parentId === out.planModelId);

    for (const element of top) {
      expect(encloses(out.planModelBounds, element.bounds), element.planItemId).toBe(true);
    }
  });

  it("is stable — laying out an already laid-out case changes nothing", () => {
    const model = emptyCase("c", "C");
    const stage = add(model, "stage");
    add(model, "humanTask", stage.planItemId);
    add(model, "humanTask");

    const once = autoLayout(model);
    expect(autoLayout(once).elements.map((el) => el.bounds)).toEqual(
      once.elements.map((el) => el.bounds),
    );
  });
});

describe("parseCmmn and missing diagram interchange", () => {
  const withoutDi = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL" xmlns:flowable="http://flowable.org/cmmn" targetNamespace="http://flowable.org/cmmn">
  <case id="c1" name="C">
    <casePlanModel id="pm" name="PM">
      <planItem id="pi1" name="One" definitionRef="t1" />
      <planItem id="pi2" name="Two" definitionRef="t2" />
      <planItem id="pi3" name="Three" definitionRef="t3" />
      <humanTask id="t1" name="One" />
      <humanTask id="t2" name="Two" />
      <humanTask id="t3" name="Three" />
    </casePlanModel>
  </case>
</definitions>`;

  it("lays out a case that has no CMMNDI at all", () => {
    const { elements } = parseCmmn(withoutDi);
    const positions = new Set(elements.map((el) => `${el.bounds.x},${el.bounds.y}`));

    // Before this, all three shared one coordinate: one shape visible, two underneath.
    expect(positions.size).toBe(3);
  });

  it("does not move elements in a case that was drawn", () => {
    const withDi = withoutDi.replace(
      "</definitions>",
      `  <cmmndi:CMMNDI xmlns:cmmndi="http://www.omg.org/spec/CMMN/20151109/CMMNDI" xmlns:dc="http://www.omg.org/spec/CMMN/20151109/DC">
    <cmmndi:CMMNDiagram id="d1">
      <cmmndi:CMMNShape id="s1" cmmnElementRef="pi1"><dc:Bounds x="500" y="600" width="100" height="60" /></cmmndi:CMMNShape>
    </cmmndi:CMMNDiagram>
  </cmmndi:CMMNDI>
</definitions>`,
    );
    const placed = parseCmmn(withDi).elements.find((el) => el.planItemId === "pi1");

    expect(placed?.bounds).toEqual({ x: 500, y: 600, width: 100, height: 60 });
  });
});
