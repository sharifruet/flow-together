/**
 * Round-trip fidelity for CMMN (REQUIREMENTS.md §7.4.3).
 *
 * Unlike the BPMN editor, which round-trips through bpmn-js and moddle, this one has a
 * hand-written parser and a serialiser that rebuilds the document from a narrow model.
 * That design deletes anything the model does not represent — silently, on the first
 * save. Before this file existed, opening `stageAfterTimer.cmmn` and saving it removed the
 * timer's `<timerExpression>`, every `<CMMNEdge>`, and `flowable:initiatorVariableName`.
 *
 * These tests run against the repository's own CMMN files rather than fixtures written to
 * pass, because the failure mode is "something real was here and is now gone".
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCmmn, removeElement, serialiseCmmn } from "./cmmnModel";

const REPO = resolve(__dirname, "../../../../../../../..");

const FILES = [
  "examples/employee-onboarding.cmmn",
  "modules/flowable-spring-boot/flowable-spring-boot-samples/flowable-spring-boot-sample-starter/src/main/resources/stageAfterTimer.cmmn",
  "modules/flowable-app-rest/src/test/resources/caseWithProcessTask.cmmn",
  "modules/flowable-app-rest/src/test/resources/oneHumanTaskCase.cmmn",
];

function read(path: string): string {
  return readFileSync(resolve(REPO, path), "utf8");
}

/** Element local names present in a document, ignoring order and repetition. */
function elementNames(xml: string): Set<string> {
  return new Set([...xml.matchAll(/<(?:\w+:)?([A-Za-z][\w]*)[\s/>]/g)].map((m) => m[1]));
}

function attributeNames(xml: string): Set<string> {
  return new Set([...xml.matchAll(/\s([a-zA-Z][\w:]*)=/g)].map((m) => m[1]));
}

describe.each(FILES)("round trip: %s", (path) => {
  const before = read(path);
  const after = serialiseCmmn(parseCmmn(before));

  it("keeps every kind of element the file had", () => {
    const lost = [...elementNames(before)].filter((name) => !elementNames(after).has(name));
    expect(lost, `elements deleted by a save: ${lost.join(", ")}`).toEqual([]);
  });

  it("keeps every attribute the file had", () => {
    const lost = [...attributeNames(before)].filter((name) => !attributeNames(after).has(name));
    expect(lost, `attributes deleted by a save: ${lost.join(", ")}`).toEqual([]);
  });

  it("stays parseable by its own parser", () => {
    // A serialiser that emits something it cannot read back is a one-way door.
    expect(() => parseCmmn(after)).not.toThrow();
  });

  it("is stable — a second save changes nothing", () => {
    /*
     * The first save may reformat. The second must not differ, or every save produces a
     * diff and nobody can see the real change in a review.
     */
    expect(serialiseCmmn(parseCmmn(after))).toBe(after);
  });
});

describe("task references", () => {
  const source = read("modules/flowable-app-rest/src/test/resources/caseWithProcessTask.cmmn");

  it("writes processRef unprefixed, which is the only form the engine reads", () => {
    const after = serialiseCmmn(parseCmmn(source));

    /*
     * `ProcessTaskXmlConverter` reads it as `getAttributeValue(null, "processRef")` — a
     * null namespace. A `flowable:processRef` is an attribute the engine never looks at,
     * so every process task this editor produced used to have no target at all.
     */
    expect(after).toContain('processRef="oneTaskProcess"');
    expect(after).not.toContain("flowable:processRef");
  });

  it("survives a round trip through the model", () => {
    const task = parseCmmn(source).elements.find((el) => el.type === "processTask");
    expect(task?.plainAttributes.processRef).toBe("oneTaskProcess");
  });
});

describe("item control rules", () => {
  const WITH_CONTROL = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL"
             xmlns:flowable="http://flowable.org/cmmn"
             targetNamespace="http://flowable.org/cmmn">
  <case id="c" name="C">
    <casePlanModel id="plan" name="Plan" autoComplete="true">
      <planItem id="pi1" definitionRef="t1">
        <itemControl>
          <requiredRule />
          <repetitionRule flowable:counterVariable="loops">
            <condition><![CDATA[\${again}]]></condition>
          </repetitionRule>
        </itemControl>
      </planItem>
      <humanTask id="t1" name="Review" isBlocking="true" flowable:assignee="kermit" />
    </casePlanModel>
  </case>
</definitions>`;

  it("reads presence and condition apart, as CMMN models them", () => {
    const item = parseCmmn(WITH_CONTROL).elements[0];

    // A bare `<requiredRule/>` is "always required"; the condition is a separate question.
    expect(item.itemControl?.required).toEqual({ enabled: true, condition: undefined });
    expect(item.itemControl?.repetition).toEqual({ enabled: true, condition: "${again}" });
    expect(item.itemControl?.repetitionAttributes).toEqual({ counterVariable: "loops" });
  });

  it("round-trips the rules and the stage's autoComplete", () => {
    const after = serialiseCmmn(parseCmmn(WITH_CONTROL));

    expect(after).toContain("<requiredRule />");
    expect(after).toContain('flowable:counterVariable="loops"');
    // Plain attribute: the engine reads autoComplete with a null namespace.
    expect(after).toContain('autoComplete="true"');
    expect(after).not.toContain("flowable:autoComplete");

    const reparsed = parseCmmn(after).elements[0];
    expect(reparsed.itemControl).toEqual(parseCmmn(WITH_CONTROL).elements[0].itemControl);
  });

  it("writes no itemControl at all when every rule is off", () => {
    const model = parseCmmn(WITH_CONTROL);
    model.elements[0].itemControl = undefined;
    expect(serialiseCmmn(model)).not.toContain("itemControl");
  });

  it("emits the rules in the order the schema declares", () => {
    const model = parseCmmn(WITH_CONTROL);
    model.elements[0].itemControl = {
      required: { enabled: true },
      repetition: { enabled: true },
      manualActivation: { enabled: true },
    };
    const after = serialiseCmmn(model);

    /*
     * `tPlanItemControl` is a sequence: repetition, required, manualActivation. Any other
     * order fails deployment with "Invalid content was found starting with element
     * repetitionRule" — the schema is checked before the model is ever parsed.
     */
    expect(after.indexOf("<repetitionRule")).toBeLessThan(after.indexOf("<requiredRule"));
    expect(after.indexOf("<requiredRule")).toBeLessThan(after.indexOf("<manualActivationRule"));
  });

  it("never invents a completionNeutralRule, which no CMMN schema allows", () => {
    // Flowable parses it, but deployment validates against the schema first, so a case
    // carrying one cannot be deployed at all.
    const model = parseCmmn(WITH_CONTROL);
    model.elements[0].itemControl = { required: { enabled: true } };
    expect(serialiseCmmn(model)).not.toContain("completionNeutralRule");
  });

  it("puts itemControl before the criteria, which the schema requires", () => {
    const model = parseCmmn(WITH_CONTROL);
    model.elements[0].entrySentries = [{ id: "s1", onParts: [], ifPart: "${ok}" }];
    const after = serialiseCmmn(model);
    // The other order deploys as "Invalid content was found starting with element itemControl".
    expect(after.indexOf("<itemControl>")).toBeLessThan(after.indexOf("<entryCriterion"));
  });
});

describe("field extensions", () => {
  const WITH_FIELDS = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL"
             xmlns:flowable="http://flowable.org/cmmn"
             targetNamespace="http://flowable.org/cmmn">
  <case id="c" name="C">
    <casePlanModel id="plan" name="Plan">
      <planItem id="pi1" definitionRef="t1" />
      <task id="t1" name="Call" isBlocking="true" flowable:type="http">
        <extensionElements>
          <flowable:field name="requestMethod" stringValue="GET" />
          <flowable:field name="requestUrl" expression="\${url}" />
          <flowable:field name="requestBody"><flowable:string>hello</flowable:string></flowable:field>
          <flowable:field name="other"><flowable:expression>\${x}</flowable:expression></flowable:field>
          <flowable:planItemLifecycleListener sourceState="available" targetState="active" class="com.acme.L" />
        </extensionElements>
      </task>
    </casePlanModel>
  </case>
</definitions>`;

  it("reads all four value forms the engine accepts", () => {
    const fields = parseCmmn(WITH_FIELDS).elements[0].fields;
    expect(fields).toEqual([
      { name: "requestMethod", valueKind: "stringValue", value: "GET" },
      { name: "requestUrl", valueKind: "expression", value: "${url}" },
      { name: "requestBody", valueKind: "string", value: "hello" },
      { name: "other", valueKind: "expressionElement", value: "${x}" },
    ]);
  });

  it("keeps each field in the form it arrived in", () => {
    // Rewriting an attribute-valued field as an element (or the reverse) would churn the
    // diff on every save without changing what the engine does.
    const after = serialiseCmmn(parseCmmn(WITH_FIELDS));
    expect(after).toContain('name="requestMethod" stringValue="GET"');
    expect(after).toContain('name="requestUrl" expression="${url}"');
    expect(after).toContain("<flowable:string><![CDATA[hello]]></flowable:string>");
    expect(after).toContain("<flowable:expression><![CDATA[${x}]]></flowable:expression>");
  });

  it("keeps a lifecycle listener it cannot edit", () => {
    // Not modelled, so it is carried through — losing it would be the round-trip bug
    // this whole pass exists to prevent.
    expect(serialiseCmmn(parseCmmn(WITH_FIELDS))).toContain("planItemLifecycleListener");
  });

  it("drops a field with no name, which nothing could bind to", () => {
    const model = parseCmmn(WITH_FIELDS);
    model.elements[0].fields = [{ name: "  ", valueKind: "stringValue", value: "orphan" }];
    model.elements[0].extraExtensionChildren = [];
    expect(serialiseCmmn(model)).not.toContain("orphan");
  });
});

describe("exit criteria", () => {
  it("round-trips flowable:exitType", () => {
    const model = parseCmmn(`<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL"
             xmlns:flowable="http://flowable.org/cmmn" targetNamespace="http://flowable.org/cmmn">
  <case id="c" name="C"><casePlanModel id="plan" name="Plan">
    <planItem id="pi1" definitionRef="t1">
      <exitCriterion id="ex1" sentryRef="s1" flowable:exitType="activeInstances" />
    </planItem>
    <sentry id="s1" />
    <humanTask id="t1" name="T" isBlocking="true" />
  </casePlanModel></case>
</definitions>`);

    expect(model.elements[0].exitSentries[0].exitType).toBe("activeInstances");
    expect(serialiseCmmn(model)).toContain('flowable:exitType="activeInstances"');
  });
});

describe("sentries with several triggers", () => {
  const AND_SENTRY = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL"
             xmlns:flowable="http://flowable.org/cmmn" targetNamespace="http://flowable.org/cmmn">
  <case id="c" name="C"><casePlanModel id="plan" name="Plan">
    <planItem id="piA" definitionRef="a" />
    <planItem id="piB" definitionRef="b" />
    <planItem id="piC" definitionRef="cTask">
      <entryCriterion id="e1" sentryRef="s1" />
    </planItem>
    <sentry id="s1">
      <planItemOnPart id="op1" sourceRef="piA"><standardEvent>complete</standardEvent></planItemOnPart>
      <planItemOnPart id="op2" sourceRef="piB"><standardEvent>complete</standardEvent></planItemOnPart>
      <ifPart><condition><![CDATA[\${ok}]]></condition></ifPart>
    </sentry>
    <humanTask id="a" name="A" isBlocking="true" />
    <humanTask id="b" name="B" isBlocking="true" />
    <humanTask id="cTask" name="C" isBlocking="true" />
  </casePlanModel></case>
</definitions>`;

  it("keeps every trigger, not just the first", () => {
    const criterion = parseCmmn(AND_SENTRY).elements[2].entrySentries[0];

    // Two on-parts mean "when A completes AND B completes". Reading one dropped the other
    // and silently changed what the case waits for.
    expect(criterion.onParts).toEqual([
      { sourceRef: "piA", standardEvent: "complete" },
      { sourceRef: "piB", standardEvent: "complete" },
    ]);
    expect(criterion.ifPart).toBe("${ok}");
  });

  it("round-trips both, in schema order", () => {
    const after = serialiseCmmn(parseCmmn(AND_SENTRY));
    expect((after.match(/<planItemOnPart/g) ?? [])).toHaveLength(2);
    // `onPart` precedes `ifPart` in tSentry.
    expect(after.indexOf("<planItemOnPart")).toBeLessThan(after.indexOf("<ifPart>"));
  });

  it("drops only the trigger whose source was deleted", () => {
    const model = parseCmmn(AND_SENTRY);
    const pruned = removeElement(model, "piA");
    const criterion = pruned.elements.find((e) => e.planItemId === "piC")!.entrySentries[0];

    // Removing the whole criterion would discard the wait on B that is still valid.
    expect(criterion.onParts).toEqual([{ sourceRef: "piB", standardEvent: "complete" }]);
  });
});

describe("lifecycle listeners", () => {
  const WITH_LISTENER = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL"
             xmlns:flowable="http://flowable.org/cmmn" targetNamespace="http://flowable.org/cmmn">
  <case id="c" name="C"><casePlanModel id="plan" name="Plan">
    <planItem id="pi1" definitionRef="t1" />
    <humanTask id="t1" name="T" isBlocking="true">
      <extensionElements>
        <flowable:planItemLifecycleListener sourceState="available" targetState="active" class="com.acme.L" />
        <flowable:planItemLifecycleListener targetState="completed" delegateExpression="\${bean}" />
      </extensionElements>
    </humanTask>
  </casePlanModel></case>
</definitions>`;

  it("reads both bounds and whichever implementation was used", () => {
    expect(parseCmmn(WITH_LISTENER).elements[0].lifecycleListeners).toEqual([
      { sourceState: "available", targetState: "active", implementationType: "class", value: "com.acme.L" },
      // An absent sourceState means "from any state" and must stay absent, not become "".
      { sourceState: "", targetState: "completed", implementationType: "delegateExpression", value: "${bean}" },
    ]);
  });

  it("omits an unset state rather than writing an empty one", () => {
    const after = serialiseCmmn(parseCmmn(WITH_LISTENER));
    expect(after).toContain('sourceState="available" targetState="active" class="com.acme.L"');
    expect(after).not.toContain('sourceState=""');
  });
});

describe("generic event listener", () => {
  it("serialises to <eventListener>, the only form the schema allows", () => {
    const model = parseCmmn(`<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL"
             xmlns:flowable="http://flowable.org/cmmn" targetNamespace="http://flowable.org/cmmn">
  <case id="c" name="C"><casePlanModel id="plan" name="Plan">
    <planItem id="pi1" definitionRef="el1" />
    <eventListener id="el1" name="Wait" />
  </casePlanModel></case>
</definitions>`);

    expect(model.elements[0].type).toBe("genericEventListener");
    const after = serialiseCmmn(model);
    expect(after).toContain("<eventListener ");
    // `genericEventListener` is the model's name for it, not the XML's.
    expect(after).not.toContain("<genericEventListener");
  });
});

/*
 * Per-element `<documentation>`. It used to survive only by falling into `extraChildren`,
 * which round-tripped it but gave the panel nothing to bind to — so a case ended up using
 * task names to say what documentation should have said. Now it is modelled, and the thing
 * that has to hold is its *position*: `tCmmnElement`'s sequence puts it before
 * `extensionElements`, and the wrong order parses fine and fails the schema.
 */
describe("documentation on a plan item definition", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL" xmlns:flowable="http://flowable.org/cmmn" targetNamespace="http://flowable.org/cmmn">
  <case id="c1" name="C">
    <casePlanModel id="pm" name="PM">
      <planItem id="pi1" name="T" definitionRef="ht1" />
      <humanTask id="ht1" name="T" flowable:assignee="kermit">
        <documentation>Why this task exists.</documentation>
        <extensionElements>
          <flowable:field name="note"><flowable:string><![CDATA[hi]]></flowable:string></flowable:field>
        </extensionElements>
      </humanTask>
    </casePlanModel>
  </case>
</definitions>`;

  it("reads it onto the element rather than into the preserved children", () => {
    const [task] = parseCmmn(source).elements;

    expect(task.documentation).toBe("Why this task exists.");
    expect(task.extraChildren.join("")).not.toContain("documentation");
  });

  it("writes it exactly once", () => {
    const after = serialiseCmmn(parseCmmn(source));

    expect(after.match(/<documentation>/g)).toHaveLength(1);
    expect(after).toContain("Why this task exists.");
  });

  it("writes it before extensionElements, which is where the schema puts it", () => {
    const after = serialiseCmmn(parseCmmn(source));

    expect(after.indexOf("<documentation>")).toBeLessThan(after.indexOf("<extensionElements>"));
  });

  /*
   * `firstByLocalName` searches descendants, so reading the case's own documentation with
   * it handed back the first *task's* instead — and a stage would have taken its first
   * child task's. Both now use a direct-child lookup.
   */
  it("does not let a task's documentation become the case's", () => {
    const model = parseCmmn(source);

    expect(model.documentation).toBeUndefined();
    expect(model.elements[0].documentation).toBe("Why this task exists.");
  });

  it("does not let a task's documentation become its stage's", () => {
    const nested = source.replace(
      '<planItem id="pi1" name="T" definitionRef="ht1" />',
      '<planItem id="pis" name="S" definitionRef="st1" />',
    ).replace(
      '<humanTask id="ht1"',
      `<stage id="st1" name="S">
        <planItem id="pi1" name="T" definitionRef="ht1" />
        <humanTask id="ht1"`,
    ).replace("</humanTask>", "</humanTask>\n      </stage>");

    const byId = new Map(parseCmmn(nested).elements.map((el) => [el.definitionId, el]));

    expect(byId.get("st1")?.documentation).toBeUndefined();
    expect(byId.get("ht1")?.documentation).toBe("Why this task exists.");
  });

  it("omits the element entirely when there is nothing to say", () => {
    const model = parseCmmn(source);
    const stripped = {
      ...model,
      elements: model.elements.map((el) => ({ ...el, documentation: "   " })),
    };

    expect(serialiseCmmn(stripped)).not.toContain("<documentation>");
  });
});

/*
 * `flowable:exitEventType` decides whether the stage an exit criterion fires on ends as
 * terminated or as completed — the difference between a case that reads as finished and one
 * that reads as abandoned. Round-tripped before it was authorable; now it is set from the
 * panel, so both directions matter.
 */
describe("exitEventType on an exit criterion", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL" xmlns:flowable="http://flowable.org/cmmn" targetNamespace="http://flowable.org/cmmn">
  <case id="c1" name="C">
    <casePlanModel id="pm" name="PM">
      <planItem id="pi1" name="T" definitionRef="ht1">
        <exitCriterion id="ec1" sentryRef="s1" flowable:exitType="activeInstances" flowable:exitEventType="forceComplete" />
      </planItem>
      <sentry id="s1">
        <planItemOnPart id="op1" sourceRef="pi1"><standardEvent>complete</standardEvent></planItemOnPart>
      </sentry>
      <humanTask id="ht1" name="T" />
    </casePlanModel>
  </case>
</definitions>`;

  it("reads it onto the criterion", () => {
    const [task] = parseCmmn(source).elements;

    expect(task.exitSentries[0].exitEventType).toBe("forceComplete");
    expect(task.exitSentries[0].exitType).toBe("activeInstances");
  });

  it("writes it back beside exitType", () => {
    const after = serialiseCmmn(parseCmmn(source));

    expect(after).toContain('flowable:exitEventType="forceComplete"');
    expect(after).toContain('flowable:exitType="activeInstances"');
  });

  it("omits it when unset, rather than writing the default out", () => {
    const model = parseCmmn(source);
    const cleared = {
      ...model,
      elements: model.elements.map((el) => ({
        ...el,
        exitSentries: el.exitSentries.map((s) => ({ ...s, exitEventType: undefined })),
      })),
    };

    expect(serialiseCmmn(cleared)).not.toContain("exitEventType");
  });
});
