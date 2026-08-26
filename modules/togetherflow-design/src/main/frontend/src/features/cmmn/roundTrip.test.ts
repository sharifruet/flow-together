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
import { createElement, emptyCase, parseCmmn, removeElement, serialiseCmmn } from "./cmmnModel";

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

/*
 * The typed tasks and listeners.
 *
 * None of these is its own element: Flowable's specialised tasks are all `<task>` with a
 * `flowable:type`, and its typed listeners all `<eventListener>` with a
 * `flowable:eventType`. So the thing that has to hold is that the discriminator survives in
 * both directions and appears exactly once — it is derived from the element's type on the
 * way out and stripped from the attribute map on the way in, precisely so the two cannot
 * drift and produce a task that draws as one kind and deploys as another.
 */
describe("typed tasks and listeners", () => {
  const cases: Array<[string, string, string]> = [
    ["scriptTask", "task", 'flowable:type="script"'],
    ["httpTask", "task", 'flowable:type="http"'],
    ["mailTask", "task", 'flowable:type="mail"'],
    ["externalWorkerTask", "task", 'flowable:type="external-worker"'],
    ["casePageTask", "task", 'flowable:type="casePage"'],
    ["sendEventTask", "task", 'flowable:type="send-event"'],
    ["signalEventListener", "eventListener", 'flowable:eventType="signal"'],
    ["variableEventListener", "eventListener", 'flowable:eventType="variable"'],
    ["intentEventListener", "eventListener", 'flowable:eventType="intent"'],
    ["reactivateEventListener", "eventListener", 'flowable:eventType="reactivate"'],
  ];

  it.each(cases)("%s writes <%s> carrying %s", (type, tag, discriminator) => {
    const base = emptyCase("c", "C");
    const element = createElement(type as never, { x: 100, y: 100 }, base.planModelId);
    const xml = serialiseCmmn({ ...base, elements: [element] });

    expect(xml).toContain(`<${tag} `);
    expect(xml).toContain(discriminator);
    expect(xml.match(new RegExp(discriminator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")))
      .toHaveLength(1);
  });

  it.each(cases)("%s is read back as itself", (type) => {
    const base = emptyCase("c", "C");
    const element = createElement(type as never, { x: 100, y: 100 }, base.planModelId);
    const [parsed] = parseCmmn(serialiseCmmn({ ...base, elements: [element] })).elements;

    expect(parsed.type).toBe(type);
  });

  it("keeps the discriminator out of the attribute map, so it cannot be edited into a lie", () => {
    const base = emptyCase("c", "C");
    const element = createElement("scriptTask", { x: 100, y: 100 }, base.planModelId);
    const [parsed] = parseCmmn(serialiseCmmn({ ...base, elements: [element] })).elements;

    expect(parsed.attributes.type).toBeUndefined();
  });

  it("still reads a plain <task> as a service task, and <eventListener> as the generic one", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL" xmlns:flowable="http://flowable.org/cmmn" targetNamespace="http://flowable.org/cmmn">
  <case id="c1" name="C">
    <casePlanModel id="pm" name="PM">
      <planItem id="pi1" name="T" definitionRef="t1" />
      <planItem id="pi2" name="L" definitionRef="l1" />
      <task id="t1" name="T" />
      <eventListener id="l1" name="L" />
    </casePlanModel>
  </case>
</definitions>`;
    const types = parseCmmn(xml).elements.map((el) => el.type);

    expect(types).toEqual(["serviceTask", "genericEventListener"]);
  });

  it("reads an unrecognised flowable:type as a service task rather than dropping the task", () => {
    // A deployment can register its own task types. Losing the shape would be worse than
    // showing it as the generic kind it is closest to.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL" xmlns:flowable="http://flowable.org/cmmn" targetNamespace="http://flowable.org/cmmn">
  <case id="c1" name="C">
    <casePlanModel id="pm" name="PM">
      <planItem id="pi1" name="T" definitionRef="t1" />
      <task id="t1" name="T" flowable:type="somethingCustom" />
    </casePlanModel>
  </case>
</definitions>`;
    const [parsed] = parseCmmn(xml).elements;

    expect(parsed.type).toBe("serviceTask");
    expect(parsed.attributes.type).toBe("somethingCustom");
  });
});

/*
 * Flowable's own converter fixtures, used as the oracle.
 *
 * Everything above proves this editor agrees with itself. These prove it agrees with the
 * engine: the files are what upstream's converter tests parse, so if a discriminator is
 * written in a form this editor does not recognise, it shows up here rather than after a
 * deploy. It is also the check that settles the `flowable:eventType` question — an earlier
 * version of this code recorded typed listeners as impossible to deploy, and this file
 * is upstream demonstrating otherwise.
 */
describe.each([
  ["signal-event-listener.cmmn", "signalEventListener"],
  ["variable-event-listener.cmmn", "variableEventListener"],
  ["script-task.cmmn", "scriptTask"],
  ["http-service-task-parallelInSameTransaction.cmmn", "httpTask"],
])("the engine's own %s", (file, expectedType) => {
  const source = read(`modules/flowable-cmmn-converter/src/test/resources/org/flowable/test/cmmn/converter/${file}`);

  it(`is recognised as a ${expectedType}`, () => {
    expect(parseCmmn(source).elements.map((el) => el.type)).toContain(expectedType);
  });

  it("survives a save with every kind of element it had", () => {
    const after = serialiseCmmn(parseCmmn(source));
    const lost = [...elementNames(source)].filter((name) => !elementNames(after).has(name));

    expect(lost, `elements deleted by a save: ${lost.join(", ")}`).toEqual([]);
  });

  it("survives a save with every attribute it had", () => {
    const after = serialiseCmmn(parseCmmn(source));
    const lost = [...attributeNames(source)].filter((name) => !attributeNames(after).has(name));

    expect(lost, `attributes deleted by a save: ${lost.join(", ")}`).toEqual([]);
  });
});

/*
 * Attributes on `<definitions>` itself. The serialiser rebuilds the root element rather
 * than editing it, so anything not modelled is gone on the first save — and none of these
 * change behaviour, which is precisely why losing them goes unnoticed. Found by running
 * this suite against the engine's own `script-task.cmmn`, which carries an
 * `xsi:schemaLocation` the four files above happen not to.
 */
describe("attributes on the definitions element", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL"
             xmlns:flowable="http://flowable.org/cmmn"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:schemaLocation="http://www.omg.org/spec/CMMN/20151109/MODEL CMMN11.xsd"
             exporter="Some Tool"
             exporterVersion="4.2"
             targetNamespace="http://flowable.org/cmmn">
  <case id="c1" name="C">
    <casePlanModel id="pm" name="PM" />
  </case>
</definitions>`;

  it("keeps them", () => {
    const after = serialiseCmmn(parseCmmn(source));

    expect(after).toContain('xsi:schemaLocation="http://www.omg.org/spec/CMMN/20151109/MODEL CMMN11.xsd"');
    expect(after).toContain('exporter="Some Tool"');
    expect(after).toContain('exporterVersion="4.2"');
  });

  it("does not duplicate targetNamespace, which it writes itself", () => {
    const after = serialiseCmmn(parseCmmn(source));

    expect(after.match(/targetNamespace=/g)).toHaveLength(1);
  });

  it("writes none when the file had none", () => {
    const plain = source
      .replace(/\n\s+xsi:schemaLocation="[^"]*"/, "")
      .replace(/\n\s+exporter="[^"]*"/, "")
      .replace(/\n\s+exporterVersion="[^"]*"/, "");

    expect(serialiseCmmn(parseCmmn(plain))).not.toContain("exporter=");
  });
});

/*
 * A stage used to absorb its first child task's children.
 *
 * Every read on a definition went through `firstByLocalName`, which searches *descendants*.
 * On a leaf task that is the same as reading its own children; on a stage it is not, so a
 * stage took the first task inside it as its own `extensionElements` and `timerExpression`
 * — and then serialised them onto itself, so a save duplicated every field injection in the
 * case onto the stage containing it.
 *
 * Not caught before because the four repository files have no stage whose children carry
 * extension elements, and because the symptom is additive: nothing is lost, so a
 * "keeps everything it had" test passes.
 */
describe("a stage's own children", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL" xmlns:flowable="http://flowable.org/cmmn" targetNamespace="http://flowable.org/cmmn">
  <case id="c1" name="C">
    <casePlanModel id="pm" name="PM">
      <planItem id="pis" name="S" definitionRef="st1" />
      <stage id="st1" name="S">
        <planItem id="pi1" name="T" definitionRef="ht1" />
        <humanTask id="ht1" name="T">
          <extensionElements>
            <flowable:field name="inner"><flowable:string><![CDATA[x]]></flowable:string></flowable:field>
          </extensionElements>
        </humanTask>
      </stage>
    </casePlanModel>
  </case>
</definitions>`;

  const byId = new Map(parseCmmn(source).elements.map((el) => [el.definitionId, el]));

  it("does not take the field injections of the task inside it", () => {
    expect(byId.get("st1")?.fields).toEqual([]);
    expect(byId.get("ht1")?.fields).toHaveLength(1);
  });

  it("does not duplicate them on save", () => {
    const after = serialiseCmmn(parseCmmn(source));

    expect(after.match(/flowable:field /g)).toHaveLength(1);
  });

  it("does not take a nested timer's expression either", () => {
    const withTimer = source.replace(
      '<humanTask id="ht1" name="T">',
      `<timerEventListener id="tl1" name="L"><timerExpression>PT1H</timerExpression></timerEventListener>
        <humanTask id="ht1" name="T">`,
    );
    const parsed = new Map(parseCmmn(withTimer).elements.map((el) => [el.definitionId, el]));

    expect(parsed.get("st1")?.timerExpression).toBeUndefined();
  });
});

/*
 * A send-event task's event key and parameter mappings. All three live inside
 * `extensionElements` — the key as `<flowable:eventType>`, which is a different thing from
 * the `flowable:eventType` *attribute* that names a listener's kind. They round-tripped
 * before as opaque preserved children; modelling them means they must not now be written
 * twice, once from the model and once from the passthrough.
 */
describe("send event task mappings", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL" xmlns:flowable="http://flowable.org/cmmn" targetNamespace="http://flowable.org/cmmn">
  <case id="c1" name="C">
    <casePlanModel id="pm" name="PM">
      <planItem id="pi1" name="Publish" definitionRef="t1" />
      <task id="t1" name="Publish" flowable:type="send-event">
        <extensionElements>
          <flowable:eventType>orderPlaced</flowable:eventType>
          <flowable:eventInParameter source="orderId" target="id" />
          <flowable:eventInParameter sourceExpression="\${total}" target="amount" />
          <flowable:eventOutParameter source="status" target="orderStatus" transient="true" />
        </extensionElements>
      </task>
    </casePlanModel>
  </case>
</definitions>`;

  const [task] = parseCmmn(source).elements;

  it("reads the event key", () => {
    expect(task.type).toBe("sendEventTask");
    expect(task.eventType).toBe("orderPlaced");
  });

  it("reads both directions of mapping", () => {
    expect(task.eventInParameters).toEqual([
      { source: "orderId", sourceExpression: undefined, target: "id", targetType: undefined, transient: undefined },
      { source: undefined, sourceExpression: "${total}", target: "amount", targetType: undefined, transient: undefined },
    ]);
    expect(task.eventOutParameters?.[0].transient).toBe(true);
  });

  it("writes each of them exactly once", () => {
    const after = serialiseCmmn(parseCmmn(source));

    expect(after.match(/<flowable:eventType>/g)).toHaveLength(1);
    expect(after.match(/<flowable:eventInParameter /g)).toHaveLength(2);
    expect(after.match(/<flowable:eventOutParameter /g)).toHaveLength(1);
  });

  it("drops a mapping with no source, which the engine would read as a mapping", () => {
    const model = parseCmmn(source);
    const withEmpty = {
      ...model,
      elements: model.elements.map((el) => ({
        ...el,
        eventInParameters: [...(el.eventInParameters ?? []), { target: "nothing" }],
      })),
    };

    expect(serialiseCmmn(withEmpty).match(/<flowable:eventInParameter /g)).toHaveLength(2);
  });
});

/*
 * `<planFragment>` and `<defaultControl>`.
 *
 * A plan fragment is a stage without a lifecycle — same content model, so the editor draws
 * it the same way and only the panel tells them apart. `<defaultControl>` is the item
 * control one level up, on the definition rather than the plan item, and the schema puts it
 * after documentation and extensionElements and before whatever the subtype adds. Both
 * round-tripped as opaque preserved children before; now they are modelled, so the risk is
 * writing them twice.
 */
describe("plan fragments and default controls", () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL" xmlns:flowable="http://flowable.org/cmmn" targetNamespace="http://flowable.org/cmmn">
  <case id="c1" name="C">
    <casePlanModel id="pm" name="PM">
      <planItem id="pif" name="F" definitionRef="pf1" />
      <planFragment id="pf1" name="F">
        <planItem id="pi1" name="T" definitionRef="ht1" />
      </planFragment>
      <humanTask id="ht1" name="T">
        <defaultControl>
          <repetitionRule flowable:counterVariable="n" />
          <requiredRule />
        </defaultControl>
      </humanTask>
    </casePlanModel>
  </case>
</definitions>`;

  it("reads the plan fragment as a container holding its plan item", () => {
    const model = parseCmmn(source);
    const fragment = model.elements.find((el) => el.type === "planFragment");
    const task = model.elements.find((el) => el.type === "humanTask");

    expect(fragment).toBeDefined();
    expect(task?.parentId).toBe(fragment!.planItemId);
  });

  it("writes it back as planFragment, not as a stage", () => {
    const after = serialiseCmmn(parseCmmn(source));

    expect(after).toContain("<planFragment ");
    expect(after).not.toContain("<stage ");
  });

  it("reads the default control's rules and its repetition attributes", () => {
    const task = parseCmmn(source).elements.find((el) => el.type === "humanTask");

    expect(task?.defaultControl?.repetition?.enabled).toBe(true);
    expect(task?.defaultControl?.required?.enabled).toBe(true);
    expect(task?.defaultControl?.repetitionAttributes).toEqual({ counterVariable: "n" });
  });

  it("writes the default control exactly once, and not as an itemControl", () => {
    const after = serialiseCmmn(parseCmmn(source));

    expect(after.match(/<defaultControl>/g)).toHaveLength(1);
    expect(after).not.toContain("<itemControl>");
  });

  it("keeps the item control and the default control apart", () => {
    const model = parseCmmn(source);
    const task = model.elements.find((el) => el.type === "humanTask")!;
    const withBoth = {
      ...model,
      elements: model.elements.map((el) =>
        el === task ? { ...el, itemControl: { manualActivation: { enabled: true } } } : el,
      ),
    };
    const after = serialiseCmmn(withBoth);

    expect(after.match(/<defaultControl>/g)).toHaveLength(1);
    expect(after.match(/<itemControl>/g)).toHaveLength(1);
    expect(after.indexOf("<itemControl>")).toBeLessThan(after.indexOf("<defaultControl>"));
  });
});

/*
 * Where a plan fragment's definitions are declared.
 *
 * `tPlanFragment` has `planItem` and `sentry` in its content model and no
 * `planItemDefinition`, so the definition of a task inside a fragment belongs to the
 * enclosing stage. Getting this wrong is not a subtle failure: writing the definition
 * inside the fragment fails schema validation, and resolving a plan item only against its
 * immediate container drops the task from the diagram entirely.
 */
describe("where a plan fragment's definitions live", () => {
  function nestedCase() {
    const base = emptyCase("c", "C");
    const fragment = createElement("planFragment", { x: 80, y: 80 }, base.planModelId);
    const task = createElement("humanTask", { x: 120, y: 140 }, fragment.planItemId);
    return { ...base, elements: [fragment, task] };
  }

  it("writes them in the plan model, not inside the fragment", () => {
    const xml = serialiseCmmn(nestedCase());
    const fragmentBody = xml.slice(xml.indexOf("<planFragment"), xml.indexOf("</planFragment>"));

    expect(fragmentBody).toContain("<planItem ");
    expect(fragmentBody).not.toContain("<humanTask ");
    expect(xml).toContain("<humanTask ");
  });

  it("reads the task back inside the fragment", () => {
    const parsed = parseCmmn(serialiseCmmn(nestedCase()));
    const fragment = parsed.elements.find((el) => el.type === "planFragment")!;
    const task = parsed.elements.find((el) => el.type === "humanTask");

    expect(task?.parentId).toBe(fragment.planItemId);
  });

  it("writes each definition exactly once", () => {
    const xml = serialiseCmmn(nestedCase());

    expect(xml.match(/<humanTask /g)).toHaveLength(1);
    expect(xml.match(/<planFragment /g)).toHaveLength(1);
  });

  it("still lets a nested stage declare its own", () => {
    const base = emptyCase("c", "C");
    const stage = createElement("stage", { x: 80, y: 80 }, base.planModelId);
    const task = createElement("humanTask", { x: 120, y: 140 }, stage.planItemId);
    const xml = serialiseCmmn({ ...base, elements: [stage, task] });
    const stageBody = xml.slice(xml.indexOf("<stage"), xml.indexOf("</stage>"));

    expect(stageBody).toContain("<humanTask ");
  });
});
