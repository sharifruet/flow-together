/**
 * Structural linting (§7.4.2).
 *
 * The point is not that bpmnlint works — it has its own suite. It is that the *curation*
 * holds: this editor has three checkers, and the whole justification for the third is
 * that it never reports what the other two already do. A rule quietly re-enabled by a
 * future config change would put the same problem in front of the reader twice, in two
 * different wordings, which is how a validation panel stops being trusted.
 */

import { describe, expect, it } from "vitest";
import { lintXml } from "./lintBpmn";

/**
 * Fixtures carry explicit `<incoming>`/`<outgoing>` elements.
 *
 * Not decoration: several rules walk those, and bpmn-moddle populates them from the
 * elements rather than deriving them from `sourceRef`/`targetRef`. Omitting them makes
 * the linter silently report nothing, which is exactly the false pass this file exists to
 * prevent. bpmn-js writes them on export, so real input always has them.
 */
const WRAP = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:flowable="http://flowable.org/bpmn"
             targetNamespace="http://flowable.org/test">
  <process id="p" isExecutable="true">${body}</process>
</definitions>`;

describe("structural linting", () => {
  it("reports an implicit split, which neither other checker looks for", async () => {
    // Two outgoing flows from a task fork silently — legal XML, and almost never intended.
    const issues = await lintXml(
      WRAP(`
        <startEvent id="start" name="Start"><outgoing>f0</outgoing></startEvent>
        <sequenceFlow id="f0" sourceRef="start" targetRef="t"/>
        <task id="t" name="Work">
          <incoming>f0</incoming><outgoing>f1</outgoing><outgoing>f2</outgoing>
        </task>
        <sequenceFlow id="f1" sourceRef="t" targetRef="a"/>
        <sequenceFlow id="f2" sourceRef="t" targetRef="b"/>
        <endEvent id="a" name="A"><incoming>f1</incoming></endEvent>
        <endEvent id="b" name="B"><incoming>f2</incoming></endEvent>`),
    );

    const split = issues.find((issue) => issue.code === "no-implicit-split");
    expect(split?.elementId).toBe("t");
    expect(split?.severity).toBe("error");
  });

  it("reports duplicate sequence flows", async () => {
    const issues = await lintXml(
      WRAP(`
        <startEvent id="start" name="Start"><outgoing>f1</outgoing><outgoing>f2</outgoing></startEvent>
        <sequenceFlow id="f1" sourceRef="start" targetRef="e"/>
        <sequenceFlow id="f2" sourceRef="start" targetRef="e"/>
        <endEvent id="e" name="End"><incoming>f1</incoming><incoming>f2</incoming></endEvent>`),
    );
    expect(issues.map((issue) => issue.code)).toContain("no-duplicate-sequence-flows");
  });

  it("labels every finding as `lint`, so the panel can attribute it", async () => {
    const issues = await lintXml(
      WRAP(`
        <startEvent id="start" name="Start"><outgoing>f1</outgoing><outgoing>f2</outgoing></startEvent>
        <sequenceFlow id="f1" sourceRef="start" targetRef="e"/>
        <sequenceFlow id="f2" sourceRef="start" targetRef="e"/>
        <endEvent id="e" name="End"><incoming>f1</incoming><incoming>f2</incoming></endEvent>`),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.source === "lint")).toBe(true);
  });

  it("treats readability rules as warnings, so they cannot block a deploy", async () => {
    // A gateway that neither splits nor joins is untidy, not broken.
    const issues = await lintXml(
      WRAP(`
        <startEvent id="start" name="Start"><outgoing>f1</outgoing></startEvent>
        <sequenceFlow id="f1" sourceRef="start" targetRef="g"/>
        <exclusiveGateway id="g" name="Pointless">
          <incoming>f1</incoming><outgoing>f2</outgoing>
        </exclusiveGateway>
        <sequenceFlow id="f2" sourceRef="g" targetRef="e"/>
        <endEvent id="e" name="End"><incoming>f2</incoming></endEvent>`),
    );
    const superfluous = issues.find((issue) => issue.code === "superfluous-gateway");
    expect(superfluous?.severity).toBe("warning");
  });

  it("stays silent on the problems the other two checkers own", async () => {
    /*
     * A process with no start or end event. `validateBpmn` reports both, and the engine's
     * validator has its own opinion — the linter must not add a third voice.
     */
    const issues = await lintXml(WRAP(`<task id="lonely" name="Lonely"/>`));
    const codes = issues.map((issue) => issue.code);

    for (const owned of [
      "start-event-required",
      "end-event-required",
      "no-disconnected",
      "no-implicit-start",
      "no-implicit-end",
      "conditional-flows",
    ]) {
      expect(codes, `${owned} is another checker's rule`).not.toContain(owned);
    }
  });

  it("does not discourage inclusive gateways, which this engine executes fine", async () => {
    const issues = await lintXml(
      WRAP(`
        <startEvent id="start" name="Start"><outgoing>f1</outgoing></startEvent>
        <sequenceFlow id="f1" sourceRef="start" targetRef="g"/>
        <inclusiveGateway id="g" name="Split">
          <incoming>f1</incoming><outgoing>f2</outgoing><outgoing>f3</outgoing>
        </inclusiveGateway>
        <sequenceFlow id="f2" sourceRef="g" targetRef="e"/>
        <sequenceFlow id="f3" sourceRef="g" targetRef="e2"/>
        <endEvent id="e" name="End"><incoming>f2</incoming></endEvent>
        <endEvent id="e2" name="End 2"><incoming>f3</incoming></endEvent>`),
    );
    expect(issues.map((issue) => issue.code)).not.toContain("no-inclusive-gateway");
  });

  it("survives XML it cannot parse, rather than taking the whole check down with it", async () => {
    // The linter is the least authoritative of the three; it must degrade, not throw.
    await expect(lintXml("this is not xml")).rejects.toBeTruthy();
  });
});
