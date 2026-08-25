/**
 * Pre-deploy checks for a BPMN model (REQUIREMENTS.md §7.4.2).
 *
 * **Why these run in the browser.** The engine ships `flowable-process-validation`, but
 * no REST endpoint exposes it — there is no "validate this XML" call to make. The only
 * server-side validation available is deployment itself, which either succeeds or fails
 * with one message. So these checks are a client-side approximation whose job is to
 * catch the mistakes that produce a confusing engine error, *before* the round trip.
 *
 * That framing matters for what belongs here. These are not a reimplementation of the
 * engine's validator and must never be presented as one: passing them does not
 * guarantee a deployment succeeds. Each rule below corresponds to a real
 * `flowable-process-validation` rule and to an error that is hard to diagnose from the
 * engine's own message.
 */

export type Severity = "error" | "warning";

export interface ValidationIssue {
  severity: Severity;
  /** The element the problem is on, so the editor can select it. */
  elementId?: string;
  message: string;
}

interface Element {
  tag: string;
  id?: string;
  name?: string;
  attrs: Record<string, string>;
}

/**
 * Parses with the browser's own XML parser rather than a regex.
 *
 * A malformed document is itself the most important finding, and `DOMParser` reports it
 * precisely — a regex would silently "validate" a file the engine cannot even read.
 */
export function validateBpmn(xml: string): ValidationIssue[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    return [
      {
        severity: "error",
        message: `This isn't well-formed XML: ${parserError.textContent?.trim().split("\n")[0] ?? "parse failed"}`,
      },
    ];
  }

  const issues: ValidationIssue[] = [];
  const processes = Array.from(doc.getElementsByTagNameNS("*", "process"));

  if (processes.length === 0) {
    return [{ severity: "error", message: "No process is defined in this model." }];
  }

  for (const process of processes) {
    const processId = process.getAttribute("id") ?? undefined;
    const elements = collect(process);

    const startEvents = elements.filter((e) => e.tag === "startEvent");
    const endEvents = elements.filter((e) => e.tag === "endEvent");
    const flows = elements.filter((e) => e.tag === "sequenceFlow");

    if (!process.getAttribute("id")) {
      issues.push({ severity: "error", message: "The process has no id, so it cannot be started." });
    }

    // FLOWABLE-PROCESS-VALIDATION: a process needs somewhere to begin.
    if (startEvents.length === 0) {
      issues.push({
        severity: "error",
        elementId: processId,
        message: "The process has no start event, so nothing can start it.",
      });
    }

    // Not fatal, but an instance that cannot finish leaks runtime state forever.
    if (endEvents.length === 0) {
      issues.push({
        severity: "warning",
        elementId: processId,
        message: "The process has no end event, so instances never finish cleanly.",
      });
    }

    const flowSources = new Set(flows.map((f) => f.attrs.sourceRef).filter(Boolean));
    const flowTargets = new Set(flows.map((f) => f.attrs.targetRef).filter(Boolean));
    const byId = new Map(elements.filter((e) => e.id).map((e) => [e.id!, e]));

    for (const flow of flows) {
      // A dangling reference deploys but the instance dies at runtime.
      for (const end of ["sourceRef", "targetRef"] as const) {
        const ref = flow.attrs[end];
        if (ref && !byId.has(ref)) {
          issues.push({
            severity: "error",
            elementId: flow.id,
            message: `A sequence flow points at "${ref}", which doesn't exist in this process.`,
          });
        }
      }
    }

    for (const element of elements) {
      if (!FLOW_NODES.has(element.tag)) continue;
      const label = describe(element);

      if (!element.id) {
        issues.push({ severity: "error", message: `${label} has no id.` });
        continue;
      }

      const incoming = flowTargets.has(element.id);
      const outgoing = flowSources.has(element.id);

      if (element.tag !== "startEvent" && !incoming) {
        issues.push({
          severity: "error",
          elementId: element.id,
          message: `${label} has nothing leading into it, so it can never be reached.`,
        });
      }
      if (element.tag !== "endEvent" && !outgoing) {
        issues.push({
          severity: "error",
          elementId: element.id,
          message: `${label} has no outgoing flow, so the process stops there.`,
        });
      }

      // An exclusive gateway with no default and no conditions deadlocks at runtime.
      if (element.tag === "exclusiveGateway") {
        const out = flows.filter((f) => f.attrs.sourceRef === element.id);
        if (out.length > 1 && !element.attrs.default) {
          const conditioned = out.filter((f) => hasCondition(process, f.id));
          if (conditioned.length < out.length - 1) {
            issues.push({
              severity: "warning",
              elementId: element.id,
              message: `${label} has ${out.length} outgoing flows but no default and not every branch is conditioned — the engine takes the first true one, or fails if none match.`,
            });
          }
        }
      }

      // A user task nobody can be assigned lands in a queue nobody sees.
      if (element.tag === "userTask") {
        const hasOwner =
          element.attrs["flowable:assignee"] ||
          element.attrs["flowable:candidateUsers"] ||
          element.attrs["flowable:candidateGroups"] ||
          element.attrs.assignee ||
          element.attrs.candidateUsers ||
          element.attrs.candidateGroups;
        if (!hasOwner) {
          issues.push({
            severity: "warning",
            elementId: element.id,
            message: `${label} has no assignee or candidates, so it will sit unclaimed.`,
          });
        }
      }

      // A service task with no implementation throws on execution.
      if (element.tag === "serviceTask") {
        const implemented =
          element.attrs["flowable:class"] ||
          element.attrs["flowable:expression"] ||
          element.attrs["flowable:delegateExpression"] ||
          element.attrs["flowable:type"];
        if (!implemented) {
          issues.push({
            severity: "error",
            elementId: element.id,
            message: `${label} has no class, expression or delegate, so it fails when reached.`,
          });
        }
      }
    }
  }

  return issues;
}

const FLOW_NODES = new Set([
  "startEvent",
  "endEvent",
  "intermediateCatchEvent",
  "intermediateThrowEvent",
  "task",
  "userTask",
  "serviceTask",
  "scriptTask",
  "manualTask",
  "receiveTask",
  "businessRuleTask",
  "sendTask",
  "callActivity",
  "subProcess",
  "exclusiveGateway",
  "parallelGateway",
  "inclusiveGateway",
  "eventBasedGateway",
  "complexGateway",
]);

function collect(process: Element_): Element[] {
  const out: Element[] = [];
  const walk = (node: Element_) => {
    for (const child of Array.from(node.children)) {
      const tag = child.localName;
      const attrs: Record<string, string> = {};
      for (const attribute of Array.from(child.attributes)) {
        attrs[attribute.name] = attribute.value;
        // Also index by local name so a differently-prefixed namespace still matches.
        attrs[`flowable:${attribute.localName}`] ??= attribute.value;
      }
      out.push({
        tag,
        id: child.getAttribute("id") ?? undefined,
        name: child.getAttribute("name") ?? undefined,
        attrs,
      });
      // Sub-processes hold their own flow nodes; boundary structure is checked flat.
      walk(child);
    }
  };
  walk(process);
  return out;
}

/** Alias so the DOM's own `Element` isn't shadowed by the local interface. */
type Element_ = globalThis.Element;

function describe(element: Element): string {
  const kind = element.tag.replace(/([A-Z])/g, " $1").toLowerCase();
  const label = element.name || element.id;
  return label ? `The ${kind} "${label}"` : `A ${kind}`;
}

function hasCondition(process: Element_, flowId: string | undefined): boolean {
  if (!flowId) return false;
  const flow = Array.from(process.getElementsByTagNameNS("*", "sequenceFlow")).find(
    (f) => f.getAttribute("id") === flowId,
  );
  if (!flow) return false;
  return flow.getElementsByTagNameNS("*", "conditionExpression").length > 0;
}

/** True when nothing blocks deployment; warnings alone do not. */
export function canDeploy(issues: ValidationIssue[]): boolean {
  return !issues.some((issue) => issue.severity === "error");
}
