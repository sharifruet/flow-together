/**
 * Conversion between Flowable's typed RestVariable wire format and editable form values.
 * Flowable rejects a variable whose `value` does not match its declared `type`, so the
 * type has to survive the round trip through the UI rather than being inferred on submit.
 */

import type { RestVariable } from "./types";

export type EditableVariableType = "string" | "integer" | "long" | "double" | "boolean" | "date" | "json";

export interface EditableVariable {
  name: string;
  type: EditableVariableType;
  /** Always held as text while editing; coerced back to the wire type on submit. */
  input: string;
  scope?: "local" | "global";
}

const NUMERIC: EditableVariableType[] = ["integer", "long", "double"];

export function toEditable(variable: RestVariable): EditableVariable {
  const type = normalizeType(variable.type);
  return {
    name: variable.name,
    type,
    input: stringifyValue(variable.value, type),
    scope: variable.scope,
  };
}

export function normalizeType(type: string | undefined): EditableVariableType {
  switch ((type ?? "string").toLowerCase()) {
    case "integer":
    case "int":
      return "integer";
    case "long":
      return "long";
    case "double":
    case "float":
      return "double";
    case "boolean":
    case "bool":
      return "boolean";
    case "date":
    case "instant":
    case "localdate":
    case "localdatetime":
      return "date";
    case "json":
      return "json";
    default:
      return "string";
  }
}

function stringifyValue(value: unknown, type: EditableVariableType): string {
  if (value === null || value === undefined) return "";
  if (type === "json") {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }
  if (type === "boolean") return String(Boolean(value));
  return String(value);
}

export interface VariableValidationError {
  name: string;
  message: string;
}

/** Validates without converting, so a form can show inline errors as the user types (§14.3). */
export function validateVariable(variable: EditableVariable): string | undefined {
  const raw = variable.input.trim();
  if (!variable.name.trim()) return "Name is required.";
  if (raw === "") return undefined;

  if (NUMERIC.includes(variable.type)) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return "Must be a number.";
    if (variable.type !== "double" && !Number.isInteger(parsed)) {
      return "Must be a whole number.";
    }
    return undefined;
  }
  if (variable.type === "boolean") {
    return /^(true|false)$/i.test(raw) ? undefined : "Must be true or false.";
  }
  if (variable.type === "date") {
    return Number.isNaN(Date.parse(raw)) ? "Must be a valid date." : undefined;
  }
  if (variable.type === "json") {
    try {
      JSON.parse(raw);
      return undefined;
    } catch {
      return "Must be valid JSON.";
    }
  }
  return undefined;
}

export function validateVariables(variables: EditableVariable[]): VariableValidationError[] {
  const errors: VariableValidationError[] = [];
  const seen = new Set<string>();
  for (const variable of variables) {
    const message = validateVariable(variable);
    if (message) {
      errors.push({ name: variable.name, message });
    }
    const key = variable.name.trim();
    if (key && seen.has(key)) {
      errors.push({ name: key, message: "Duplicate variable name." });
    }
    seen.add(key);
  }
  return errors;
}

export function toRestVariable(variable: EditableVariable): RestVariable {
  const raw = variable.input.trim();
  let value: unknown = raw;

  if (raw === "") {
    value = null;
  } else if (NUMERIC.includes(variable.type)) {
    value = Number(raw);
  } else if (variable.type === "boolean") {
    value = raw.toLowerCase() === "true";
  } else if (variable.type === "date") {
    value = new Date(raw).toISOString();
  } else if (variable.type === "json") {
    value = JSON.parse(raw);
  }

  return {
    name: variable.name.trim(),
    type: variable.type,
    value,
    ...(variable.scope ? { scope: variable.scope } : {}),
  };
}

export function toRestVariables(variables: EditableVariable[]): RestVariable[] {
  return variables.filter((variable) => variable.name.trim() !== "").map(toRestVariable);
}

/** Human-readable rendering for read-only variable display. */
export function displayValue(variable: RestVariable): string {
  if (variable.value === null || variable.value === undefined) return "—";
  if (typeof variable.value === "object") return JSON.stringify(variable.value);
  return String(variable.value);
}
