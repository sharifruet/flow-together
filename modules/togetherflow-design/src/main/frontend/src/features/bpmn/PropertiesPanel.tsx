/**
 * Flowable-aware properties panel.
 *
 * Purpose-built rather than using `bpmn-js-properties-panel`, which models Camunda's
 * extension namespace — the attribute names and namespace URI differ, so it would
 * write properties this engine ignores. See docs/ui/adr/0008-bpmn-dmn-modelers.md.
 */

import { Button, SelectInput, TextInput, useT, type TFunction } from "@togetherflow/common";
import type { BpmnElement } from "./useBpmnModeler";
import {
  EXECUTION_EVENTS,
  TASK_EVENTS,
  applyTimer,
  buildMultiInstance,
  isBoundaryEvent,
  readListeners,
  readMultiInstance,
  readTimer,
  supportsExecutionListeners,
  supportsMultiInstance,
  writeListeners,
  type ImplementationType,
  type ListenerKind,
  type ListenerRow,
  type ModdleFactory,
  type MultiInstanceConfig,
  type MultiInstanceMode,
  type TimerKind,
} from "./bpmnExtensions";

export interface PropertiesPanelProps {
  element: BpmnElement | null;
  disabled?: boolean;
  onChange: (element: BpmnElement, properties: Record<string, unknown>) => void;
  /**
   * Needed for the properties that are nested moddle objects rather than attributes —
   * listeners, multi-instance and timers. Without it those sections are not offered,
   * which is honest: they cannot be written.
   */
  moddle?: ModdleFactory | null;
}

/**
 * Which Flowable attributes make sense for which BPMN type.
 *
 * Keys are the **local** names, not `flowable:`-prefixed ones. Verified against
 * bpmn-moddle: a property declared in the extension descriptor is stored on the
 * business object under its local name and serialised back with the prefix. Using
 * the prefixed key here would read `undefined` and write into `$attrs`, producing
 * a value that round-trips to XML but never appears in the panel.
 */
interface FieldSpec {
  /** Also the message-key suffix: `properties.<key>` and `properties.<key>.hint`. */
  key: string;
  /** True where the field has explanatory copy under it. */
  hint?: boolean;
}

const USER_TASK: FieldSpec[] = [
  { key: "assignee", hint: true },
  { key: "candidateUsers", hint: true },
  { key: "candidateGroups", hint: true },
  { key: "formKey", hint: true },
  { key: "dueDate", hint: true },
];

const SERVICE_TASK: FieldSpec[] = [
  { key: "class", hint: true },
  { key: "expression" },
  { key: "delegateExpression" },
  { key: "resultVariableName" },
];

const PROCESS: FieldSpec[] = [
  { key: "candidateStarterUsers" },
  { key: "candidateStarterGroups" },
];

function fieldsFor(type: string): FieldSpec[] {
  if (type === "bpmn:UserTask") return USER_TASK;
  if (type === "bpmn:ServiceTask" || type === "bpmn:SendTask") return SERVICE_TASK;
  if (type === "bpmn:Process") return PROCESS;
  return [];
}

export function PropertiesPanel({
  element,
  disabled = false,
  onChange,
  moddle,
}: PropertiesPanelProps) {
  const t = useT();
  if (!element) {
    return (
      <aside className="tf-properties" aria-label={t("properties.label")}>
        <p className="tf-muted tf-properties__empty">{t("properties.selectAnElement")}</p>
      </aside>
    );
  }

  const business = element.businessObject;
  const type = business.$type;
  const extras = fieldsFor(type);

  const set = (key: string, value: string) =>
    // An empty string would serialise as an empty attribute; undefined removes it.
    onChange(element, { [key]: value.trim() === "" ? undefined : value });

  return (
    <aside className="tf-properties" aria-label={t("properties.label")}>
      <header className="tf-properties__header">
        <h2 className="tf-properties__title">{labelForType(type)}</h2>
        <p className="tf-properties__type">{type}</p>
      </header>

      <TextInput
        label={t("properties.id")}
        value={String(business.id ?? "")}
        disabled={disabled}
        hint={t("properties.id.hint")}
        onChange={(event) => set("id", event.target.value)}
      />
      <TextInput
        label={t("properties.name")}
        value={String(business.name ?? "")}
        disabled={disabled}
        onChange={(event) => set("name", event.target.value)}
      />

      {type === "bpmn:SequenceFlow" ? (
        <TextInput
          label={t("properties.condition")}
          value={String(readCondition(business) ?? "")}
          disabled={disabled}
          hint={t("properties.condition.hint")}
          onChange={(event) => onChange(element, { conditionExpression: conditionOf(event.target.value) })}
        />
      ) : null}

      {extras.length > 0 ? (
        <section className="tf-properties__section">
          <h3 className="tf-properties__section-title">{t("properties.flowable")}</h3>
          {extras.map((field) => (
            <TextInput
              key={field.key}
              label={t(`properties.${field.key}`)}
              hint={field.hint ? t(`properties.${field.key}.hint`) : undefined}
              value={String(business[field.key] ?? "")}
              disabled={disabled}
              onChange={(event) => set(field.key, event.target.value)}
            />
          ))}
        </section>
      ) : null}

      {isAsyncCapable(type) ? (
        <label className="tf-checkbox tf-checkbox--block">
          <input
            type="checkbox"
            checked={business.async === true}
            disabled={disabled}
            onChange={(event) => onChange(element, { async: event.target.checked || undefined })}
          />
          {t("properties.async")}
        </label>
      ) : null}

      {/*
        Everything below is a nested moddle object rather than an attribute (§7.4.2).
        Without the factory they cannot be written, so they are not offered — showing
        controls that silently do nothing would be worse than showing none.
      */}
      {moddle && isBoundaryEvent(type) ? (
        <BoundarySection
          t={t}
          element={element}
          moddle={moddle}
          disabled={disabled}
          onChange={onChange}
        />
      ) : null}

      {moddle && supportsMultiInstance(type) ? (
        <MultiInstanceSection
          t={t}
          element={element}
          moddle={moddle}
          disabled={disabled}
          onChange={onChange}
        />
      ) : null}

      {moddle && supportsExecutionListeners(type) ? (
        <ListenerSection
          t={t}
          kind="execution"
          element={element}
          moddle={moddle}
          disabled={disabled}
          onChange={onChange}
        />
      ) : null}

      {moddle && type === "bpmn:UserTask" ? (
        <ListenerSection
          t={t}
          kind="task"
          element={element}
          moddle={moddle}
          disabled={disabled}
          onChange={onChange}
        />
      ) : null}
    </aside>
  );
}

/**
 * A sequence flow condition is a nested element, not an attribute, so it needs a
 * moddle object rather than a plain string.
 */
function conditionOf(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return {
    $type: "bpmn:FormalExpression",
    body: trimmed,
  };
}

function readCondition(business: Record<string, unknown>): string | undefined {
  const condition = business.conditionExpression as { body?: string } | undefined;
  return condition?.body;
}

function isAsyncCapable(type: string): boolean {
  return (
    type.endsWith("Task") ||
    type === "bpmn:CallActivity" ||
    type === "bpmn:SubProcess" ||
    type.endsWith("Gateway")
  );
}

export function labelForType(type: string): string {
  const bare = type.replace(/^bpmn:/, "");
  return bare.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/* ── Sections for the nested (non-attribute) properties, §7.4.2 ─────────────── */

interface SectionProps {
  t: TFunction;
  element: BpmnElement;
  moddle: ModdleFactory;
  disabled: boolean;
  onChange: (element: BpmnElement, properties: Record<string, unknown>) => void;
}

/**
 * Execution and task listeners.
 *
 * Edited as whole rows rather than field by field: a listener is only meaningful with
 * an event and an implementation together, and writing a half-built one to the model on
 * every keystroke would leave the diagram briefly invalid.
 */
function ListenerSection({
  t,
  kind,
  element,
  moddle,
  disabled,
  onChange,
}: SectionProps & { kind: ListenerKind }) {
  const rows = readListeners(element.businessObject, kind);
  const events = kind === "execution" ? EXECUTION_EVENTS : TASK_EVENTS;

  const commit = (next: ListenerRow[]) =>
    onChange(element, {
      extensionElements: writeListeners(moddle, element.businessObject, kind, next),
    });

  const update = (index: number, patch: Partial<ListenerRow>) =>
    commit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <section className="tf-properties__section">
      <h3 className="tf-properties__section-title">{t(`properties.listeners.${kind}`)}</h3>
      <p className="tf-muted tf-properties__hint">{t(`properties.listeners.${kind}.hint`)}</p>

      {rows.length === 0 ? (
        <p className="tf-muted">{t("properties.listeners.none")}</p>
      ) : (
        <ul className="tf-properties__rows">
          {rows.map((row, index) => (
            <li className="tf-properties__row" key={index}>
              <SelectInput
                label={t("properties.listeners.event")}
                value={row.event}
                disabled={disabled}
                onChange={(event) => update(index, { event: event.target.value })}
              >
                {events.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                label={t("properties.listeners.implementation")}
                value={row.implementationType}
                disabled={disabled}
                onChange={(event) =>
                  update(index, { implementationType: event.target.value as ImplementationType })
                }
              >
                <option value="class">{t("properties.class")}</option>
                <option value="expression">{t("properties.expression")}</option>
                <option value="delegateExpression">{t("properties.delegateExpression")}</option>
              </SelectInput>
              <TextInput
                label={t("properties.listeners.value")}
                value={row.value}
                disabled={disabled}
                onChange={(event) => update(index, { value: event.target.value })}
              />
              <Button
                variant="ghost"
                disabled={disabled}
                aria-label={t("properties.listeners.remove", { index: index + 1 })}
                onClick={() => commit(rows.filter((_, i) => i !== index))}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() =>
          commit([...rows, { event: events[0], implementationType: "class", value: "" }])
        }
      >
        {t("properties.listeners.add")}
      </Button>
    </section>
  );
}

const MULTI_INSTANCE_MODES: MultiInstanceMode[] = ["none", "parallel", "sequential"];

function MultiInstanceSection({ t, element, moddle, disabled, onChange }: SectionProps) {
  const config = readMultiInstance(element.businessObject);

  const commit = (next: MultiInstanceConfig) =>
    onChange(element, { loopCharacteristics: buildMultiInstance(moddle, next) });

  return (
    <section className="tf-properties__section">
      <h3 className="tf-properties__section-title">{t("properties.multiInstance")}</h3>
      <SelectInput
        label={t("properties.multiInstance.mode")}
        value={config.mode}
        disabled={disabled}
        hint={t("properties.multiInstance.hint")}
        onChange={(event) => commit({ ...config, mode: event.target.value as MultiInstanceMode })}
      >
        {MULTI_INSTANCE_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {t(`properties.multiInstance.${mode}`)}
          </option>
        ))}
      </SelectInput>

      {/* The rest is meaningless without a loop, so it appears only once there is one. */}
      {config.mode !== "none" ? (
        <>
          <TextInput
            label={t("properties.multiInstance.collection")}
            value={config.collection}
            disabled={disabled}
            hint={t("properties.multiInstance.collection.hint")}
            onChange={(event) => commit({ ...config, collection: event.target.value })}
          />
          <TextInput
            label={t("properties.multiInstance.elementVariable")}
            value={config.elementVariable}
            disabled={disabled}
            hint={t("properties.multiInstance.elementVariable.hint")}
            onChange={(event) => commit({ ...config, elementVariable: event.target.value })}
          />
          <TextInput
            label={t("properties.multiInstance.cardinality")}
            value={config.cardinality}
            disabled={disabled}
            hint={t("properties.multiInstance.cardinality.hint")}
            onChange={(event) => commit({ ...config, cardinality: event.target.value })}
          />
          <TextInput
            label={t("properties.multiInstance.completionCondition")}
            value={config.completionCondition}
            disabled={disabled}
            hint={t("properties.multiInstance.completionCondition.hint")}
            onChange={(event) => commit({ ...config, completionCondition: event.target.value })}
          />
        </>
      ) : null}
    </section>
  );
}

const TIMER_KINDS: TimerKind[] = ["duration", "date", "cycle"];

/**
 * Boundary event configuration: whether it interrupts, and — for a timer — when it fires.
 *
 * Only timers get an expression editor. The other boundary types (error, signal, message)
 * reference a definition declared at the process level, which is a different piece of
 * scope; offering an empty box for them would suggest otherwise.
 */
function BoundarySection({ t, element, moddle, disabled, onChange }: SectionProps) {
  const business = element.businessObject;
  const timer = readTimer(business);
  // BPMN's default is interrupting, and the attribute is absent rather than true.
  const interrupting = business.cancelActivity !== false;

  return (
    <section className="tf-properties__section">
      <h3 className="tf-properties__section-title">{t("properties.boundary")}</h3>

      <label className="tf-checkbox tf-checkbox--block">
        <input
          type="checkbox"
          checked={interrupting}
          disabled={disabled}
          onChange={(event) =>
            // Written as an explicit false rather than removed: the absent attribute
            // means interrupting, so clearing it would flip the meaning back.
            onChange(element, { cancelActivity: event.target.checked ? undefined : false })
          }
        />
        {t("properties.boundary.interrupting")}
      </label>
      <p className="tf-muted tf-properties__hint">{t("properties.boundary.interrupting.hint")}</p>

      {timer ? (
        <>
          <SelectInput
            label={t("properties.timer.kind")}
            value={timer.kind}
            disabled={disabled}
            onChange={(event) =>
              onChange(element, {
                eventDefinitions: applyTimer(moddle, business, {
                  kind: event.target.value as TimerKind,
                  value: timer.value,
                }),
              })
            }
          >
            {TIMER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`properties.timer.${kind}`)}
              </option>
            ))}
          </SelectInput>
          <TextInput
            label={t("properties.timer.value")}
            value={timer.value}
            disabled={disabled}
            hint={t(`properties.timer.${timer.kind}.hint`)}
            onChange={(event) =>
              onChange(element, {
                eventDefinitions: applyTimer(moddle, business, {
                  kind: timer.kind,
                  value: event.target.value,
                }),
              })
            }
          />
        </>
      ) : null}
    </section>
  );
}
