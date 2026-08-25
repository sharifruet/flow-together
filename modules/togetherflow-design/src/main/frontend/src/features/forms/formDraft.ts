/**
 * The form draft model, kept separate from the builder component so the library can
 * seed a new form without statically importing the editor — which would defeat the
 * lazy chunk the editor is loaded in.
 *
 * The stored shape is Flowable's own `SimpleFormModel` JSON, which is exactly what the
 * Work app's renderer consumes (ADR 0007), so nothing is translated between the two.
 */

import type { FormField, FormFieldType, FormModelResponse, ModelResponse } from "@togetherflow/common";

/** Field types the builder offers, in the order they appear in the palette. */
export const FIELD_TYPES: { type: FormFieldType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "multi-line-text", label: "Multi-line text" },
  { type: "integer", label: "Whole number" },
  { type: "decimal", label: "Decimal" },
  { type: "amount", label: "Amount" },
  { type: "date", label: "Date" },
  { type: "boolean", label: "Checkbox" },
  { type: "dropdown", label: "Dropdown" },
  { type: "radio-buttons", label: "Radio buttons" },
  { type: "headline", label: "Heading" },
  { type: "horizontal-line", label: "Divider" },
];

export const OPTION_TYPES: ReadonlySet<string> = new Set(["dropdown", "radio-buttons"]);

export function labelFor(type: FormFieldType): string {
  return FIELD_TYPES.find((f) => f.type === type)?.label ?? type;
}

/** Presentational fields carry no value, so they have no placeholder or required flag. */
export function isPresentational(type: string): boolean {
  return type === "headline" || type === "horizontal-line" || type === "spacer";
}

export function emptyFormModel(key: string, name: string): FormModelResponse {
  return { key, name, version: 1, fields: [], outcomes: [] };
}

export function parseFormModel(
  source: string | null,
  fallback: ModelResponse,
): FormModelResponse {
  if (source) {
    try {
      const parsed = JSON.parse(source) as FormModelResponse;
      if (parsed && Array.isArray(parsed.fields)) return parsed;
    } catch {
      // A malformed draft should not block editing.
    }
  }
  return emptyFormModel(fallback.key ?? "form", fallback.name ?? "Form");
}

/**
 * Builds a new field with an id unique within `existing`.
 *
 * The id is derived from the fields already present rather than from a clock or a
 * random source, so creating a field stays a pure function of the draft — the React
 * compiler rejects impure calls in a component body, and a pure id is also what makes
 * the builder's behaviour reproducible in tests.
 */
export function newField(type: FormFieldType, existing: FormField[]): FormField {
  const taken = new Set(existing.map((field) => field.id));
  let n = existing.length + 1;
  let id = `${type.replace(/-/g, "_")}_${n}`;
  while (taken.has(id)) {
    n += 1;
    id = `${type.replace(/-/g, "_")}_${n}`;
  }
  return OPTION_TYPES.has(type)
    ? {
        id,
        name: labelFor(type),
        type,
        fieldType: "OptionFormField",
        options: [{ name: "Option 1" }],
      }
    : { id, name: labelFor(type), type };
}
