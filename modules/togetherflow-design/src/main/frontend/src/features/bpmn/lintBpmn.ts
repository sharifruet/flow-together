/**
 * Structural BPMN linting (REQUIREMENTS.md §7.4.2, §14.3).
 *
 * **Why a third checker, and how it avoids being a third opinion.** The editor already
 * has two: `validateBpmn` runs in the browser for instant feedback, and the engine's own
 * `ProcessValidator` is the authority on whether a model deploys. bpmnlint would be a
 * third rule vocabulary, and three checkers that disagree are worse than two that do not.
 *
 * So the rule set below is curated, not `bpmnlint/recommended`. Every rule that overlaps
 * one of the other two is switched off, and what is left is exactly the structural
 * analysis neither performs — implicit splits and joins, duplicate flows, event-gateway
 * and sub-process shape. The reader never sees the same problem reported twice, and never
 * sees bpmnlint contradict the engine.
 *
 * Loaded through a dynamic import so it lands in its own chunk: it is only needed when a
 * check runs, and the BPMN editor chunk has little headroom left against its budget.
 */

import { BpmnModdle } from "bpmn-moddle";
import { Linter } from "bpmnlint";
import StaticResolver from "bpmnlint/lib/resolver/static-resolver";

import { flowableModdleDescriptor } from "./flowableModdle";

import adHocSubProcess from "bpmnlint/rules/ad-hoc-sub-process";
import eventBasedGateway from "bpmnlint/rules/event-based-gateway";
import eventSubProcessTypedStartEvent from "bpmnlint/rules/event-sub-process-typed-start-event";
import fakeJoin from "bpmnlint/rules/fake-join";
import labelRequired from "bpmnlint/rules/label-required";
import linkEvent from "bpmnlint/rules/link-event";
import noComplexGateway from "bpmnlint/rules/no-complex-gateway";
import noDuplicateSequenceFlows from "bpmnlint/rules/no-duplicate-sequence-flows";
import noGatewayJoinFork from "bpmnlint/rules/no-gateway-join-fork";
import noImplicitSplit from "bpmnlint/rules/no-implicit-split";
import singleBlankStartEvent from "bpmnlint/rules/single-blank-start-event";
import singleEventDefinition from "bpmnlint/rules/single-event-definition";
import subProcessBlankStartEvent from "bpmnlint/rules/sub-process-blank-start-event";
import superfluousGateway from "bpmnlint/rules/superfluous-gateway";
import superfluousTermination from "bpmnlint/rules/superfluous-termination";

import type { Severity, ValidationIssue } from "./validateBpmn";

/**
 * Deliberately excluded, with reasons, so the next person does not "fix" the omission:
 *
 * - `start-event-required`, `end-event-required`, `no-disconnected`, `no-implicit-start`,
 *   `no-implicit-end`, `conditional-flows` — `validateBpmn` already reports all of these,
 *   in wording aimed at the person modelling rather than at a spec.
 * - `no-inclusive-gateway` — bpmnlint discourages them; Flowable executes them perfectly
 *   well. Advice that is wrong for this engine is worse than no advice.
 * - `standard-size`, `no-overlapping-elements`, `no-bpmndi` — layout opinions. The editor
 *   lays elements out itself and always writes DI, so these can only produce noise.
 */
const RULES = {
  "ad-hoc-sub-process": adHocSubProcess,
  "event-based-gateway": eventBasedGateway,
  "event-sub-process-typed-start-event": eventSubProcessTypedStartEvent,
  "fake-join": fakeJoin,
  "label-required": labelRequired,
  "link-event": linkEvent,
  "no-complex-gateway": noComplexGateway,
  "no-duplicate-sequence-flows": noDuplicateSequenceFlows,
  "no-gateway-join-fork": noGatewayJoinFork,
  "no-implicit-split": noImplicitSplit,
  "single-blank-start-event": singleBlankStartEvent,
  "single-event-definition": singleEventDefinition,
  "sub-process-blank-start-event": subProcessBlankStartEvent,
  "superfluous-gateway": superfluousGateway,
  "superfluous-termination": superfluousTermination,
};

/**
 * `label-required` is a readability rule, not a correctness one — an unnamed gateway
 * deploys and runs. Reported as a warning so it cannot block a deploy.
 */
const WARN_ONLY = new Set([
  "label-required",
  "fake-join",
  "superfluous-gateway",
  "superfluous-termination",
]);

const config = {
  rules: Object.fromEntries(
    Object.keys(RULES).map((rule) => [rule, WARN_ONLY.has(rule) ? "warn" : "error"]),
  ),
};

const linter = new Linter({
  config,
  // Static rather than the node resolver: the rules are imported above so the bundler can
  // see them. The node resolver reads from disk and cannot work in a browser.
  resolver: new StaticResolver(
    Object.fromEntries(
      Object.entries(RULES).map(([name, rule]) => [`rule:bpmnlint/${name}`, rule]),
    ),
  ),
});

/**
 * Parsed with the Flowable extension registered so `flowable:` elements do not surface as
 * import warnings. bpmnlint ignores them either way, but a warning-free parse means a real
 * problem in the XML is visible rather than buried.
 */
const moddle = new BpmnModdle({ flowable: flowableModdleDescriptor });

export interface LintReport {
  rule: string;
  category: string;
  message: string;
  id?: string;
}

/**
 * Lints serialised BPMN XML.
 *
 * Takes XML rather than the tree bpmn-js already holds, deliberately. Several of these
 * rules walk `incoming`/`outgoing`, and those are populated from explicit
 * `<incoming>`/`<outgoing>` child elements — not derived from `sourceRef`/`targetRef`.
 * bpmn-js writes them on export, so a re-parse of `saveXML` output is complete, whereas
 * the in-memory tree's completeness depends on what the imported file happened to carry.
 * Linting the former reports the same problems for a hand-written file as for one this
 * editor produced. The extra parse costs a millisecond or two.
 */
export async function lintXml(xml: string): Promise<ValidationIssue[]> {
  const { rootElement } = await moddle.fromXML(xml);
  const results = (await linter.lint(rootElement)) as Record<string, LintReport[]>;

  return Object.entries(results).flatMap(([rule, reports]) =>
    reports.map((report) => ({
      severity: (report.category === "warn" ? "warning" : "error") as Severity,
      elementId: report.id,
      message: report.message,
      source: "lint" as const,
      code: rule,
    })),
  );
}
