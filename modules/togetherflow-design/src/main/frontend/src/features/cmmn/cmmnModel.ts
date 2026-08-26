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
/**
 * The kinds of plan item this editor can draw.
 *
 * Several of these are not distinct XML elements. Flowable's specialised tasks are all
 * `<task>` carrying a `flowable:type` discriminator, and its typed event listeners are all
 * `<eventListener>` carrying `flowable:eventType`; the type here is what the palette and
 * the properties panel work in, and {@link xmlElementName} maps it back to the tag.
 */
export type CmmnElementType =
  | "humanTask"
  | "processTask"
  | "caseTask"
  | "decisionTask"
  | "serviceTask"
  | "scriptTask"
  | "httpTask"
  | "mailTask"
  | "externalWorkerTask"
  | "casePageTask"
  | "sendEventTask"
  | "milestone"
  | "stage"
  | "planFragment"
  | "timerEventListener"
  | "userEventListener"
  | "genericEventListener"
  | "signalEventListener"
  | "variableEventListener"
  | "intentEventListener"
  | "reactivateEventListener";

/**
 * `flowable:type` on a `<task>`, for the kinds that are a typed task rather than their own
 * element. Values are the engine's own constants (`ScriptServiceTask.SCRIPT_TASK` and so on).
 */
export const TASK_TYPE_DISCRIMINATOR: Partial<Record<CmmnElementType, string>> = {
  scriptTask: "script",
  httpTask: "http",
  mailTask: "mail",
  externalWorkerTask: "external-worker",
  casePageTask: "casePage",
  sendEventTask: "send-event",
};

/** `flowable:eventType` on an `<eventListener>`, for the four typed listeners. */
export const LISTENER_TYPE_DISCRIMINATOR: Partial<Record<CmmnElementType, string>> = {
  signalEventListener: "signal",
  variableEventListener: "variable",
  intentEventListener: "intent",
  reactivateEventListener: "reactivate",
};

/**
 * Kinds drawn as a box that holds other plan items.
 *
 * A plan fragment is a stage without a lifecycle: it groups plan items and sentries so they
 * enter the plan as a unit, but it does not itself start, complete or terminate. The
 * schema gives it the same content model as a stage, so the canvas treats them alike and
 * only the properties panel tells them apart.
 */
export const CONTAINER_TYPES: ReadonlySet<CmmnElementType> = new Set(["stage", "planFragment"]);

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
  /**
   * `flowable:`-namespaced attributes, by local name. Written back with the prefix.
   */
  attributes: Record<string, string>;
  /**
   * Unprefixed CMMN attributes other than the ones modelled explicitly (`id`, `name`,
   * `isBlocking`).
   *
   * Kept apart from `attributes` because the namespace is not cosmetic: the engine reads
   * `processRef`, `decisionRef` and `caseRef` with a **null** namespace, so a
   * `flowable:processRef` is an attribute it never looks at. Writing every attribute with
   * the prefix meant no process or decision task this editor produced ever had a target.
   */
  plainAttributes: Record<string, string>;
  /**
   * Child elements of the definition this model does not understand, kept as raw XML.
   *
   * `itemControl`, `extensionElements`, `timerExpression`, `planItemStartTrigger` and the
   * rest. The serialiser rebuilds the document from this model, so anything not carried
   * here is deleted the first time a case is saved — which is how a timer event listener
   * lost its schedule.
   */
  /**
   * `<documentation>` on the plan item definition.
   *
   * Schema-wise this is the *first* child of every CMMN element, before
   * `extensionElements`, so the serialiser writes it there rather than wherever it is
   * convenient. Round-tripped before this was modelled — it landed in `extraChildren` —
   * but there was nowhere to write one, which is the whole reason a case ends up with
   * task names doing the job of documentation.
   */
  documentation?: string;
  /**
   * `<defaultControl>` — the item control applied to any plan item referencing this
   * definition that carries none of its own.
   *
   * Same content as `itemControl`, one level up. Useful where a definition is referenced by
   * several plan items and they should behave alike; the schema puts it on the definition,
   * before whatever the subtype adds.
   */
  defaultControl?: ItemControl;
  /**
   * `<flowable:eventType>` — the *registry event key* this task sends.
   *
   * Not to be confused with the `flowable:eventType` **attribute**, which on an
   * `<eventListener>` names the listener's kind. The engine reuses the name for two
   * unrelated things; this is the element form, and it lives inside `extensionElements`.
   */
  eventType?: string;
  /** Case variables carried out into the event payload. */
  eventInParameters?: EventParameter[];
  /** Event fields carried back into case variables. */
  eventOutParameters?: EventParameter[];
  extraChildren: string[];
  /** `isBlocking` on task types. */
  blocking?: boolean;
  /**
   * A timer event listener's schedule, from its `<timerExpression>` child.
   *
   * Modelled rather than carried through as raw XML because the panel has to edit it —
   * and because a timer listener without one is a timer that never fires.
   */
  timerExpression?: string;
  /** Control rules from the plan item's `<itemControl>`. */
  itemControl?: ItemControl;
  /** Plan item children other than criteria and `itemControl`, kept as raw XML. */
  extraPlanItemChildren: string[];
  /** `<flowable:field>` entries from the definition's `<extensionElements>`. */
  fields: CmmnField[];
  /** Lifecycle listeners from `<extensionElements>`. */
  lifecycleListeners: LifecycleListener[];
  /** Anything else inside `<extensionElements>` this model does not understand. */
  extraExtensionChildren: string[];
  /** Criteria that start (entry) or terminate (exit) this element. */
  entrySentries: Sentry[];
  exitSentries: Sentry[];
}

/**
 * One `<itemControl>` rule.
 *
 * CMMN models these as presence plus an optional guard: a `<requiredRule/>` with no
 * condition means "always required", and one carrying a `<condition>` means "required when
 * this is true". `enabled` is therefore whether the element exists at all, which is not
 * the same question as what the condition says.
 */
export interface RuleConfig {
  enabled: boolean;
  condition?: string;
}

/**
 * The plan item's control rules — the core of CMMN's discretionary behaviour.
 *
 * Whether a task must be completed before its stage can finish (`required`), whether it
 * can happen more than once (`repetition`), and whether a human has to start it rather
 * than it starting itself (`manualActivation`). None of these were reachable before, which
 * left the editor able to draw a case but not to express how it behaves.
 */
export interface ItemControl {
  required?: RuleConfig;
  repetition?: RuleConfig;
  manualActivation?: RuleConfig;
  completionNeutral?: RuleConfig;
  /** `flowable:` attributes on `<repetitionRule>` — counter and collection variables. */
  repetitionAttributes?: Record<string, string>;
}

/**
 * One `<flowable:field>` on a task.
 *
 * This is how the whole service-task family is configured: an HTTP task's `requestUrl` and
 * `requestMethod`, a mail task's `to` and `subject`. Typing a task as `http` without these
 * produces a case that deploys and then fails on start with "requestMethod is required".
 *
 * Four value forms, all of which the engine reads, so all four round-trip: a value can be
 * an attribute or a child element, and either a literal or an expression. A reader that
 * knew only some of them would silently blank the rest on save.
 */
export type CmmnFieldValueKind = "stringValue" | "expression" | "string" | "expressionElement";

export interface CmmnField {
  name: string;
  valueKind: CmmnFieldValueKind;
  value: string;
}

/**
 * One thing a sentry watches: a plan item reaching a lifecycle event.
 *
 * A sentry may hold several, and CMMN combines them with AND — "when the review completes
 * *and* the payment completes". Modelling one source per sentry made that inexpressible;
 * the schema declares `onPart` as `maxOccurs="unbounded"` precisely for this.
 */
export interface OnPart {
  sourceRef: string;
  /** Standard event, e.g. "complete", "occur". */
  standardEvent: string;
}

/**
 * A `<flowable:planItemLifecycleListener>`.
 *
 * Fires as a plan item moves between lifecycle states — available to active, active to
 * completed, and so on. Either bound is optional: omitting `sourceState` means "from any
 * state".
 */
export interface LifecycleListener {
  sourceState: string;
  targetState: string;
  implementationType: "class" | "delegateExpression" | "expression";
  value: string;
}

/**
 * One `<flowable:eventInParameter>` or `<flowable:eventOutParameter>` on a send-event task.
 *
 * In-parameters carry case variables out into the event's payload; out-parameters carry
 * fields of a received event back into case variables. Either side can be a plain name or
 * an expression, and only one of the pair is meaningful at a time.
 */
export interface EventParameter {
  source?: string;
  sourceExpression?: string;
  target?: string;
  targetType?: string;
  /** Out-parameters only: the variable lives for the transaction and is not persisted. */
  transient?: boolean;
}

export interface Sentry {
  id: string;
  /** Everything this criterion waits for. All of them must happen. */
  onParts: OnPart[];
  /** Sentry children this model does not understand — `caseFileItemOnPart` and the like. */
  extraSentryChildren?: string[];
  /** Optional guard expression. */
  ifPart?: string;
  /**
   * Exit criteria only: which instances the criterion terminates.
   *
   * `flowable:exitType` — default, `activeInstances`, or `activeAndEnabledInstances`. It
   * decides whether a repeating item's waiting instances are killed alongside the running
   * one, which is not something the default makes obvious.
   */
  exitType?: string;
  /**
   * Exit criteria only: `flowable:exitEventType` — how the stage or case plan model this
   * criterion sits on is ended.
   *
   * `exit` (the default) terminates it; `complete` and `forceComplete` end it as a normal
   * completion instead, which is what decides whether the case counts as completed or
   * terminated afterwards. Round-tripped before it was authorable, so an imported file
   * kept its own; there was no way to set one.
   */
  exitEventType?: string;
}

export interface CmmnCase {
  caseId: string;
  caseName: string;
  documentation?: string;
  planModelId: string;
  planModelName: string;
  planModelBounds: Bounds;
  elements: CmmnElement[];
  /** `flowable:` attributes on `<case>`, by local name — `initiatorVariableName` and such. */
  caseAttributes: Record<string, string>;
  /** Unprefixed attributes on `<case>` other than `id` and `name`. */
  casePlainAttributes: Record<string, string>;
  /** Attributes on `<casePlanModel>`, notably `autoComplete`. */
  planModelAttributes: Record<string, string>;
  planModelPlainAttributes: Record<string, string>;
  /** Children of `<case>` other than `casePlanModel` and `documentation`, as raw XML. */
  extraCaseChildren: string[];
  /** Children of `<casePlanModel>` that are neither plan items, sentries nor definitions. */
  extraPlanModelChildren: string[];
  /** Sibling roots — other `<case>` elements, `<process>`, `<decision>` — as raw XML. */
  extraRootChildren: string[];
  /** `<cmmndi:CMMNEdge>` elements, which carry how sentry connections were drawn. */
  diEdges: string[];
  /** Namespace declarations on `<definitions>` beyond the four this file always writes. */
  extraNamespaces: Record<string, string>;
  /**
   * Other attributes on `<definitions>` — `xsi:schemaLocation`, `exporter`, `author`.
   *
   * The serialiser rebuilds the root element rather than editing it, so anything not
   * modelled here is dropped on the first save. None of these change how a case behaves,
   * which is exactly why losing them is easy not to notice.
   */
  rootAttributes: Record<string, string>;
}

export const DEFAULT_SIZES: Record<CmmnElementType, { width: number; height: number }> = {
  humanTask: { width: 140, height: 80 },
  processTask: { width: 140, height: 80 },
  caseTask: { width: 140, height: 80 },
  decisionTask: { width: 140, height: 80 },
  serviceTask: { width: 140, height: 80 },
  scriptTask: { width: 140, height: 80 },
  httpTask: { width: 140, height: 80 },
  mailTask: { width: 140, height: 80 },
  externalWorkerTask: { width: 140, height: 80 },
  casePageTask: { width: 140, height: 80 },
  sendEventTask: { width: 140, height: 80 },
  milestone: { width: 140, height: 50 },
  stage: { width: 260, height: 180 },
  planFragment: { width: 240, height: 160 },
  timerEventListener: { width: 40, height: 40 },
  userEventListener: { width: 40, height: 40 },
  genericEventListener: { width: 40, height: 40 },
  signalEventListener: { width: 40, height: 40 },
  variableEventListener: { width: 40, height: 40 },
  intentEventListener: { width: 40, height: 40 },
  reactivateEventListener: { width: 40, height: 40 },
};

export const TYPE_LABELS: Record<CmmnElementType, string> = {
  humanTask: "Human task",
  processTask: "Process task",
  caseTask: "Case task",
  decisionTask: "Decision task",
  serviceTask: "Service task",
  scriptTask: "Script task",
  httpTask: "HTTP task",
  mailTask: "Mail task",
  externalWorkerTask: "External worker task",
  casePageTask: "Case page task",
  sendEventTask: "Send event task",
  milestone: "Milestone",
  stage: "Stage",
  planFragment: "Plan fragment",
  timerEventListener: "Timer event listener",
  userEventListener: "User event listener",
  genericEventListener: "Event listener",
  signalEventListener: "Signal event listener",
  variableEventListener: "Variable event listener",
  intentEventListener: "Intent event listener",
  reactivateEventListener: "Reactivate event listener",
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

  const di = firstByLocalName(doc.documentElement, "CMMNDI");
  const diagram = di ? firstByLocalName(di, "CMMNDiagram") : undefined;

  return {
    caseId: caseEl.getAttribute("id") ?? "case1",
    caseName: caseEl.getAttribute("name") ?? "Case",
    documentation: firstChildByLocalName(caseEl, "documentation")?.textContent?.trim() || undefined,
    planModelId: planModel.getAttribute("id") ?? "casePlanModel",
    planModelName: planModel.getAttribute("name") ?? "Case plan model",
    planModelBounds:
      shapes.get(planModel.getAttribute("id") ?? "") ?? { x: 60, y: 60, width: 720, height: 420 },
    elements,
    caseAttributes: flowableAttributes(caseEl),
    casePlainAttributes: plainAttributes(caseEl, ["id", "name"]),
    planModelAttributes: flowableAttributes(planModel),
    planModelPlainAttributes: plainAttributes(planModel, ["id", "name"]),
    extraCaseChildren: rawChildrenExcept(caseEl, ["casePlanModel", "documentation"]),
    extraPlanModelChildren: rawChildrenExcept(planModel, [
      "planItem",
      "sentry",
      ...KNOWN_DEFINITION_ELEMENTS,
    ]),
    extraRootChildren: Array.from(doc.documentElement.children)
      .filter((child) => child !== caseEl && child.localName !== "CMMNDI")
      .map(serialiseNode),
    // Edges carry how sentry connections were drawn. Rebuilding them from the model is
    // not possible — the routing is information the model does not hold.
    diEdges: diagram
      ? childrenByLocalName(diagram, "CMMNEdge").map(serialiseNode)
      : [],
    extraNamespaces: extraNamespaceDeclarations(doc.documentElement),
    rootAttributes: otherRootAttributes(doc.documentElement),
  };
}

/** Definition elements this model understands, so anything else is carried through raw. */
const KNOWN_DEFINITION_ELEMENTS = [
  "humanTask",
  "processTask",
  "caseTask",
  "decisionTask",
  "serviceTask",
  "task",
  "milestone",
  "stage",
  "planFragment",
  "timerEventListener",
  "userEventListener",
  "eventListener",
];

function serialiseNode(node: Element): string {
  return new XMLSerializer().serializeToString(node);
}

/**
 * Attributes with no namespace prefix, minus the ones the model holds in named fields.
 *
 * The exclusions matter: emitting `id` from here as well as from its own field would
 * produce the attribute twice.
 */
function plainAttributes(element: Element, exclude: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const attr of Array.from(element.attributes)) {
    if (attr.name.includes(":") || attr.namespaceURI) continue;
    if (exclude.includes(attr.name)) continue;
    result[attr.name] = attr.value;
  }
  return result;
}

/** Raw XML of children whose local name is not one this model handles. */
function rawChildrenExcept(parent: Element, known: string[]): string[] {
  return Array.from(parent.children)
    .filter((child) => !known.includes(child.localName))
    .map(serialiseNode);
}

/**
 * Namespace declarations beyond the four the serialiser always writes.
 *
 * Without these a preserved child using, say, the `di:` prefix serialises into a document
 * that does not declare it, and the engine rejects the whole file with "Undeclared prefix".
 */
function extraNamespaceDeclarations(root: Element): Record<string, string> {
  const always = ["xmlns", "xmlns:flowable", "xmlns:cmmndi", "xmlns:dc"];
  const result: Record<string, string> = {};
  for (const attr of Array.from(root.attributes)) {
    if (!attr.name.startsWith("xmlns")) continue;
    if (always.includes(attr.name)) continue;
    result[attr.name] = attr.value;
  }
  return result;
}

/** Root attributes that are neither a namespace declaration nor one this file writes. */
function otherRootAttributes(root: Element): Record<string, string> {
  const written = ["targetNamespace"];
  const result: Record<string, string> = {};
  for (const attr of Array.from(root.attributes)) {
    if (attr.name.startsWith("xmlns")) continue;
    if (written.includes(attr.name)) continue;
    result[attr.name] = attr.value;
  }
  return result;
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

    const type = typeOf(definition);
    if (!type) continue;

    const size = DEFAULT_SIZES[type];
    const element: CmmnElement = {
      planItemId,
      definitionId: definitionRef,
      type,
      name: definition.getAttribute("name") ?? planItem.getAttribute("name") ?? "",
      bounds: shapes.get(planItemId) ?? { x: 120, y: 120, ...size },
      parentId,
      attributes: withoutDiscriminator(flowableAttributes(definition), type),
      plainAttributes: plainAttributes(definition, ["id", "name", "isBlocking"]),
      documentation:
        firstChildByLocalName(definition, "documentation")?.textContent?.trim() || undefined,
      defaultControl: readControl(firstChildByLocalName(definition, "defaultControl")),
      extraChildren:
        CONTAINER_TYPES.has(type)
          ? rawChildrenExcept(definition, [
              "planItem",
              "sentry",
              "documentation",
              "defaultControl",
              ...KNOWN_DEFINITION_ELEMENTS,
            ])
          // `timerExpression`, `extensionElements` and `documentation` are excluded
          // because all three are modelled below; leaving them here too would emit each
          // twice.
          : rawChildrenExcept(definition, [
              "timerExpression",
              "extensionElements",
              "documentation",
              "defaultControl",
            ]),
      fields: readFields(definition),
      eventType: readEventType(definition),
      eventInParameters: readEventParameters(definition, "eventInParameter"),
      eventOutParameters: readEventParameters(definition, "eventOutParameter"),
      lifecycleListeners: readLifecycleListeners(definition),
      extraExtensionChildren: readExtraExtensionChildren(definition),
      timerExpression:
        firstChildByLocalName(definition, "timerExpression")?.textContent?.trim() || undefined,
      itemControl: readItemControl(planItem),
      extraPlanItemChildren: rawChildrenExcept(planItem, [
        "entryCriterion",
        "exitCriterion",
        "itemControl",
      ]),
      blocking: definition.getAttribute("isBlocking") !== "false",
      entrySentries: readSentries(planItem, container, "entryCriterion"),
      exitSentries: readSentries(planItem, container, "exitCriterion"),
    };
    out.push(element);

    if (CONTAINER_TYPES.has(type)) {
      collectElements(definition, planItemId, shapes, out);
    }
  }
}

/**
 * Rule elements in the order `tPlanItemControl` demands.
 *
 * The order is not stylistic: the CMMN schema declares a sequence, and emitting
 * `requiredRule` before `repetitionRule` fails validation with "Invalid content was found
 * starting with element repetitionRule". Verified against a running engine.
 *
 * `completionNeutralRule` is last and deliberately not offered by the editor — Flowable
 * parses it, but it appears in no CMMN schema, so a document containing one cannot pass
 * the validation that runs at deployment. It is kept here only so an imported file that
 * already has one is not silently altered.
 */
const FIELD_VALUE_ATTRIBUTES: Record<string, CmmnFieldValueKind> = {
  stringValue: "stringValue",
  expression: "expression",
};

/** Reads `<flowable:field>` entries, whichever of the four value forms each one uses. */
function readFields(definition: Element): CmmnField[] {
  const extensions = firstChildByLocalName(definition, "extensionElements");
  if (!extensions) return [];

  return childrenByLocalName(extensions, "field").map((field) => {
    for (const [attribute, kind] of Object.entries(FIELD_VALUE_ATTRIBUTES)) {
      const value = field.getAttribute(attribute);
      if (value !== null) return { name: field.getAttribute("name") ?? "", valueKind: kind, value };
    }
    const stringChild = firstByLocalName(field, "string");
    if (stringChild) {
      return {
        name: field.getAttribute("name") ?? "",
        valueKind: "string" as const,
        value: stringChild.textContent ?? "",
      };
    }
    const expressionChild = firstByLocalName(field, "expression");
    return {
      name: field.getAttribute("name") ?? "",
      valueKind: "expressionElement" as const,
      value: expressionChild?.textContent ?? "",
    };
  });
}

/** `<flowable:eventType>` inside `extensionElements` — the registry event key. */
function readEventType(definition: Element): string | undefined {
  const extensions = firstChildByLocalName(definition, "extensionElements");
  if (!extensions) return undefined;
  return childrenByLocalName(extensions, "eventType")[0]?.textContent?.trim() || undefined;
}

function readEventParameters(definition: Element, localName: string): EventParameter[] {
  const extensions = firstChildByLocalName(definition, "extensionElements");
  if (!extensions) return [];

  return childrenByLocalName(extensions, localName).map((parameter) => ({
    source: parameter.getAttribute("source") ?? undefined,
    sourceExpression: parameter.getAttribute("sourceExpression") ?? undefined,
    target: parameter.getAttribute("target") ?? undefined,
    targetType: parameter.getAttribute("targetType") ?? undefined,
    transient: parameter.getAttribute("transient") === "true" || undefined,
  }));
}

const LISTENER_IMPLEMENTATIONS = ["class", "delegateExpression", "expression"] as const;

function readLifecycleListeners(definition: Element): LifecycleListener[] {
  const extensions = firstChildByLocalName(definition, "extensionElements");
  if (!extensions) return [];

  return childrenByLocalName(extensions, "planItemLifecycleListener").map((listener) => {
    const implementationType =
      LISTENER_IMPLEMENTATIONS.find((candidate) => listener.getAttribute(candidate) !== null) ??
      "class";
    return {
      sourceState: listener.getAttribute("sourceState") ?? "",
      targetState: listener.getAttribute("targetState") ?? "",
      implementationType,
      value: listener.getAttribute(implementationType) ?? "",
    };
  });
}

/** Everything inside `<extensionElements>` this model does not model itself. */
function readExtraExtensionChildren(definition: Element): string[] {
  const extensions = firstChildByLocalName(definition, "extensionElements");
  return extensions
    ? rawChildrenExcept(extensions, [
        "field",
        "planItemLifecycleListener",
        "eventType",
        "eventInParameter",
        "eventOutParameter",
      ])
    : [];
}

/** Emits `<extensionElements>`, or nothing when there is nothing to put in it. */
function renderExtensionElements(element: CmmnElement, indent: number): string {
  const pad = " ".repeat(indent);
  const fields = (element.fields ?? [])
    // A field the engine cannot match to a setter by name is not merely useless.
    .filter((field) => field.name.trim() !== "")
    .map((field) => {
      const name = ` name="${esc(field.name.trim())}"`;
      if (field.valueKind === "stringValue" || field.valueKind === "expression") {
        return `${pad}  <flowable:field${name} ${field.valueKind}="${esc(field.value)}" />`;
      }
      const tag = field.valueKind === "string" ? "string" : "expression";
      // CDATA because these carry expressions and markup — a mail body is HTML.
      return `${pad}  <flowable:field${name}>\n${pad}    <flowable:${tag}><![CDATA[${field.value}]]></flowable:${tag}>\n${pad}  </flowable:field>`;
    });

  const listeners = (element.lifecycleListeners ?? [])
    // A listener with no implementation is not something the engine can run.
    .filter((listener) => listener.value.trim() !== "")
    .map((listener) => {
      const states = [
        listener.sourceState.trim() ? ` sourceState="${esc(listener.sourceState.trim())}"` : "",
        listener.targetState.trim() ? ` targetState="${esc(listener.targetState.trim())}"` : "",
      ].join("");
      return `${pad}  <flowable:planItemLifecycleListener${states} ${listener.implementationType}="${esc(listener.value.trim())}" />`;
    });

  /*
   * `<flowable:eventType>` first: it names the event the parameters map onto, and reading a
   * mapping before knowing what it maps to is needless work for whoever opens the file.
   */
  const eventType = element.eventType?.trim()
    ? [`${pad}  <flowable:eventType>${esc(element.eventType.trim())}</flowable:eventType>`]
    : [];
  const inParameters = renderEventParameters(element.eventInParameters, "eventInParameter", pad);
  const outParameters = renderEventParameters(element.eventOutParameters, "eventOutParameter", pad);

  const others = (element.extraExtensionChildren ?? []).map((chunk) => `${pad}  ${chunk}`);
  const body = [
    ...fields,
    ...eventType,
    ...inParameters,
    ...outParameters,
    ...listeners,
    ...others,
  ].join("\n");
  return body ? `${pad}<extensionElements>\n${body}\n${pad}</extensionElements>` : "";
}

const RULE_ELEMENTS = {
  repetition: "repetitionRule",
  required: "requiredRule",
  manualActivation: "manualActivationRule",
  completionNeutral: "completionNeutralRule",
} as const;

function readItemControl(planItem: Element): ItemControl | undefined {
  return readControl(firstChildByLocalName(planItem, "itemControl"));
}

/** The rules inside an `<itemControl>` or a `<defaultControl>`; both have the same content. */
function readControl(control: Element | undefined): ItemControl | undefined {
  if (!control) return undefined;

  const result: ItemControl = {};
  for (const [key, elementName] of Object.entries(RULE_ELEMENTS)) {
    const rule = firstByLocalName(control, elementName);
    if (!rule) continue;
    result[key as keyof typeof RULE_ELEMENTS] = {
      enabled: true,
      condition: firstByLocalName(rule, "condition")?.textContent?.trim() || undefined,
    };
    if (key === "repetition") result.repetitionAttributes = flowableAttributes(rule);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Emits `<defaultControl>` on a definition, or nothing. Same content as `<itemControl>`. */
function renderDefaultControl(element: CmmnElement, indent: number): string {
  const xml = renderControl(element.defaultControl, "defaultControl", indent);
  return xml ? xml + "\n" : "";
}

/** Emits `<itemControl>`, or nothing when no rule is on. */
function renderItemControl(control: ItemControl | undefined, indent: number): string {
  return renderControl(control, "itemControl", indent);
}

function renderControl(
  control: ItemControl | undefined,
  tag: string,
  indent: number,
): string {
  if (!control) return "";
  const pad = " ".repeat(indent);
  const rules = Object.entries(RULE_ELEMENTS)
    .map(([key, elementName]) => {
      const rule = control[key as keyof typeof RULE_ELEMENTS] as RuleConfig | undefined;
      if (!rule?.enabled) return "";
      const attrs =
        key === "repetition"
          ? Object.entries(control.repetitionAttributes ?? {})
              .map(([name, value]) => ` flowable:${name}="${esc(value)}"`)
              .join("")
          : "";
      // A rule with no condition is unconditional, which is the common case and the
      // reason the element is self-closing rather than carrying an empty condition.
      return rule.condition
        ? `${pad}  <${elementName}${attrs}>\n${pad}    <condition><![CDATA[${rule.condition}]]></condition>\n${pad}  </${elementName}>`
        : `${pad}  <${elementName}${attrs} />`;
    })
    .filter(Boolean)
    .join("\n");

  return rules ? `${pad}<${tag}>\n${rules}\n${pad}</${tag}>` : "";
}

function readSentries(planItem: Element, container: Element, kind: string): Sentry[] {
  return childrenByLocalName(planItem, kind).map((criterion) => {
    const sentryRef = criterion.getAttribute("sentryRef");
    const sentry = sentryRef
      ? childrenByLocalName(container, "sentry").find((s) => s.getAttribute("id") === sentryRef)
      : undefined;
    const ifPart = sentry ? firstByLocalName(sentry, "ifPart") : undefined;
    return {
      id: criterion.getAttribute("id") ?? sentryRef ?? crypto.randomUUID(),
      onParts: sentry
        ? childrenByLocalName(sentry, "planItemOnPart")
            .map((part) => ({
              sourceRef: part.getAttribute("sourceRef") ?? "",
              standardEvent:
                firstByLocalName(part, "standardEvent")?.textContent?.trim() || "complete",
            }))
            .filter((part) => part.sourceRef !== "")
        : [],
      // `caseFileItemOnPart` and anything else: not editable here, but not destroyed.
      extraSentryChildren: sentry
        ? rawChildrenExcept(sentry, ["planItemOnPart", "ifPart"])
        : [],
      ifPart: ifPart
        ? firstByLocalName(ifPart, "condition")?.textContent?.trim() || undefined
        : undefined,
      exitEventType:
        criterion.getAttributeNS(FLOWABLE_CMMN_NS, "exitEventType") ||
        criterion.getAttribute("flowable:exitEventType") ||
        undefined,
      exitType:
        criterion.getAttributeNS(FLOWABLE_CMMN_NS, "exitType") ||
        criterion.getAttribute("flowable:exitType") ||
        undefined,
    };
  });
}

/**
 * The definition a plan item points at, searched outwards from its own container.
 *
 * A `<planFragment>` holds plan items and sentries but, per the schema, **not** plan item
 * definitions — `tPlanFragment` has no `planItemDefinition` in its content model, while
 * `tStage` adds one. So a plan item inside a fragment references a definition declared in
 * the enclosing stage, and looking only at the immediate container finds nothing and drops
 * the element from the diagram entirely.
 */
function findDefinition(container: Element, id: string): Element | undefined {
  for (let scope: Element | null = container; scope; scope = scope.parentElement) {
    const found = Array.from(scope.children).find(
      (child) => child.getAttribute("id") === id && typeOf(child) !== null,
    );
    if (found) return found;
    // Stop at the case: beyond it is `<definitions>`, whose children are other cases.
    if (scope.localName === "case") break;
  }
  return undefined;
}

/**
 * Which kind of plan item a definition element is.
 *
 * Takes the element rather than its tag name because two tags carry more than one kind.
 * `<task>` is a service task unless `flowable:type` says otherwise, and `<eventListener>`
 * is the generic listener unless `flowable:eventType` names one of the four typed ones.
 *
 * Note the namespace on those discriminators. An earlier version of this file recorded
 * that typed listeners "cannot be expressed in a deployable document" because the schema
 * rejects `eventType` — true of the *un-prefixed* attribute, and only that one. The CMMN
 * schema's `anyAttribute` is `##other`, so `flowable:eventType` is legal, and Flowable's
 * own `signal-event-listener.cmmn` fixture uses exactly that and validates.
 */
function typeOf(definition: Element): CmmnElementType | null {
  const localName = definition.localName;
  switch (localName) {
    case "humanTask":
    case "processTask":
    case "caseTask":
    case "decisionTask":
    case "serviceTask":
    case "milestone":
    case "stage":
    case "planFragment":
      return localName;
    case "timerEventListener":
      return "timerEventListener";
    case "userEventListener":
      return "userEventListener";
    case "eventListener":
      return byDiscriminator(definition, "eventType", LISTENER_TYPE_DISCRIMINATOR)
        ?? "genericEventListener";
    // A plain <task> is a service task; the engine treats it as non-blocking work.
    case "task":
      return byDiscriminator(definition, "type", TASK_TYPE_DISCRIMINATOR) ?? "serviceTask";
    default:
      return null;
  }
}

/** The editor type whose discriminator matches this element's, if any. */
function byDiscriminator(
  definition: Element,
  attribute: string,
  table: Partial<Record<CmmnElementType, string>>,
): CmmnElementType | null {
  const value =
    definition.getAttributeNS(FLOWABLE_CMMN_NS, attribute) ||
    definition.getAttribute(`flowable:${attribute}`) ||
    "";
  if (!value) return null;

  const match = Object.entries(table).find(([, discriminator]) => discriminator === value);
  return match ? (match[0] as CmmnElementType) : null;
}

/**
 * The `flowable:type` / `flowable:eventType` discriminator is `element.type` here, so it is
 * dropped from the attribute map.
 *
 * Keeping it in both places would mean serialising it twice, and — worse — letting the two
 * disagree: a task whose `type` said one thing and whose attribute said another would draw
 * as one kind and deploy as the other.
 */
function withoutDiscriminator(
  attributes: Record<string, string>,
  type: CmmnElementType,
): Record<string, string> {
  const key = type in TASK_TYPE_DISCRIMINATOR
    ? "type"
    : type in LISTENER_TYPE_DISCRIMINATOR
      ? "eventType"
      : null;
  if (!key) return attributes;

  const { [key]: _discriminator, ...rest } = attributes;
  return rest;
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

/**
 * The first *direct child* with this name.
 *
 * Distinct from {@link firstByLocalName}, which searches descendants — fine for finding a
 * `<timerExpression>` somewhere under a listener, wrong for anything an element and its
 * children both have. `<documentation>` is exactly that: reading it with a descendant
 * search gave a case the documentation of the first task inside it, and would have given a
 * stage the documentation of the first task inside *it*.
 */
function firstChildByLocalName(parent: Element, localName: string): Element | undefined {
  return childrenByLocalName(parent, localName)[0];
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

  const namespaces = Object.entries(model.extraNamespaces ?? {})
    .map(([name, uri]) => `\n             ${name}="${esc(uri)}"`)
    .join("");
  const rootAttrs = Object.entries(model.rootAttributes ?? {})
    .map(([name, value]) => `\n             ${name}="${esc(value)}"`)
    .join("");
  const caseAttrs = attributeXml(model.caseAttributes, model.casePlainAttributes);
  const planModelAttrs = attributeXml(model.planModelAttributes, model.planModelPlainAttributes);
  const extraCase = indentBlock(model.extraCaseChildren ?? [], 4);
  const extraPlanModel = indentBlock(model.extraPlanModelChildren ?? [], 6);
  const extraRoots = indentBlock(model.extraRootChildren ?? [], 2);
  const edges = indentBlock(model.diEdges ?? [], 6);

  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="${CMMN_NS}"
             xmlns:flowable="${FLOWABLE_CMMN_NS}"
             xmlns:cmmndi="${CMMNDI_NS}"
             xmlns:dc="${DC_NS}"${namespaces}
             targetNamespace="http://flowable.org/cmmn"${rootAttrs}>
  <case id="${esc(model.caseId)}" name="${esc(model.caseName)}"${caseAttrs}>
${model.documentation ? `    <documentation>${esc(model.documentation)}</documentation>\n` : ""}    <casePlanModel id="${esc(model.planModelId)}" name="${esc(model.planModelName)}"${planModelAttrs}>
${body}${extraPlanModel}    </casePlanModel>
${extraCase}  </case>
${extraRoots}  <cmmndi:CMMNDI>
    <cmmndi:CMMNDiagram id="CMMNDiagram_${esc(model.caseId)}">
${shapes}
${edges}    </cmmndi:CMMNDiagram>
  </cmmndi:CMMNDI>
</definitions>
`;
}

/**
 * Attributes for one element: `flowable:`-prefixed ones and unprefixed ones.
 *
 * The split is the whole point. `processRef` and friends are read by the engine with a
 * null namespace, so prefixing them produces an attribute it never looks at.
 */
function attributeXml(
  flowable: Record<string, string> | undefined,
  plain: Record<string, string> | undefined,
): string {
  const prefixed = Object.entries(flowable ?? {})
    .map(([key, value]) => ` flowable:${key}="${esc(value)}"`)
    .join("");
  const bare = Object.entries(plain ?? {})
    .map(([key, value]) => ` ${key}="${esc(value)}"`)
    .join("");
  return prefixed + bare;
}

/** Re-emits preserved raw XML at the right indentation, or nothing when there is none. */
function indentBlock(chunks: string[], indent: number): string {
  if (chunks.length === 0) return "";
  const pad = " ".repeat(indent);
  return chunks.map((chunk) => `${pad}${chunk}`).join("\n") + "\n";
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
  /**
   * Whether this container may declare plan item definitions.
   *
   * A stage and the case plan model may; a plan fragment may not — the schema gives it
   * `planItem` and `sentry` only. So a fragment's definitions are written by the nearest
   * enclosing stage instead, which is what {@link definitionsOwnedBy} collects.
   */
  declaresDefinitions = true,
): string {
  const planItems = elements.map((el) => renderPlanItem(el, indent)).join("\n");
  const sentries = renderSentries(elements, model, indent);
  const definitions = declaresDefinitions
    ? definitionsOwnedBy(elements, model)
        .map((el) => renderDefinition(el, model, indent))
        .join("\n")
    : "";
  return [planItems, sentries.trimEnd(), definitions]
    .filter((part) => part.length > 0)
    .join("\n") + "\n";
}

/**
 * The definitions a stage has to declare: its own children's, plus those of everything
 * inside any plan fragment beneath it, however deep.
 *
 * Nested stages stop the walk — a stage declares its own.
 */
function definitionsOwnedBy(children: CmmnElement[], model: CmmnCase): CmmnElement[] {
  const owned: CmmnElement[] = [];
  const walk = (elements: CmmnElement[]) => {
    for (const element of elements) {
      owned.push(element);
      if (element.type !== "planFragment") continue;
      walk(model.elements.filter((el) => el.parentId === element.planItemId));
    }
  };
  walk(children);
  return owned;
}

function renderPlanItem(element: CmmnElement, indent: number): string {
  const pad = " ".repeat(indent);
  /*
   * Order matters to the CMMN schema: `itemControl` comes before the criteria, and a
   * document with them the other way round is rejected outright.
   */
  const body = [
    renderItemControl(element.itemControl, indent + 2),
    ...element.entrySentries.map(
      (s) => `${pad}  <entryCriterion id="${esc(s.id)}" sentryRef="sentry_${esc(s.id)}" />`,
    ),
    ...element.exitSentries.map(
      (s) =>
        `${pad}  <exitCriterion id="${esc(s.id)}" sentryRef="sentry_${esc(s.id)}"${
          s.exitType ? ` flowable:exitType="${esc(s.exitType)}"` : ""
        }${
          s.exitEventType ? ` flowable:exitEventType="${esc(s.exitEventType)}"` : ""
        } />`,
    ),
    ...(element.extraPlanItemChildren ?? []).map((chunk) => `${pad}  ${chunk}`),
  ]
    .filter(Boolean)
    .join("\n");

  const open = `${pad}<planItem id="${esc(element.planItemId)}" name="${esc(element.name)}" definitionRef="${esc(element.definitionId)}"`;
  return body ? `${open}>\n${body}\n${pad}</planItem>` : `${open} />`;
}

/**
 * The XML element name for a plan item definition type.
 *
 * Nearly all of them match, but **CMMN has no `<serviceTask>`**: the schema defines
 * `<task>`, and Flowable distinguishes a service task by `flowable:class`,
 * `flowable:expression` or `flowable:type` on it. Emitting `<serviceTask>` produced a
 * document the engine rejected outright — "Invalid content was found starting with element
 * serviceTask" — so no case containing one could ever be deployed. The parser already read
 * `<task>` as a service task; only the serialiser disagreed.
 */
/** The element's `flowable:` attributes, with the kind discriminator written back on. */
function withDiscriminator(element: CmmnElement): Record<string, string> {
  const task = TASK_TYPE_DISCRIMINATOR[element.type];
  if (task) return { ...element.attributes, type: task };

  const listener = LISTENER_TYPE_DISCRIMINATOR[element.type];
  if (listener) return { ...element.attributes, eventType: listener };

  return element.attributes;
}

function xmlElementName(type: CmmnElementType): string {
  if (type === "serviceTask" || type in TASK_TYPE_DISCRIMINATOR) return "task";
  if (type === "genericEventListener" || type in LISTENER_TYPE_DISCRIMINATOR) {
    return "eventListener";
  }
  return type;
}

function renderDefinition(element: CmmnElement, model: CmmnCase, indent: number): string {
  const pad = " ".repeat(indent);
  const attrs = attributeXml(withDiscriminator(element), element.plainAttributes);
  const extra = indentBlock(element.extraChildren ?? [], indent + 2);

  /*
   * `tCmmnElement`'s sequence is documentation, then extensionElements, then whatever the
   * subtype adds. Emitting it anywhere else parses fine and fails schema validation, which
   * is the gate a deployment runs first.
   */
  const documentation = element.documentation?.trim()
    ? `${" ".repeat(indent + 2)}<documentation>${esc(element.documentation.trim())}</documentation>\n`
    : "";

  if (CONTAINER_TYPES.has(element.type)) {
    const tag = element.type;
    const children = model.elements.filter((el) => el.parentId === element.planItemId);
    const inner = renderContainerBody(children, model, indent + 2, element.type !== "planFragment");
    return `${pad}<${tag} id="${esc(element.definitionId)}" name="${esc(element.name)}"${attrs}>
${documentation}${renderDefaultControl(element, indent + 2)}${inner}${extra}${pad}</${tag}>`;
  }

  const timer =
    element.type === "timerEventListener" && element.timerExpression
      ? `${" ".repeat(indent + 2)}<timerExpression>${esc(element.timerExpression)}</timerExpression>\n`
      : "";

  const tag = xmlElementName(element.type);
  const head =
    element.type === "milestone" || element.type.endsWith("EventListener")
      ? `${pad}<${tag} id="${esc(element.definitionId)}" name="${esc(element.name)}"${attrs}`
      : `${pad}<${tag} id="${esc(element.definitionId)}" name="${esc(element.name)}" isBlocking="${element.blocking !== false}"${attrs}`;

  /*
   * Preserved children force the open/close form. A timer event listener is the case that
   * matters: its `<timerExpression>` is a child, and self-closing the element dropped the
   * schedule — leaving a timer that never fires.
   */
  const extensions = renderExtensionElements(element, indent + 2);
  /*
   * The schema's order: documentation and extensionElements come from `tCmmnElement`,
   * `defaultControl` from `tPlanItemDefinition`, and only then whatever the subtype adds.
   * All three parse fine in any order and fail validation in the wrong one.
   */
  const children =
    documentation +
    (extensions ? extensions + "\n" : "") +
    renderDefaultControl(element, indent + 2) +
    timer +
    extra;
  return children ? `${head}>\n${children}${pad}</${tag}>` : `${head} />`;
}

function renderEventParameters(
  parameters: EventParameter[] | undefined,
  localName: string,
  pad: string,
): string[] {
  return (parameters ?? [])
    // A mapping with neither end named does nothing, and the engine reads it as a mapping.
    .filter((parameter) => (parameter.source ?? parameter.sourceExpression ?? "").trim() !== "")
    .map((parameter) => {
      const attributes = [
        parameter.source?.trim() ? ` source="${esc(parameter.source.trim())}"` : "",
        parameter.sourceExpression?.trim()
          ? ` sourceExpression="${esc(parameter.sourceExpression.trim())}"`
          : "",
        parameter.target?.trim() ? ` target="${esc(parameter.target.trim())}"` : "",
        parameter.targetType?.trim() ? ` targetType="${esc(parameter.targetType.trim())}"` : "",
        parameter.transient ? ` transient="true"` : "",
      ].join("");
      return `${pad}  <flowable:${localName}${attributes} />`;
    });
}

/** Sentries are declared as siblings of the plan items that reference them. */
function renderSentries(elements: CmmnElement[], model: CmmnCase, indent: number): string {
  const pad = " ".repeat(indent);
  const all = elements.flatMap((el) => [...el.entrySentries, ...el.exitSentries]);
  if (all.length === 0) return "";

  return (
    all
      .map((sentry) => {
        /*
         * Only parts whose source still exists. A sentry pointing at a deleted plan item
         * serialises a dangling `sourceRef`, which the engine rejects at deployment.
         */
        const parts = (sentry.onParts ?? []).filter((part) =>
          model.elements.some((el) => el.planItemId === part.sourceRef),
        );
        const onPart = parts
          .map(
            (part, index) =>
              `\n${pad}  <planItemOnPart id="onPart_${esc(sentry.id)}_${index}" sourceRef="${esc(part.sourceRef)}">\n${pad}    <standardEvent>${esc(part.standardEvent || "complete")}</standardEvent>\n${pad}  </planItemOnPart>`,
          )
          .join("");
        const extras = (sentry.extraSentryChildren ?? [])
          .map((chunk) => `\n${pad}  ${chunk}`)
          .join("");
        const ifPart = sentry.ifPart
          ? `\n${pad}  <ifPart>\n${pad}    <condition><![CDATA[${sentry.ifPart}]]></condition>\n${pad}  </ifPart>`
          : "";
        // `onPart` before `ifPart`: the schema declares them in that order.
        return `${pad}<sentry id="sentry_${esc(sentry.id)}">${onPart}${extras}${ifPart}\n${pad}</sentry>`;
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

/** Nothing preserved yet — a new case has no imported content to carry. */
type Preserved = Pick<
  CmmnCase,
  | "caseAttributes"
  | "casePlainAttributes"
  | "planModelAttributes"
  | "planModelPlainAttributes"
  | "extraCaseChildren"
  | "extraPlanModelChildren"
  | "extraRootChildren"
  | "diEdges"
  | "extraNamespaces"
  | "rootAttributes"
>;

export const EMPTY_PRESERVED: Preserved = {
  caseAttributes: {},
  casePlainAttributes: {},
  planModelAttributes: {},
  planModelPlainAttributes: {},
  extraCaseChildren: [],
  extraPlanModelChildren: [],
  extraRootChildren: [],
  diEdges: [],
  extraNamespaces: {},
  rootAttributes: {},
};

export function emptyCase(caseKey: string, caseName: string): CmmnCase {
  return {
    caseId: caseKey,
    caseName,
    planModelId: `${caseKey}_plan`,
    planModelName: caseName,
    planModelBounds: { x: 60, y: 60, width: 760, height: 440 },
    elements: [],
    ...EMPTY_PRESERVED,
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
    plainAttributes: {},
    extraChildren: [],
    extraPlanItemChildren: [],
    fields: [],
    lifecycleListeners: [],
    extraExtensionChildren: [],
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
      /*
       * Drop the on-parts that pointed at deleted elements, and only then drop a criterion
       * that has none left. Removing the whole criterion because one of its sources went
       * away would silently discard the others it still waits for.
       */
      .map((element) => ({
        ...element,
        entrySentries: withoutDoomedParts(element.entrySentries, doomed),
        exitSentries: withoutDoomedParts(element.exitSentries, doomed),
      })),
  };
}

function withoutDoomedParts(sentries: Sentry[], doomed: Set<string>): Sentry[] {
  return sentries
    .map((sentry) => ({
      ...sentry,
      onParts: (sentry.onParts ?? []).filter((part) => !doomed.has(part.sourceRef)),
    }))
    // A criterion with no parts and no guard waits for nothing, so it is not a criterion.
    .filter((sentry) => sentry.onParts.length > 0 || sentry.ifPart);
}

/** Which container a point falls in — innermost wins, else the plan model. */
export function containerAt(
  model: CmmnCase,
  point: { x: number; y: number },
  ignoreId?: string,
): string {
  const stages = model.elements
    .filter((el) => CONTAINER_TYPES.has(el.type) && el.planItemId !== ignoreId)
    // Smallest area first so a nested container beats its parent.
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
