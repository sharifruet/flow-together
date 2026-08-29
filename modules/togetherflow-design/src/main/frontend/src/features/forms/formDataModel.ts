/**
 * The data model a form implies (ENTERPRISE_PARITY_PLAN.md W3.3).
 *
 * Flowable Design binds form components to a declared data model with `{{expression}}`
 * bindings. This fork has no such declaration and inventing one would repeat the mistake
 * W2.3 warned about: a schema nothing enforces looks like a feature while delivering
 * none of it — the engine reads process variables, and a form field's id *is* the
 * variable name.
 *
 * So rather than a parallel declaration, this derives the data model the form actually
 * writes, and checks it. That is the part an author cannot see today: which variables
 * this form produces, at what type, and where two fields quietly write the same one.
 */

import { flattenFields, type FormField, type FormModelResponse } from "@togetherflow/common";

export interface DataModelEntry {
  /** The field id, which is the process variable name the engine will set. */
  name: string;
  /** The engine variable type the field's answer is submitted as. */
  type: string;
  required: boolean;
  /** Field labels writing this variable. More than one is a collision. */
  writtenBy: string[];
}

export type DataModelProblemKind = "duplicate" | "invalid-name" | "missing-name";

export interface DataModelProblem {
  kind: DataModelProblemKind;
  name: string;
}

/**
 * Mirrors `formValuesToVariables`' mapping, which is what actually decides the type the
 * engine stores. Kept beside it rather than derived from it because that function maps
 * *values*, and this describes *fields*.
 */
export function variableTypeFor(fieldType: string): string {
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

/** Field types that carry no value, so write no variable. */
const PRESENTATIONAL = new Set([
  "container",
  "spacer",
  "horizontal-line",
  "headline",
  "headline-with-line",
  "hyperlink",
  "expression",
]);

function writesAVariable(field: FormField): boolean {
  return !PRESENTATIONAL.has(field.type);
}

/** Everything this form writes, in the order the form presents it. */
export function dataModelOf(form: FormModelResponse): DataModelEntry[] {
  const entries = new Map<string, DataModelEntry>();
  for (const field of flattenFields(form.fields).filter(writesAVariable)) {
    const label = field.name || field.id || "";
    const existing = entries.get(field.id);
    if (existing) {
      existing.writtenBy.push(label);
      // Required if *any* field writing it is: the engine sees one variable, and the
      // stricter of two rules is the one that governs whether it can be left empty.
      existing.required = existing.required || field.required === true;
      continue;
    }
    entries.set(field.id, {
      name: field.id,
      type: variableTypeFor(field.type),
      required: field.required === true,
      writtenBy: [label],
    });
  }
  return [...entries.values()];
}

/**
 * A process variable name the engine and its expressions can actually use.
 *
 * `${amount-due}` is a subtraction, not a variable, so a hyphen in an id produces an
 * expression that evaluates to something surprising rather than failing — which is worse
 * than a rejected deploy.
 */
const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function dataModelProblems(form: FormModelResponse): DataModelProblem[] {
  const problems: DataModelProblem[] = [];
  for (const entry of dataModelOf(form)) {
    if (!entry.name) {
      problems.push({ kind: "missing-name", name: "" });
      continue;
    }
    if (entry.writtenBy.length > 1) {
      // Two fields writing one variable: the last one submitted wins, silently.
      problems.push({ kind: "duplicate", name: entry.name });
    }
    if (!VALID_NAME.test(entry.name)) {
      problems.push({ kind: "invalid-name", name: entry.name });
    }
  }
  return problems;
}
