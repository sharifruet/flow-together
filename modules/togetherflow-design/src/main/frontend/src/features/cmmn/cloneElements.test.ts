/**
 * Copy, paste and duplicate.
 *
 * The risk here is not that the shape fails to appear. It is that the copy is subtly wrong
 * in ways nobody sees until deployment or, worse, until runtime:
 *
 *  - `id` is `xsd:ID`, so a repeated one makes the whole document unparseable and the engine
 *    refuses it with a message about the schema rather than about the two elements involved;
 *  - a sentry copied along with a reference to the *original* turns the copy into a remote
 *    control for the thing it was copied from, which deploys perfectly and behaves absurdly;
 *  - a criterion left with no on-parts waits for nothing, so the item it guards is
 *    unreachable.
 *
 * All three are silent, so all three are pinned.
 */

import { describe, expect, it } from "vitest";

import {
  cloneElements,
  createElement,
  emptyCase,
  type CmmnCase,
  type CmmnElement,
  type CmmnElementType,
} from "./cmmnModel";

const NO_OFFSET = { x: 0, y: 0 };

function add(model: CmmnCase, type: CmmnElementType, parentId?: string): CmmnElement {
  const element = createElement(type, { x: 100, y: 100 }, parentId ?? model.planModelId);
  model.elements.push(element);
  return element;
}

describe("cloneElements", () => {
  it("gives every copy new ids", () => {
    const model = emptyCase("c", "C");
    const task = add(model, "humanTask");

    const [copy] = cloneElements(model, [task.planItemId], NO_OFFSET);

    expect(copy.planItemId).not.toBe(task.planItemId);
    expect(copy.definitionId).not.toBe(task.definitionId);
  });

  it("gives two copies of the same element different ids", () => {
    const model = emptyCase("c", "C");
    const task = add(model, "humanTask");

    const first = cloneElements(model, [task.planItemId], NO_OFFSET);
    const second = cloneElements(model, [task.planItemId], NO_OFFSET);

    expect(first[0].planItemId).not.toBe(second[0].planItemId);
    expect(first[0].definitionId).not.toBe(second[0].definitionId);
  });

  it("copies what is inside a stage, because a stage without its contents is a different shape", () => {
    const model = emptyCase("c", "C");
    const stage = add(model, "stage");
    add(model, "humanTask", stage.planItemId);
    add(model, "milestone", stage.planItemId);

    expect(cloneElements(model, [stage.planItemId], NO_OFFSET)).toHaveLength(3);
  });

  it("reparents a copied child onto the copied stage, not the original", () => {
    const model = emptyCase("c", "C");
    const stage = add(model, "stage");
    add(model, "humanTask", stage.planItemId);

    const copies = cloneElements(model, [stage.planItemId], NO_OFFSET);
    const copiedStage = copies.find((el) => el.type === "stage")!;
    const copiedChild = copies.find((el) => el.type === "humanTask")!;

    expect(copiedChild.parentId).toBe(copiedStage.planItemId);
    expect(copiedChild.parentId).not.toBe(stage.planItemId);
  });

  it("points a copied criterion at the copy, when its source came too", () => {
    const model = emptyCase("c", "C");
    const stage = add(model, "stage");
    const trigger = add(model, "humanTask", stage.planItemId);
    const guarded = add(model, "milestone", stage.planItemId);
    guarded.entrySentries = [
      { id: "s1", onParts: [{ sourceRef: trigger.planItemId, standardEvent: "complete" }] },
    ];

    const copies = cloneElements(model, [stage.planItemId], NO_OFFSET);
    const copiedTrigger = copies.find((el) => el.type === "humanTask")!;
    const copiedGuarded = copies.find((el) => el.type === "milestone")!;

    expect(copiedGuarded.entrySentries[0].onParts[0].sourceRef).toBe(copiedTrigger.planItemId);
  });

  it("drops a criterion whose source was left behind, rather than aiming it at the original", () => {
    const model = emptyCase("c", "C");
    const outside = add(model, "humanTask");
    const guarded = add(model, "milestone");
    guarded.entrySentries = [
      { id: "s1", onParts: [{ sourceRef: outside.planItemId, standardEvent: "complete" }] },
    ];

    const [copy] = cloneElements(model, [guarded.planItemId], NO_OFFSET);

    expect(copy.entrySentries).toEqual([]);
  });

  it("keeps a criterion that was guarding on a condition rather than an element", () => {
    const model = emptyCase("c", "C");
    const guarded = add(model, "milestone");
    guarded.entrySentries = [{ id: "s1", onParts: [], ifPart: "${ready}" }];

    const [copy] = cloneElements(model, [guarded.planItemId], NO_OFFSET);

    expect(copy.entrySentries).toHaveLength(1);
    expect(copy.entrySentries[0].id).not.toBe("s1");
  });

  it("gives copied criteria fresh ids too, since sentry ids are xsd:ID as well", () => {
    const model = emptyCase("c", "C");
    const stage = add(model, "stage");
    const trigger = add(model, "humanTask", stage.planItemId);
    const guarded = add(model, "milestone", stage.planItemId);
    guarded.entrySentries = [
      { id: "sentry_original", onParts: [{ sourceRef: trigger.planItemId, standardEvent: "complete" }] },
    ];

    const copies = cloneElements(model, [stage.planItemId], NO_OFFSET);
    const copied = copies.find((el) => el.type === "milestone")!;

    expect(copied.entrySentries[0].id).not.toBe("sentry_original");
  });

  it("rewires a copied timer's start trigger, and drops one pointing outside the copy", () => {
    const model = emptyCase("c", "C");
    const stage = add(model, "stage");
    const source = add(model, "humanTask", stage.planItemId);
    const timer = add(model, "timerEventListener", stage.planItemId);
    timer.timerStartTrigger = { sourceRef: source.planItemId, standardEvent: "complete" };

    const together = cloneElements(model, [stage.planItemId], NO_OFFSET);
    const copiedTimer = together.find((el) => el.type === "timerEventListener")!;
    const copiedSource = together.find((el) => el.type === "humanTask")!;
    expect(copiedTimer.timerStartTrigger?.sourceRef).toBe(copiedSource.planItemId);

    const alone = cloneElements(model, [timer.planItemId], NO_OFFSET);
    expect(alone[0].timerStartTrigger).toBeUndefined();
  });

  it("offsets the copies, so a paste does not land invisibly on the original", () => {
    const model = emptyCase("c", "C");
    const task = add(model, "humanTask");

    const [copy] = cloneElements(model, [task.planItemId], { x: 30, y: 30 });

    expect(copy.bounds.x).toBe(task.bounds.x + 30);
    expect(copy.bounds.y).toBe(task.bounds.y + 30);
  });

  it("copies the settings, not just the shape", () => {
    const model = emptyCase("c", "C");
    const task = add(model, "humanTask");
    task.name = "Approve";
    task.documentation = "Why";
    task.attributes = { assignee: "kermit" };
    task.itemControl = { required: { enabled: true } };

    const [copy] = cloneElements(model, [task.planItemId], NO_OFFSET);

    expect(copy.name).toBe("Approve");
    expect(copy.documentation).toBe("Why");
    expect(copy.attributes).toEqual({ assignee: "kermit" });
    expect(copy.itemControl).toEqual({ required: { enabled: true } });
  });

  it("copies nothing when nothing was asked for", () => {
    expect(cloneElements(emptyCase("c", "C"), [], NO_OFFSET)).toEqual([]);
  });
});
