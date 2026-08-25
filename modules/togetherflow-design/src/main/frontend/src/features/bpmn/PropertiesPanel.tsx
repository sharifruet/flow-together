/**
 * Flowable-aware properties panel.
 *
 * Purpose-built rather than using `bpmn-js-properties-panel`, which models Camunda's
 * extension namespace — the attribute names and namespace URI differ, so it would
 * write properties this engine ignores. See docs/ui/adr/0008-bpmn-dmn-modelers.md.
 */

import { TextInput } from "@togetherflow/common";
import type { BpmnElement } from "./useBpmnModeler";

export interface PropertiesPanelProps {
  element: BpmnElement | null;
  disabled?: boolean;
  onChange: (element: BpmnElement, properties: Record<string, unknown>) => void;
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
  key: string;
  label: string;
  hint?: string;
}

const USER_TASK: FieldSpec[] = [
  { key: "assignee", label: "Assignee", hint: "A user id, or an expression like ${initiator}." },
  { key: "candidateUsers", label: "Candidate users", hint: "Comma-separated user ids." },
  { key: "candidateGroups", label: "Candidate groups", hint: "Comma-separated group ids." },
  { key: "formKey", label: "Form key", hint: "Key of the form to render for this task." },
  { key: "dueDate", label: "Due date", hint: "An expression, e.g. ${dueDate}." },
];

const SERVICE_TASK: FieldSpec[] = [
  { key: "class", label: "Class", hint: "Fully-qualified JavaDelegate class name." },
  { key: "expression", label: "Expression" },
  { key: "delegateExpression", label: "Delegate expression" },
  { key: "resultVariableName", label: "Result variable" },
];

const PROCESS: FieldSpec[] = [
  { key: "candidateStarterUsers", label: "Candidate starter users" },
  { key: "candidateStarterGroups", label: "Candidate starter groups" },
];

function fieldsFor(type: string): FieldSpec[] {
  if (type === "bpmn:UserTask") return USER_TASK;
  if (type === "bpmn:ServiceTask" || type === "bpmn:SendTask") return SERVICE_TASK;
  if (type === "bpmn:Process") return PROCESS;
  return [];
}

export function PropertiesPanel({ element, disabled = false, onChange }: PropertiesPanelProps) {
  if (!element) {
    return (
      <aside className="tf-properties" aria-label="Element properties">
        <p className="tf-muted tf-properties__empty">
          Select an element on the canvas to edit its properties.
        </p>
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
    <aside className="tf-properties" aria-label="Element properties">
      <header className="tf-properties__header">
        <h2 className="tf-properties__title">{labelForType(type)}</h2>
        <p className="tf-properties__type">{type}</p>
      </header>

      <TextInput
        label="Id"
        value={String(business.id ?? "")}
        disabled={disabled}
        hint="Referenced by the engine and by other models."
        onChange={(event) => set("id", event.target.value)}
      />
      <TextInput
        label="Name"
        value={String(business.name ?? "")}
        disabled={disabled}
        onChange={(event) => set("name", event.target.value)}
      />

      {type === "bpmn:SequenceFlow" ? (
        <TextInput
          label="Condition"
          value={String(readCondition(business) ?? "")}
          disabled={disabled}
          hint="An expression, e.g. ${amount > 1000}. Leave blank for an unconditional flow."
          onChange={(event) => onChange(element, { conditionExpression: conditionOf(event.target.value) })}
        />
      ) : null}

      {extras.length > 0 ? (
        <section className="tf-properties__section">
          <h3 className="tf-properties__section-title">Flowable</h3>
          {extras.map((field) => (
            <TextInput
              key={field.key}
              label={field.label}
              hint={field.hint}
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
          Asynchronous
        </label>
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
