/**
 * CMMN 1.1 model: parse and serialise, including CMMNDI diagram interchange.
 *
 * Written by hand because no maintained CMMN canvas library exists — `cmmn-js` was
 * last released in 2020 and pins a diagram-js generation incompatible with the
 * bpmn-js/dmn-js already in use. See docs/ui/adr/0009-cmmn-canvas.md.
 *
 * The structure follows the engine's own example (examples/employee-onboarding.cmmn):
 * a `<case>` holds a `<casePlanModel>`; inside it, each `<planItem>` references a
 * definition element (`<humanTask>`, `<milestone>`, …) declared as a sibling. Diagram
 * shapes reference the **plan item** id, not the definition id — getting that backwards
 * produces a file that deploys but renders with no layout.
 */

export const CMMN_NS = "http://www.omg.org/spec/CMMN/20151109/MODEL";
export const CMMNDI_NS = "http://www.omg.org/spec/CMMN/20151109/CMMNDI";
export const DC_NS = "http://www.omg.org/spec/CMMN/20151109/DC";
export const FLOWABLE_CMMN_NS = "http://flowable.org/cmmn";

/** Element kinds the editor can place. `casePlanModel` is the implicit root. */
export type CmmnElementType =
  | "humanTask"
  | "processTask"
  | "caseTask"
  | "decisionTask"
  | "serviceTask"
  | "milestone"
  | "stage"
  | "timerEventListener"
  | "userEventListener";

export const CONTAINER_TYPES: ReadonlySet<CmmnElementType> = new Set(["stage"]);

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CmmnElement {
  /** Plan item id — what the diagram and sentries reference. */
  planItemId: string;
  /** Definition id — what the plan item points at. */
  definitionId: string;
  type: CmmnElementType;
  name: string;
  bounds: Bounds;
  /** Id of the containing stage, or null for the case plan model. */
  parentId: string | null;
  /** Flowable extension attributes, kept verbatim so unknown ones survive. */
  attributes: Record<string, string>;
  /** `isBlocking` on task types. */
  blocking?: boolean;
  /** Criteria that start (entry) or terminate (exit) this element. */
  entrySentries: Sentry[];
  exitSentries: Sentry[];
}

export interface Sentry {
  id: string;
  /** Plan item this criterion listens to. */
  sourceRef?: string;
  /** Standard event, e.g. "complete", "occur". */
  standardEvent?: string;
  /** Optional guard expression. */
  ifPart?: string;
}

export interface CmmnCase {
  caseId: string;
  caseName: string;
  documentation?: string;
  planModelId: string;
  planModelName: string;
  planModelBounds: Bounds;
  elements: CmmnElement[];
}

export const DEFAULT_SIZES: Record<CmmnElementType, { width: number; height: number }> = {
  humanTask: { width: 140, height: 80 },
  processTask: { width: 140, height: 80 },
  caseTask: { width: 140, height: 80 },
  decisionTask: { width: 140, height: 80 },
  serviceTask: { width: 140, height: 80 },
  milestone: { width: 140, height: 50 },
  stage: { width: 260, height: 180 },
  timerEventListener: { width: 40, height: 40 },
  userEventListener: { width: 40, height: 40 },
};

export const TYPE_LABELS: Record<CmmnElementType, string> = {
  humanTask: "Human task",
  processTask: "Process task",
  caseTask: "Case task",
  decisionTask: "Decision task",
  serviceTask: "Service task",
  milestone: "Milestone",
  stage: "Stage",
  timerEventListener: "Timer event listener",
  userEventListener: "User event listener",
};

/* ── Parsing ─────────────────────────────────────────────────────────────── */

export function parseCmmn(xml: string): CmmnCase {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("This file is not valid XML.");
  }

  const caseEl = firstByLocalName(doc.documentElement, "case");
  if (!caseEl) throw new Error("No <case> element found — this is not a CMMN model.");

  const planModel = firstByLocalName(caseEl, "casePlanModel");
  if (!planModel) throw new Error("The case has no <casePlanModel>.");

  const shapes = readShapes(doc);
  const elements: CmmnElement[] = [];

  collectElements(planModel, planModel.getAttribute("id") ?? "casePlanModel", shapes, elements);

  return {
    caseId: caseEl.getAttribute("id") ?? "case1",
    caseName: caseEl.getAttribute("name") ?? "Case",
    documentation: firstByLocalName(caseEl, "documentation")?.textContent?.trim() || undefined,
    planModelId: planModel.getAttribute("id") ?? "casePlanModel",
    planModelName: planModel.getAttribute("name") ?? "Case plan model",
    planModelBounds:
      shapes.get(planModel.getAttribute("id") ?? "") ?? { x: 60, y: 60, width: 720, height: 420 },
    elements,
  };
}

/**
 * Walks one container, pairing each plan item with the definition it references.
 * Definitions without a plan item are ignored — they are unreachable in the case.
 */
function collectElements(
  container: Element,
  parentId: string,
  shapes: Map<string, Bounds>,
  out: CmmnElement[],
): void {
  const planItems = childrenByLocalName(container, "planItem");

  for (const planItem of planItems) {
    const planItemId = planItem.getAttribute("id");
    const definitionRef = planItem.getAttribute("definitionRef");
    if (!planItemId || !definitionRef) continue;

    const definition = findDefinition(container, definitionRef);
    if (!definition) continue;

    const type = typeOf(definition.localName);
    if (!type) continue;

    const size = DEFAULT_SIZES[type];
    const element: CmmnElement = {
      planItemId,
      definitionId: definitionRef,
      type,
      name: definition.getAttribute("name") ?? planItem.getAttribute("name") ?? "",
      bounds: shapes.get(planItemId) ?? { x: 120, y: 120, ...size },
      parentId,
      attributes: flowableAttributes(definition),
      blocking: definition.getAttribute("isBlocking") !== "false",
      entrySentries: readSentries(planItem, container, "entryCriterion"),
      exitSentries: readSentries(planItem, container, "exitCriterion"),
    };
    out.push(element);

    if (type === "stage") {
      collectElements(definition, planItemId, shapes, out);
    }
  }
}

function readSentries(planItem: Element, container: Element, kind: string): Sentry[] {
  return childrenByLocalName(planItem, kind).map((criterion) => {
    const sentryRef = criterion.getAttribute("sentryRef");
    const sentry = sentryRef
      ? childrenByLocalName(container, "sentry").find((s) => s.getAttribute("id") === sentryRef)
      : undefined;
    const onPart = sentry ? firstByLocalName(sentry, "planItemOnPart") : undefined;
    const ifPart = sentry ? firstByLocalName(sentry, "ifPart") : undefined;
    return {
      id: criterion.getAttribute("id") ?? sentryRef ?? crypto.randomUUID(),
      sourceRef: onPart?.getAttribute("sourceRef") ?? undefined,
      standardEvent:
        (onPart ? firstByLocalName(onPart, "standardEvent")?.textContent?.trim() : undefined) ??
        undefined,
      ifPart: ifPart
        ? firstByLocalName(ifPart, "condition")?.textContent?.trim() || undefined
        : undefined,
    };
  });
}

function findDefinition(container: Element, id: string): Element | undefined {
  return Array.from(container.children).find(
    (child) => child.getAttribute("id") === id && typeOf(child.localName) !== null,
  );
}

function typeOf(localName: string | null): CmmnElementType | null {
  switch (localName) {
    case "humanTask":
    case "processTask":
    case "caseTask":
    case "decisionTask":
    case "serviceTask":
    case "milestone":
    case "stage":
      return localName;
    case "timerEventListener":
      return "timerEventListener";
    case "userEventListener":
      return "userEventListener";
    // A plain <task> is modelled as a service task; the engine treats it as non-blocking work.
    case "task":
      return "serviceTask";
    default:
      return null;
  }
}

function flowableAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const attr of Array.from(element.attributes)) {
    if (attr.namespaceURI === FLOWABLE_CMMN_NS || attr.name.startsWith("flowable:")) {
      attributes[attr.localName] = attr.value;
    }
  }
  return attributes;
}

function readShapes(doc: Document): Map<string, Bounds> {
  const shapes = new Map<string, Bounds>();
  for (const shape of Array.from(doc.getElementsByTagNameNS(CMMNDI_NS, "CMMNShape"))) {
    const ref = shape.getAttribute("cmmnElementRef");
    const bounds = firstByLocalName(shape, "Bounds");
    if (!ref || !bounds) continue;
    shapes.set(ref, {
      x: Number(bounds.getAttribute("x") ?? 0),
      y: Number(bounds.getAttribute("y") ?? 0),
      width: Number(bounds.getAttribute("width") ?? 100),
      height: Number(bounds.getAttribute("height") ?? 80),
    });
  }
  return shapes;
}

function firstByLocalName(parent: Element, localName: string): Element | undefined {
  return Array.from(parent.getElementsByTagName("*")).find((el) => el.localName === localName);
}

function childrenByLocalName(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((el) => el.localName === localName);
}

/* ── Serialising ─────────────────────────────────────────────────────────── */

export function serialiseCmmn(model: CmmnCase): string {
  const roots = model.elements.filter((el) => el.parentId === model.planModelId);
  const body = renderContainerBody(roots, model, 6);

  const shapes = [
    shapeXml(`shape_${model.planModelId}`, model.planModelId, model.planModelBounds, 6),
    ...model.elements.map((el) => shapeXml(`shape_${el.planItemId}`, el.planItemId, el.bounds, 6)),
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="${CMMN_NS}"
             xmlns:flowable="${FLOWABLE_CMMN_NS}"
             xmlns:cmmndi="${CMMNDI_NS}"
             xmlns:dc="${DC_NS}"
             targetNamespace="http://flowable.org/cmmn">
  <case id="${esc(model.caseId)}" name="${esc(model.caseName)}">
${model.documentation ? `    <documentation>${esc(model.documentation)}</documentation>\n` : ""}    <casePlanModel id="${esc(model.planModelId)}" name="${esc(model.planModelName)}">
${body}    </casePlanModel>
  </case>
  <cmmndi:CMMNDI>
    <cmmndi:CMMNDiagram id="CMMNDiagram_${esc(model.caseId)}">
${shapes}
    </cmmndi:CMMNDiagram>
  </cmmndi:CMMNDI>
</definitions>
`;
}

/**
 * Emits one container's contents in the order the CMMN 1.1 schema demands:
 * every `<planItem>` first, then every `<sentry>`, then the plan-item definitions.
 *
 * Interleaving plan items with their definitions — which reads more naturally and
 * round-trips through this file's own parser — is rejected by the engine with
 * "Invalid content was found starting with element planItem". Verified against a
 * running engine; the repository's own examples/employee-onboarding.cmmn has the
 * same defect and also fails to deploy.
 */
function renderContainerBody(
  elements: CmmnElement[],
  model: CmmnCase,
  indent: number,
): string {
  const planItems = elements.map((el) => renderPlanItem(el, indent)).join("\n");
  const sentries = renderSentries(elements, model, indent);
  const definitions = elements.map((el) => renderDefinition(el, model, indent)).join("\n");
  return [planItems, sentries.trimEnd(), definitions]
    .filter((part) => part.length > 0)
    .join("\n") + "\n";
}

function renderPlanItem(element: CmmnElement, indent: number): string {
  const pad = " ".repeat(indent);
  const criteria = [
    ...element.entrySentries.map(
      (s) => `${pad}  <entryCriterion id="${esc(s.id)}" sentryRef="sentry_${esc(s.id)}" />`,
    ),
    ...element.exitSentries.map(
      (s) => `${pad}  <exitCriterion id="${esc(s.id)}" sentryRef="sentry_${esc(s.id)}" />`,
    ),
  ].join("\n");

  const open = `${pad}<planItem id="${esc(element.planItemId)}" name="${esc(element.name)}" definitionRef="${esc(element.definitionId)}"`;
  return criteria ? `${open}>\n${criteria}\n${pad}</planItem>` : `${open} />`;
}

function renderDefinition(element: CmmnElement, model: CmmnCase, indent: number): string {
  const pad = " ".repeat(indent);
  const attrs = Object.entries(element.attributes)
    .map(([key, value]) => ` flowable:${key}="${esc(value)}"`)
    .join("");

  if (element.type === "stage") {
    const children = model.elements.filter((el) => el.parentId === element.planItemId);
    const inner = renderContainerBody(children, model, indent + 2);
    return `${pad}<stage id="${esc(element.definitionId)}" name="${esc(element.name)}"${attrs}>
${inner}${pad}</stage>`;
  }
  if (element.type === "milestone") {
    return `${pad}<milestone id="${esc(element.definitionId)}" name="${esc(element.name)}"${attrs} />`;
  }
  if (element.type.endsWith("EventListener")) {
    return `${pad}<${element.type} id="${esc(element.definitionId)}" name="${esc(element.name)}"${attrs} />`;
  }
  return `${pad}<${element.type} id="${esc(element.definitionId)}" name="${esc(element.name)}" isBlocking="${element.blocking !== false}"${attrs} />`;
}

/** Sentries are declared as siblings of the plan items that reference them. */
function renderSentries(elements: CmmnElement[], model: CmmnCase, indent: number): string {
  const pad = " ".repeat(indent);
  const all = elements.flatMap((el) => [...el.entrySentries, ...el.exitSentries]);
  if (all.length === 0) return "";

  return (
    all
      .map((sentry) => {
        const source = sentry.sourceRef
          ? model.elements.find((el) => el.planItemId === sentry.sourceRef)
          : undefined;
        const onPart = source
          ? `\n${pad}  <planItemOnPart id="onPart_${esc(sentry.id)}" sourceRef="${esc(source.planItemId)}">\n${pad}    <standardEvent>${esc(sentry.standardEvent || "complete")}</standardEvent>\n${pad}  </planItemOnPart>`
          : "";
        const ifPart = sentry.ifPart
          ? `\n${pad}  <ifPart>\n${pad}    <condition><![CDATA[${sentry.ifPart}]]></condition>\n${pad}  </ifPart>`
          : "";
        return `${pad}<sentry id="sentry_${esc(sentry.id)}">${onPart}${ifPart}\n${pad}</sentry>`;
      })
      .join("\n") + "\n"
  );
}

function shapeXml(id: string, ref: string, bounds: Bounds, indent: number): string {
  const pad = " ".repeat(indent);
  // CMMNLabel is mandatory in the CMMN DI schema: omitting it fails deployment with
  // "The content of element cmmndi:CMMNShape is not complete". Verified live.
  return `${pad}<cmmndi:CMMNShape id="${esc(id)}" cmmnElementRef="${esc(ref)}">
${pad}  <dc:Bounds x="${Math.round(bounds.x)}" y="${Math.round(bounds.y)}" width="${Math.round(bounds.width)}" height="${Math.round(bounds.height)}" />
${pad}  <cmmndi:CMMNLabel />
${pad}</cmmndi:CMMNShape>`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ── Editing helpers ─────────────────────────────────────────────────────── */

export function emptyCase(caseKey: string, caseName: string): CmmnCase {
  return {
    caseId: caseKey,
    caseName,
    planModelId: `${caseKey}_plan`,
    planModelName: caseName,
    planModelBounds: { x: 60, y: 60, width: 760, height: 440 },
    elements: [],
  };
}

let idCounter = 0;

export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter}`;
}

export function createElement(
  type: CmmnElementType,
  position: { x: number; y: number },
  parentId: string,
): CmmnElement {
  const definitionId = nextId(type);
  return {
    planItemId: `planItem_${definitionId}`,
    definitionId,
    type,
    name: TYPE_LABELS[type],
    bounds: { x: position.x, y: position.y, ...DEFAULT_SIZES[type] },
    parentId,
    attributes: {},
    blocking: true,
    entrySentries: [],
    exitSentries: [],
  };
}

/** Deleting a stage must take its children with it, or they become unreachable. */
export function removeElement(model: CmmnCase, planItemId: string): CmmnCase {
  const doomed = new Set<string>([planItemId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const element of model.elements) {
      if (element.parentId && doomed.has(element.parentId) && !doomed.has(element.planItemId)) {
        doomed.add(element.planItemId);
        grew = true;
      }
    }
  }

  return {
    ...model,
    elements: model.elements
      .filter((element) => !doomed.has(element.planItemId))
      // A sentry pointing at a deleted element would serialise a dangling sourceRef.
      .map((element) => ({
        ...element,
        entrySentries: element.entrySentries.filter(
          (s) => !s.sourceRef || !doomed.has(s.sourceRef),
        ),
        exitSentries: element.exitSentries.filter((s) => !s.sourceRef || !doomed.has(s.sourceRef)),
      })),
  };
}

/** Which container a point falls in — innermost stage wins, else the plan model. */
export function containerAt(
  model: CmmnCase,
  point: { x: number; y: number },
  ignoreId?: string,
): string {
  const stages = model.elements
    .filter((el) => el.type === "stage" && el.planItemId !== ignoreId)
    // Smallest area first so a nested stage beats its parent.
    .sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height);

  for (const stage of stages) {
    if (contains(stage.bounds, point)) return stage.planItemId;
  }
  return model.planModelId;
}

export function contains(bounds: Bounds, point: { x: number; y: number }): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}
