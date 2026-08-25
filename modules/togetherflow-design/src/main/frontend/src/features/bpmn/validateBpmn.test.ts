import { describe, expect, it } from "vitest";
import { canDeploy, validateBpmn } from "./validateBpmn";

/** A minimal but valid process: start → user task → end, all wired up. */
function model(body: string, attrs = 'id="p1"'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:flowable="http://flowable.org/bpmn"
             targetNamespace="http://flowable.org/test">
  <process ${attrs}>
${body}
  </process>
</definitions>`;
}

const VALID = model(`
    <startEvent id="start" />
    <sequenceFlow id="f1" sourceRef="start" targetRef="task" />
    <userTask id="task" name="Approve" flowable:assignee="alice" />
    <sequenceFlow id="f2" sourceRef="task" targetRef="end" />
    <endEvent id="end" />`);

const errors = (xml: string) => validateBpmn(xml).filter((i) => i.severity === "error");
const warnings = (xml: string) => validateBpmn(xml).filter((i) => i.severity === "warning");

describe("validateBpmn", () => {
  it("passes a well-formed process", () => {
    expect(validateBpmn(VALID)).toEqual([]);
    expect(canDeploy(validateBpmn(VALID))).toBe(true);
  });

  /**
   * Malformed XML is the single most important finding: the engine cannot even read it,
   * and a regex-based check would happily "validate" it.
   */
  it("reports malformed XML rather than pretending to check it", () => {
    const issues = validateBpmn("<definitions><process></definitions>");
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toMatch(/well-formed XML/i);
  });

  it("reports a document with no process", () => {
    const issues = validateBpmn('<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"/>');
    expect(issues[0].message).toMatch(/No process is defined/);
  });

  it("requires a start event", () => {
    const xml = model(`
      <userTask id="task" flowable:assignee="a" />
      <sequenceFlow id="f" sourceRef="task" targetRef="end" />
      <endEvent id="end" />`);
    expect(errors(xml).some((i) => /no start event/i.test(i.message))).toBe(true);
  });

  it("warns about a process that never finishes", () => {
    const xml = model(`
      <startEvent id="start" />
      <sequenceFlow id="f" sourceRef="start" targetRef="task" />
      <userTask id="task" flowable:assignee="a" />`);
    expect(warnings(xml).some((i) => /no end event/i.test(i.message))).toBe(true);
  });

  it("catches an unreachable node", () => {
    const xml = model(`
      <startEvent id="start" />
      <sequenceFlow id="f1" sourceRef="start" targetRef="end" />
      <userTask id="orphan" name="Orphan" flowable:assignee="a" />
      <sequenceFlow id="f2" sourceRef="orphan" targetRef="end" />
      <endEvent id="end" />`);
    const issue = errors(xml).find((i) => i.elementId === "orphan");
    expect(issue?.message).toMatch(/nothing leading into it/);
  });

  it("catches a dead end", () => {
    const xml = model(`
      <startEvent id="start" />
      <sequenceFlow id="f1" sourceRef="start" targetRef="task" />
      <userTask id="task" name="Stuck" flowable:assignee="a" />
      <endEvent id="end" />
      <sequenceFlow id="f2" sourceRef="start" targetRef="end" />`);
    expect(errors(xml).some((i) => /no outgoing flow/.test(i.message))).toBe(true);
  });

  it("catches a sequence flow pointing at nothing", () => {
    const xml = model(`
      <startEvent id="start" />
      <sequenceFlow id="f1" sourceRef="start" targetRef="ghost" />
      <endEvent id="end" />
      <sequenceFlow id="f2" sourceRef="start" targetRef="end" />`);
    const issue = errors(xml).find((i) => /points at "ghost"/.test(i.message));
    expect(issue).toBeDefined();
  });

  it("requires a service task to have an implementation", () => {
    const xml = model(`
      <startEvent id="start" />
      <sequenceFlow id="f1" sourceRef="start" targetRef="svc" />
      <serviceTask id="svc" name="Call out" />
      <sequenceFlow id="f2" sourceRef="svc" targetRef="end" />
      <endEvent id="end" />`);
    const issue = errors(xml).find((i) => i.elementId === "svc");
    expect(issue?.message).toMatch(/no class, expression or delegate/);
  });

  it("accepts a service task implemented by any of the supported means", () => {
    for (const attr of [
      'flowable:class="com.x.Y"',
      'flowable:expression="${bean.go()}"',
      'flowable:delegateExpression="${bean}"',
    ]) {
      const xml = model(`
        <startEvent id="start" />
        <sequenceFlow id="f1" sourceRef="start" targetRef="svc" />
        <serviceTask id="svc" ${attr} />
        <sequenceFlow id="f2" sourceRef="svc" targetRef="end" />
        <endEvent id="end" />`);
      expect(errors(xml)).toEqual([]);
    }
  });

  it("warns about a user task nobody can pick up", () => {
    const xml = model(`
      <startEvent id="start" />
      <sequenceFlow id="f1" sourceRef="start" targetRef="task" />
      <userTask id="task" name="Nobody's" />
      <sequenceFlow id="f2" sourceRef="task" targetRef="end" />
      <endEvent id="end" />`);
    expect(warnings(xml).some((i) => /sit unclaimed/.test(i.message))).toBe(true);
  });

  it("accepts candidate groups as ownership", () => {
    const xml = model(`
      <startEvent id="start" />
      <sequenceFlow id="f1" sourceRef="start" targetRef="task" />
      <userTask id="task" flowable:candidateGroups="finance" />
      <sequenceFlow id="f2" sourceRef="task" targetRef="end" />
      <endEvent id="end" />`);
    expect(validateBpmn(xml)).toEqual([]);
  });

  it("warns about an exclusive gateway that can deadlock", () => {
    const xml = model(`
      <startEvent id="start" />
      <sequenceFlow id="f1" sourceRef="start" targetRef="gw" />
      <exclusiveGateway id="gw" name="Which way" />
      <sequenceFlow id="f2" sourceRef="gw" targetRef="end" />
      <sequenceFlow id="f3" sourceRef="gw" targetRef="end2" />
      <endEvent id="end" />
      <endEvent id="end2" />`);
    expect(warnings(xml).some((i) => i.elementId === "gw")).toBe(true);
  });

  it("accepts a gateway with a default flow", () => {
    const xml = model(`
      <startEvent id="start" />
      <sequenceFlow id="f1" sourceRef="start" targetRef="gw" />
      <exclusiveGateway id="gw" default="f2" />
      <sequenceFlow id="f2" sourceRef="gw" targetRef="end" />
      <sequenceFlow id="f3" sourceRef="gw" targetRef="end2" />
      <endEvent id="end" />
      <endEvent id="end2" />`);
    expect(warnings(xml).some((i) => i.elementId === "gw")).toBe(false);
  });

  it("reports a process with no id", () => {
    const xml = model(
      `
      <startEvent id="start" />
      <sequenceFlow id="f1" sourceRef="start" targetRef="end" />
      <endEvent id="end" />`,
      'name="Nameless"',
    );
    expect(errors(xml).some((i) => /no id/.test(i.message))).toBe(true);
  });
});

describe("canDeploy", () => {
  it("blocks on an error but not on a warning", () => {
    expect(canDeploy([{ severity: "warning", message: "x" }])).toBe(true);
    expect(canDeploy([{ severity: "error", message: "x" }])).toBe(false);
    expect(canDeploy([])).toBe(true);
  });
});
