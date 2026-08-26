/**
 * Pre-deploy checks for a case model (REQUIREMENTS.md §7.4.3).
 *
 * **Why these run in the browser.** `POST /cmmn-repository/model-validation` runs the
 * engine's own `CaseValidator` and is the authority on whether a case deploys. But that
 * validator is thin — it reports four problems in total — and it costs a round trip, so it
 * cannot run while someone is typing.
 *
 * These checks are deliberately **disjoint** from it. The engine already reports a decision
 * task with no reference, a human-task listener with no implementation, and an empty plan
 * model; none of those appear below. Two checkers that report the same problem in two
 * wordings is how a validation panel stops being read.
 *
 * What is here instead is everything the engine does not look at — most of it learned by
 * deploying cases and watching them fail at runtime rather than at deployment, which is
 * the worst moment to find out.
 */

import type { CmmnCase, CmmnElement } from "./cmmnModel";
import type { Severity, ValidationIssue } from "../bpmn/validateBpmn";

/** Fields an HTTP task cannot run without — the engine rejects the instance, not the model. */
const REQUIRED_HTTP_FIELDS = ["requestUrl", "requestMethod"];

export function validateCmmn(model: CmmnCase): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (
    severity: ValidationIssue["severity"],
    message: string,
    elementId?: string,
  ): void => {
    issues.push({ severity, message, elementId, source: "browser" });
  };

  /*
   * Duplicate ids. `id` is `xsd:ID` in the CMMN schema, so a repeat makes the whole
   * document unparseable — the engine refuses it before any validator runs, with a message
   * about the schema rather than about the two elements involved.
   */
  const seen = new Map<string, number>();
  for (const element of model.elements) {
    seen.set(element.definitionId, (seen.get(element.definitionId) ?? 0) + 1);
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      add("error", `More than one element has the id "${id}". Ids have to be unique.`,
        model.elements.find((e) => e.definitionId === id)?.planItemId);
    }
  }

  for (const element of model.elements) {
    const label = element.name || element.definitionId;

    if (!element.name.trim()) {
      add("warning", `An element has no name, so it shows as "${element.definitionId}" everywhere.`,
        element.planItemId);
    }

    checkReferences(element, label, add);
    checkTriggers(element, label, add);

    if (element.type === "stage") {
      const children = model.elements.filter((child) => child.parentId === element.planItemId);
      if (children.length === 0) {
        add("warning", `The stage "${label}" is empty, so nothing happens inside it.`,
          element.planItemId);
      }
    }
  }

  return issues;
}

type Add = (severity: ValidationIssue["severity"], message: string, elementId?: string) => void;

/** The references that deploy happily and then fail when the item is reached. */
function checkReferences(element: CmmnElement, label: string, add: Add): void {
  if (element.type === "processTask" && !element.plainAttributes.processRef?.trim()) {
    add("error", `The process task "${label}" names no process to start.`, element.planItemId);
  }

  if (element.type === "caseTask" && !element.plainAttributes.caseRef?.trim()) {
    add("error", `The case task "${label}" names no case to start.`, element.planItemId);
  }

  if (element.type === "timerEventListener" && !element.timerExpression?.trim()) {
    // A timer with no schedule is not a slow timer; it is one that never fires at all.
    add("error", `The timer "${label}" has no expression, so it never fires.`, element.planItemId);
  }

  if (element.type === "serviceTask") {
    const type = element.attributes.type?.trim();
    const implemented =
      element.attributes.class?.trim() ||
      element.attributes.expression?.trim() ||
      element.attributes.delegateExpression?.trim();

    if (!type && !implemented) {
      add("error", `The task "${label}" has no implementation, so it fails when reached.`,
        element.planItemId);
    }

    /*
     * A typed task is configured through field injections, and the engine only complains
     * when an instance reaches it — "requestMethod is required", thrown at runtime rather
     * than at deployment.
     */
    if (type === "http") {
      const names = new Set((element.fields ?? []).map((field) => field.name.trim()));
      for (const required of REQUIRED_HTTP_FIELDS) {
        if (!names.has(required)) {
          add("error", `The HTTP task "${label}" has no ${required} field.`, element.planItemId);
        }
      }
    }
  }
}

/** Criteria that cannot fire, which make the item they guard unreachable. */
function checkTriggers(element: CmmnElement, label: string, add: Add): void {
  for (const [kind, sentries] of [
    ["entry", element.entrySentries],
    ["exit", element.exitSentries],
  ] as const) {
    for (const sentry of sentries) {
      const parts = sentry.onParts ?? [];

      if (parts.length === 0 && !sentry.ifPart?.trim()) {
        add(
          "error",
          `An ${kind} criterion on "${label}" waits for nothing, so it never fires.`,
          element.planItemId,
        );
        continue;
      }

      if (parts.some((part) => !part.sourceRef.trim())) {
        add(
          "error",
          `An ${kind} criterion on "${label}" has a trigger with no element chosen.`,
          element.planItemId,
        );
      }
    }
  }
}

/**
 * Which shapes the canvas should mark, and how badly.
 *
 * Engine problems name the *definition* id (`humanTask_1`) while the canvas keys shapes by
 * plan-item id, so both are resolved. An element carrying both an error and a warning is
 * marked as an error — the worse of the two is the one worth drawing.
 */
export function problemMarkers(
  issues: ValidationIssue[] | null,
  model: CmmnCase | null,
): Map<string, Severity> {
  const markers = new Map<string, Severity>();
  if (!issues || !model) return markers;

  const byDefinitionId = new Map(
    model.elements.map((element) => [element.definitionId, element.planItemId]),
  );

  for (const issue of issues) {
    if (!issue.elementId) continue;
    const planItemId = byDefinitionId.get(issue.elementId) ?? issue.elementId;
    if (issue.severity === "error" || !markers.has(planItemId)) {
      markers.set(planItemId, issue.severity);
    }
  }
  return markers;
}
