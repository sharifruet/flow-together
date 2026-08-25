/**
 * Reading and writing the parts of a Flowable BPMN model that are not plain attributes
 * (REQUIREMENTS.md §7.4.2: "execution/service listeners, extension elements the engine
 * already supports").
 *
 * Listeners, multi-instance configuration and timer definitions are nested moddle
 * objects, not `flowable:` attributes, so `modeling.updateProperties` cannot set them
 * from a string. They have to be constructed through the moddle factory and handed over
 * as whole objects.
 *
 * Kept here as pure functions over a minimal factory interface so the shape of what gets
 * written is unit-testable without standing up bpmn-js — the previous properties panel
 * covered only attributes precisely because this layer did not exist.
 */

/** The slice of moddle this module needs; bpmn-js's `moddle` satisfies it. */
export interface ModdleFactory {
  create: (type: string, properties?: Record<string, unknown>) => ModdleElement;
}

export interface ModdleElement {
  $type: string;
  [key: string]: unknown;
}

interface BusinessObject {
  $type: string;
  extensionElements?: { values?: ModdleElement[] } | null;
  loopCharacteristics?: ModdleElement | null;
  eventDefinitions?: ModdleElement[] | null;
  [key: string]: unknown;
}

/* ── Listeners ─────────────────────────────────────────────────────────────── */

export type ListenerKind = "execution" | "task";

/** How the listener names its code. Flowable accepts exactly one of the three. */
export type ImplementationType = "class" | "expression" | "delegateExpression";

export interface ListenerRow {
  /** `start`/`end` for execution listeners; `create`/`assignment`/`complete`/`delete` for task. */
  event: string;
  implementationType: ImplementationType;
  value: string;
}

export const EXECUTION_EVENTS = ["start", "end", "take"] as const;
export const TASK_EVENTS = ["create", "assignment", "complete", "delete"] as const;

const LISTENER_TYPE: Record<ListenerKind, string> = {
  execution: "flowable:ExecutionListener",
  task: "flowable:TaskListener",
};

const IMPLEMENTATION_TYPES: ImplementationType[] = ["class", "expression", "delegateExpression"];

export function readListeners(businessObject: BusinessObject, kind: ListenerKind): ListenerRow[] {
  const values = businessObject.extensionElements?.values ?? [];
  return values
    .filter((value) => value.$type === LISTENER_TYPE[kind])
    .map((listener) => {
      // A listener declares exactly one implementation; the first present one wins, and
      // a malformed listener with none still round-trips as an empty value rather than
      // being silently dropped.
      const implementationType =
        IMPLEMENTATION_TYPES.find((candidate) => typeof listener[candidate] === "string") ?? "class";
      return {
        event: String(listener.event ?? ""),
        implementationType,
        value: String(listener[implementationType] ?? ""),
      };
    });
}

/**
 * Rebuilds `extensionElements` with `kind`'s listeners replaced by `rows`.
 *
 * Everything else under `extensionElements` is carried across untouched — form
 * properties, the other listener kind, anything a model brought with it that this editor
 * does not understand. Dropping those would quietly delete parts of a model on save,
 * which is the failure the moddle descriptor exists to prevent in the first place.
 *
 * Returns `undefined` when nothing is left, so the element is written without an empty
 * `<extensionElements/>`.
 */
export function writeListeners(
  factory: ModdleFactory,
  businessObject: BusinessObject,
  kind: ListenerKind,
  rows: ListenerRow[],
): ModdleElement | undefined {
  const existing = businessObject.extensionElements?.values ?? [];
  const others = existing.filter((value) => value.$type !== LISTENER_TYPE[kind]);

  const listeners = rows
    // A listener with no implementation is not something the engine can run.
    .filter((row) => row.value.trim() !== "")
    .map((row) =>
      factory.create(LISTENER_TYPE[kind], {
        event: row.event,
        [row.implementationType]: row.value.trim(),
      }),
    );

  const values = [...others, ...listeners];
  if (values.length === 0) return undefined;
  return factory.create("bpmn:ExtensionElements", { values });
}

/* ── Multi-instance ────────────────────────────────────────────────────────── */

export type MultiInstanceMode = "none" | "parallel" | "sequential";

export interface MultiInstanceConfig {
  mode: MultiInstanceMode;
  /** Expression naming the collection to iterate, e.g. `${approvers}`. */
  collection: string;
  /** Variable each element is bound to inside the loop. */
  elementVariable: string;
  /** Fixed instance count, as an alternative to a collection. */
  cardinality: string;
  /** Expression that ends the loop early, e.g. `${nrOfCompletedInstances >= 2}`. */
  completionCondition: string;
}

export const NO_MULTI_INSTANCE: MultiInstanceConfig = {
  mode: "none",
  collection: "",
  elementVariable: "",
  cardinality: "",
  completionCondition: "",
};

function expressionBody(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return String((value as { body?: unknown }).body ?? "");
}

export function readMultiInstance(businessObject: BusinessObject): MultiInstanceConfig {
  const loop = businessObject.loopCharacteristics;
  if (!loop || loop.$type !== "bpmn:MultiInstanceLoopCharacteristics") return NO_MULTI_INSTANCE;

  return {
    // BPMN models this as a boolean; the UI offers it as a mode because "parallel" and
    // "sequential" are what a modeller is actually choosing between.
    mode: loop.isSequential === true ? "sequential" : "parallel",
    collection: String(loop.collection ?? ""),
    elementVariable: String(loop.elementVariable ?? ""),
    cardinality: expressionBody(loop.loopCardinality),
    completionCondition: expressionBody(loop.completionCondition),
  };
}

/** Returns `undefined` for mode `none`, which clears the loop characteristics. */
export function buildMultiInstance(
  factory: ModdleFactory,
  config: MultiInstanceConfig,
): ModdleElement | undefined {
  if (config.mode === "none") return undefined;

  const properties: Record<string, unknown> = { isSequential: config.mode === "sequential" };
  if (config.collection.trim()) properties.collection = config.collection.trim();
  if (config.elementVariable.trim()) properties.elementVariable = config.elementVariable.trim();
  if (config.cardinality.trim()) {
    properties.loopCardinality = factory.create("bpmn:FormalExpression", {
      body: config.cardinality.trim(),
    });
  }
  if (config.completionCondition.trim()) {
    properties.completionCondition = factory.create("bpmn:FormalExpression", {
      body: config.completionCondition.trim(),
    });
  }
  return factory.create("bpmn:MultiInstanceLoopCharacteristics", properties);
}

/** Multi-instance applies to activities, not to events or gateways. */
export function supportsMultiInstance(type: string): boolean {
  return (
    type.endsWith("Task") ||
    type === "bpmn:SubProcess" ||
    type === "bpmn:CallActivity" ||
    type === "bpmn:Transaction"
  );
}

/* ── Timer event definitions ───────────────────────────────────────────────── */

export type TimerKind = "duration" | "date" | "cycle";

const TIMER_PROPERTY: Record<TimerKind, string> = {
  duration: "timeDuration",
  date: "timeDate",
  cycle: "timeCycle",
};

export interface TimerConfig {
  kind: TimerKind;
  /** ISO-8601 duration/date/repeating interval, or an expression producing one. */
  value: string;
}

export function readTimer(businessObject: BusinessObject): TimerConfig | null {
  const definition = (businessObject.eventDefinitions ?? []).find(
    (candidate) => candidate.$type === "bpmn:TimerEventDefinition",
  );
  if (!definition) return null;

  for (const kind of Object.keys(TIMER_PROPERTY) as TimerKind[]) {
    const value = definition[TIMER_PROPERTY[kind]];
    if (value) return { kind, value: expressionBody(value) };
  }
  // A timer with no expression yet — the element exists but is unconfigured.
  return { kind: "duration", value: "" };
}

/**
 * Rebuilds `eventDefinitions` with the timer's expression replaced.
 *
 * Only the chosen kind is written: a timer carrying both a duration and a cycle is
 * ambiguous, and the engine's behaviour on one is not worth guessing at.
 */
export function applyTimer(
  factory: ModdleFactory,
  businessObject: BusinessObject,
  config: TimerConfig,
): ModdleElement[] {
  const definitions = businessObject.eventDefinitions ?? [];
  return definitions.map((definition) => {
    if (definition.$type !== "bpmn:TimerEventDefinition") return definition;

    const rebuilt: Record<string, unknown> = {};
    if (config.value.trim()) {
      rebuilt[TIMER_PROPERTY[config.kind]] = factory.create("bpmn:FormalExpression", {
        body: config.value.trim(),
      });
    }
    return factory.create("bpmn:TimerEventDefinition", rebuilt);
  });
}

/** True for a boundary event that can be made interrupting or not. */
export function isBoundaryEvent(type: string): boolean {
  return type === "bpmn:BoundaryEvent";
}

/** Elements that can carry execution listeners: flow nodes, sequence flows and the process. */
export function supportsExecutionListeners(type: string): boolean {
  if (type === "bpmn:Process" || type === "bpmn:SequenceFlow") return true;
  return (
    type.endsWith("Task") ||
    type.endsWith("Event") ||
    type.endsWith("Gateway") ||
    type === "bpmn:SubProcess" ||
    type === "bpmn:CallActivity" ||
    type === "bpmn:Transaction"
  );
}
