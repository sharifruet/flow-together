/**
 * Form value handling: initial values, validation, and conversion to the typed
 * RestVariable payload the engine expects on task completion / process start.
 *
 * The renderer is Flowable-schema-native rather than an adapter over a foreign
 * schema — see docs/ui/adr/0007-flowable-native-form-renderer.md.
 */

import type {
  FormContainerField,
  FormField,
  FormModelResponse,
  OptionFormField,
  RestVariable,
} from "../api/types";

/** Field types that carry no value — layout and display only. */
const PRESENTATIONAL: ReadonlySet<string> = new Set([
  "container",
  "spacer",
  "horizontal-line",
  "headline",
  "headline-with-line",
  "hyperlink",
]);

/** Field types the engine computes; the UI shows them but never submits them. */
const ENGINE_COMPUTED: ReadonlySet<string> = new Set(["expression"]);

export type FormValues = Record<string, unknown>;

export function isContainer(field: FormField): field is FormContainerField {
  return field.fieldType === "FormContainer" || field.type === "container";
}

export function isOptionField(field: FormField): field is OptionFormField {
  return (
    field.fieldType === "OptionFormField" ||
    field.type === "dropdown" ||
    field.type === "radio-buttons"
  );
}

export function isPresentational(field: FormField): boolean {
  return PRESENTATIONAL.has(field.type) && !isContainer(field);
}

export function isSubmittable(field: FormField): boolean {
  return (
    !isContainer(field) &&
    !PRESENTATIONAL.has(field.type) &&
    !ENGINE_COMPUTED.has(field.type)
  );
}

/** Depth-first walk that flattens container rows/columns into a field list. */
export function flattenFields(fields: FormField[] | undefined): FormField[] {
  const out: FormField[] = [];
  for (const field of fields ?? []) {
    if (isContainer(field)) {
      for (const row of field.fields ?? []) {
        out.push(...flattenFields(row));
      }
    } else {
      out.push(field);
    }
  }
  return out;
}

export function initialValues(model: FormModelResponse): FormValues {
  const values: FormValues = {};
  for (const field of flattenFields(model.fields)) {
    if (!isSubmittable(field)) continue;
    values[field.id] = normaliseInitial(field);
  }
  return values;
}

function normaliseInitial(field: FormField): unknown {
  const value = field.value;
  if (field.type === "boolean") return value === true || value === "true";
  if (value === null || value === undefined) return "";
  if (field.type === "date") return toDateInputValue(value);
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** `<input type="date">` only accepts yyyy-MM-dd. */
export function toDateInputValue(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  return date.toISOString().slice(0, 10);
}

export type FormErrors = Record<string, string>;

export function validateForm(model: FormModelResponse, values: FormValues): FormErrors {
  const errors: FormErrors = {};
  for (const field of flattenFields(model.fields)) {
    if (!isSubmittable(field) || field.readOnly) continue;
    const error = validateField(field, values[field.id]);
    if (error) errors[field.id] = error;
  }
  return errors;
}

export function validateField(field: FormField, value: unknown): string | undefined {
  const isBlank =
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "");

  if (field.required && field.type !== "boolean" && isBlank) {
    return `${field.name || field.id} is required.`;
  }
  if (isBlank) return undefined;

  const raw = String(value).trim();

  if (field.type === "integer") {
    if (!/^-?\d+$/.test(raw)) return "Enter a whole number.";
    return undefined;
  }
  if (field.type === "decimal" || field.type === "amount") {
    if (!Number.isFinite(Number(raw))) return "Enter a number.";
    return undefined;
  }
  if (field.type === "date") {
    if (Number.isNaN(Date.parse(raw))) return "Enter a valid date.";
    return undefined;
  }
  return undefined;
}

/**
 * Maps form values onto RestVariables. The engine rejects a variable whose value
 * does not match its declared type, so the form field's type decides the variable
 * type rather than guessing from the JavaScript value.
 */
export function formValuesToVariables(
  model: FormModelResponse,
  values: FormValues,
): RestVariable[] {
  const variables: RestVariable[] = [];

  for (const field of flattenFields(model.fields)) {
    if (!isSubmittable(field)) continue;
    const raw = values[field.id];

    if (field.type === "boolean") {
      variables.push({ name: field.id, type: "boolean", value: raw === true || raw === "true" });
      continue;
    }

    const text = raw === undefined || raw === null ? "" : String(raw).trim();
    if (text === "") {
      // Send an explicit null so clearing an optional field actually clears the
      // variable, rather than silently leaving the previous value in place.
      variables.push({ name: field.id, type: variableTypeFor(field.type), value: null });
      continue;
    }

    switch (field.type) {
      case "integer":
        variables.push({ name: field.id, type: "integer", value: Number.parseInt(text, 10) });
        break;
      case "decimal":
      case "amount":
        variables.push({ name: field.id, type: "double", value: Number(text) });
        break;
      case "date":
        variables.push({ name: field.id, type: "date", value: new Date(text).toISOString() });
        break;
      default:
        variables.push({ name: field.id, type: "string", value: text });
    }
  }

  return variables;
}

function variableTypeFor(fieldType: string): string {
  switch (fieldType) {
    case "integer":
      return "integer";
    case "decimal":
    case "amount":
      return "double";
    case "date":
      return "date";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

/**
 * True when the model has renderable content. A form can come back with metadata
 * but no fields (e.g. an interceptor returned a different shape), in which case the
 * caller should fall back to the variable grid rather than render an empty form.
 */
export function hasRenderableFields(model: FormModelResponse | undefined): boolean {
  if (!model) return false;
  return flattenFields(model.fields).length > 0;
}
