import { describe, expect, it } from "vitest";
import {
  containerAt,
  createElement,
  emptyCase,
  parseCmmn,
  removeElement,
  serialiseCmmn,
  type CmmnCase,
} from "./cmmnModel";

/** The engine's own example file — ground truth for the format. */
const ENGINE_EXAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL"
             xmlns:flowable="http://flowable.org/cmmn"
             xmlns:cmmndi="http://www.omg.org/spec/CMMN/20151109/CMMNDI"
             xmlns:dc="http://www.omg.org/spec/CMMN/20151109/DC"
             targetNamespace="http://flowable.org/cmmn">
  <case id="employeeOnboarding" name="Employee Onboarding">
    <documentation>Two onboarding tasks.</documentation>
    <casePlanModel id="onboardingPlan" name="Onboarding">
      <planItem id="planItemPrepareLaptop" name="Prepare laptop" definitionRef="prepareLaptop"/>
      <planItem id="planItemAssignBuddy" name="Assign buddy" definitionRef="assignBuddy"/>
      <humanTask id="prepareLaptop" name="Prepare laptop" isBlocking="true" flowable:assignee="admin"/>
      <humanTask id="assignBuddy" name="Assign buddy" isBlocking="true" flowable:assignee="admin"/>
    </casePlanModel>
  </case>
  <cmmndi:CMMNDI>
    <cmmndi:CMMNDiagram id="CMMNDiagram_employeeOnboarding">
      <cmmndi:CMMNShape id="shape_onboardingPlan" cmmnElementRef="onboardingPlan">
        <dc:Bounds x="80" y="60" width="520" height="240"/>
      </cmmndi:CMMNShape>
      <cmmndi:CMMNShape id="shape_planItemPrepareLaptop" cmmnElementRef="planItemPrepareLaptop">
        <dc:Bounds x="140" y="130" width="140" height="80"/>
      </cmmndi:CMMNShape>
      <cmmndi:CMMNShape id="shape_planItemAssignBuddy" cmmnElementRef="planItemAssignBuddy">
        <dc:Bounds x="360" y="130" width="140" height="80"/>
      </cmmndi:CMMNShape>
    </cmmndi:CMMNDiagram>
  </cmmndi:CMMNDI>
</definitions>`;

describe("parseCmmn", () => {
  it("reads the engine's own example", () => {
    const model = parseCmmn(ENGINE_EXAMPLE);

    expect(model.caseId).toBe("employeeOnboarding");
    expect(model.caseName).toBe("Employee Onboarding");
    expect(model.planModelId).toBe("onboardingPlan");
    expect(model.planModelBounds).toEqual({ x: 80, y: 60, width: 520, height: 240 });
    expect(model.elements).toHaveLength(2);
  });

  it("pairs each plan item with the definition it references", () => {
    const [first] = parseCmmn(ENGINE_EXAMPLE).elements;
    expect(first.planItemId).toBe("planItemPrepareLaptop");
    expect(first.definitionId).toBe("prepareLaptop");
    expect(first.type).toBe("humanTask");
    expect(first.name).toBe("Prepare laptop");
  });

  it("reads flowable attributes and layout", () => {
    const [first] = parseCmmn(ENGINE_EXAMPLE).elements;
    expect(first.attributes.assignee).toBe("admin");
    // Shapes reference the plan item id, not the definition id.
    expect(first.bounds).toEqual({ x: 140, y: 130, width: 140, height: 80 });
  });

  it("rejects XML that is not a case model, with a usable message", () => {
    expect(() => parseCmmn("<definitions/>")).toThrow(/not a CMMN model/i);
    expect(() => parseCmmn("<not xml")).toThrow(/not valid XML/i);
  });
});

describe("serialiseCmmn", () => {
  it("round-trips the engine example without losing anything the editor models", () => {
    const original = parseCmmn(ENGINE_EXAMPLE);
    const reparsed = parseCmmn(serialiseCmmn(original));

    expect(reparsed.caseId).toBe(original.caseId);
    expect(reparsed.planModelBounds).toEqual(original.planModelBounds);
    expect(reparsed.elements.map((e) => e.definitionId)).toEqual(
      original.elements.map((e) => e.definitionId),
    );
    expect(reparsed.elements[0].attributes.assignee).toBe("admin");
    expect(reparsed.elements[0].bounds).toEqual(original.elements[0].bounds);
  });

  it("emits the namespaces and structure the engine requires", () => {
    const xml = serialiseCmmn(parseCmmn(ENGINE_EXAMPLE));
    expect(xml).toContain('xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL"');
    expect(xml).toContain('xmlns:flowable="http://flowable.org/cmmn"');
    expect(xml).toContain("<casePlanModel");
    // A definition must be accompanied by a plan item, or it is unreachable.
    expect(xml).toContain('<planItem id="planItemPrepareLaptop"');
    expect(xml).toContain('<humanTask id="prepareLaptop"');
    // Shapes must reference plan items.
    expect(xml).toContain('cmmnElementRef="planItemPrepareLaptop"');
  });

  it("escapes values that would otherwise break the XML", () => {
    const model = emptyCase("c1", 'Fish & "chips" <today>');
    const xml = serialiseCmmn(model);
    expect(xml).toContain("Fish &amp; &quot;chips&quot; &lt;today&gt;");
    expect(() => parseCmmn(xml)).not.toThrow();
  });

  it("nests a stage's children inside it", () => {
    let model = emptyCase("c1", "Case");
    const stage = createElement("stage", { x: 100, y: 100 }, model.planModelId);
    const task = createElement("humanTask", { x: 120, y: 140 }, stage.planItemId);
    model = { ...model, elements: [stage, task] };

    const xml = serialiseCmmn(model);
    const stageStart = xml.indexOf("<stage");
    const stageEnd = xml.indexOf("</stage>");
    const taskAt = xml.indexOf(`<humanTask id="${task.definitionId}"`);
    expect(taskAt).toBeGreaterThan(stageStart);
    expect(taskAt).toBeLessThan(stageEnd);

    // And it survives a round trip with its parent intact.
    const reparsed = parseCmmn(xml);
    const reparsedTask = reparsed.elements.find((el) => el.definitionId === task.definitionId);
    expect(reparsedTask?.parentId).toBe(stage.planItemId);
  });

  it("writes entry criteria as a criterion plus a sentry", () => {
    let model = emptyCase("c1", "Case");
    const first = createElement("humanTask", { x: 100, y: 100 }, model.planModelId);
    const second = createElement("humanTask", { x: 300, y: 100 }, model.planModelId);
    second.entrySentries = [{ id: "crit1", sourceRef: first.planItemId, standardEvent: "complete" }];
    model = { ...model, elements: [first, second] };

    const xml = serialiseCmmn(model);
    expect(xml).toContain('<entryCriterion id="crit1" sentryRef="sentry_crit1"');
    expect(xml).toContain('<sentry id="sentry_crit1">');
    expect(xml).toContain(`sourceRef="${first.planItemId}"`);
    expect(xml).toContain("<standardEvent>complete</standardEvent>");
    expect(parseCmmn(xml).elements[1].entrySentries[0].sourceRef).toBe(first.planItemId);
  });

  it("produces a parseable document for an empty case", () => {
    const xml = serialiseCmmn(emptyCase("newCase", "New case"));
    const reparsed = parseCmmn(xml);
    expect(reparsed.caseId).toBe("newCase");
    expect(reparsed.elements).toHaveLength(0);
  });
});

describe("removeElement", () => {
  function nested(): CmmnCase {
    const base = emptyCase("c1", "Case");
    const stage = createElement("stage", { x: 100, y: 100 }, base.planModelId);
    const child = createElement("humanTask", { x: 120, y: 140 }, stage.planItemId);
    const other = createElement("humanTask", { x: 400, y: 100 }, base.planModelId);
    other.entrySentries = [{ id: "c1", sourceRef: child.planItemId, standardEvent: "complete" }];
    return { ...base, elements: [stage, child, other] };
  }

  it("takes a stage's children with it", () => {
    const model = nested();
    const after = removeElement(model, model.elements[0].planItemId);
    expect(after.elements.map((e) => e.type)).toEqual(["humanTask"]);
  });

  it("drops sentries that pointed at a deleted element, avoiding a dangling ref", () => {
    const model = nested();
    const after = removeElement(model, model.elements[0].planItemId);
    expect(after.elements[0].entrySentries).toHaveLength(0);
  });

  it("leaves unrelated elements alone", () => {
    const model = nested();
    const after = removeElement(model, model.elements[2].planItemId);
    expect(after.elements).toHaveLength(2);
  });
});

describe("containerAt", () => {
  it("returns the innermost stage containing a point", () => {
    const base = emptyCase("c1", "Case");
    const outer = createElement("stage", { x: 100, y: 100 }, base.planModelId);
    outer.bounds = { x: 100, y: 100, width: 400, height: 300 };
    const inner = createElement("stage", { x: 150, y: 150 }, outer.planItemId);
    inner.bounds = { x: 150, y: 150, width: 150, height: 120 };
    const model = { ...base, elements: [outer, inner] };

    expect(containerAt(model, { x: 200, y: 200 })).toBe(inner.planItemId);
    expect(containerAt(model, { x: 450, y: 350 })).toBe(outer.planItemId);
    expect(containerAt(model, { x: 900, y: 900 })).toBe(model.planModelId);
  });

  it("ignores the element being dragged, so a stage cannot become its own parent", () => {
    const base = emptyCase("c1", "Case");
    const stage = createElement("stage", { x: 100, y: 100 }, base.planModelId);
    stage.bounds = { x: 100, y: 100, width: 400, height: 300 };
    const model = { ...base, elements: [stage] };

    expect(containerAt(model, { x: 200, y: 200 }, stage.planItemId)).toBe(model.planModelId);
  });
});

/**
 * Schema constraints the engine enforces but a round trip through this file's own
 * parser does not. Both were found by deploying to a running engine; before the fix
 * every test above passed while the output was undeployable.
 */
describe("engine schema conformance", () => {
  function sample() {
    const m = emptyCase("c1", "Case");
    const t1 = createElement("humanTask", { x: 100, y: 100 }, m.planModelId);
    const t2 = createElement("humanTask", { x: 300, y: 100 }, m.planModelId);
    t2.entrySentries = [{ id: "crit1", sourceRef: t1.planItemId, standardEvent: "complete" }];
    const stage = createElement("stage", { x: 100, y: 260 }, m.planModelId);
    const nested = createElement("humanTask", { x: 130, y: 300 }, stage.planItemId);
    return { ...m, elements: [t1, t2, stage, nested] };
  }

  it("emits every planItem before any definition, as the XSD sequence requires", () => {
    // Scoped to the case plan model's own body — a nested stage legitimately contains
    // further plan items after the top-level definitions begin.
    const xml = serialiseCmmn(sample());
    const body = xml.slice(xml.indexOf("<casePlanModel"), xml.indexOf("<stage "));
    const lastPlanItem = body.lastIndexOf("<planItem ");
    const firstDefinition = body.indexOf("<humanTask ");
    // Interleaving is rejected with "Invalid content was found starting with element planItem".
    expect(firstDefinition).toBeGreaterThan(-1);
    expect(lastPlanItem).toBeLessThan(firstDefinition);
  });

  it("emits sentries after the plan items and before the definitions", () => {
    const xml = serialiseCmmn(sample());
    expect(xml.indexOf("<sentry ")).toBeGreaterThan(xml.indexOf("<planItem "));
    expect(xml.indexOf("<sentry ")).toBeLessThan(xml.indexOf("<humanTask "));
  });

  it("applies the same ordering inside a nested stage", () => {
    const xml = serialiseCmmn(sample());
    const stageBody = xml.slice(xml.indexOf("<stage "), xml.indexOf("</stage>"));
    expect(stageBody.lastIndexOf("<planItem ")).toBeLessThan(stageBody.indexOf("<humanTask "));
  });

  it("gives every shape a CMMNLabel, which the DI schema makes mandatory", () => {
    const xml = serialiseCmmn(sample());
    const shapes = xml.match(/<cmmndi:CMMNShape/g)?.length ?? 0;
    const labels = xml.match(/<cmmndi:CMMNLabel/g)?.length ?? 0;
    // Omitting it fails deployment: "content of element cmmndi:CMMNShape is not complete".
    expect(shapes).toBeGreaterThan(0);
    expect(labels).toBe(shapes);
  });
});
