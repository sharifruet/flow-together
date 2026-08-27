/**
 * The form draft model, kept separate from the builder component so the library can
 * seed a new form without statically importing the editor — which would defeat the
 * lazy chunk the editor is loaded in.
 *
 * The stored shape is Flowable's own `SimpleFormModel` JSON, which is exactly what the
 * Work app's renderer consumes (ADR 0007), so nothing is translated between the two.
 */

import type { FormField, FormFieldType, FormModelResponse, ModelResponse } from "@togetherflow/common";

/**
 * Palette groups (W2.3, UI_POLISH_BACKLOG.md I2).
 *
 * The renderer handles nineteen field types; the palette offered eleven, so eight things
 * a form could *display* could not be *authored* — the exact gap I2 records. All nineteen
 * are here now, grouped the way Flowable Design groups them: Data entry / Selection /
 * People / Display / Container.
 *
 * Grouping is not decoration. A flat list of nineteen is a wall, and the four groups map
 * onto the question a builder is actually asking: am I collecting a value, offering a
 * choice, naming a person, or laying the form out?
 */
export interface PaletteGroup {
  id: string;
  label: string;
  types: { type: FormFieldType; label: string }[];
}

export const PALETTE: PaletteGroup[] = [
  {
    id: "entry",
    label: "Data entry",
    types: [
      { type: "text", label: "Text" },
      { type: "multi-line-text", label: "Multi-line text" },
      { type: "integer", label: "Whole number" },
      { type: "decimal", label: "Decimal" },
      { type: "amount", label: "Amount" },
      { type: "date", label: "Date" },
      { type: "upload", label: "File upload" },
    ],
  },
  {
    id: "selection",
    label: "Selection",
    types: [
      { type: "boolean", label: "Checkbox" },
      { type: "dropdown", label: "Dropdown" },
      { type: "radio-buttons", label: "Radio buttons" },
    ],
  },
  {
    id: "people",
    label: "People",
    types: [
      { type: "people", label: "Person" },
      { type: "functional-group", label: "Group" },
    ],
  },
  {
    id: "display",
    label: "Display",
    types: [
      { type: "headline", label: "Heading" },
      { type: "headline-with-line", label: "Heading with rule" },
      { type: "horizontal-line", label: "Divider" },
      { type: "spacer", label: "Spacer" },
      { type: "hyperlink", label: "Link" },
      { type: "expression", label: "Expression" },
    ],
  },
  {
    id: "container",
    label: "Container",
    types: [{ type: "container", label: "Column container" }],
  },
];

/** Flat view of the palette, for lookups that do not care about grouping. */
export const FIELD_TYPES: { type: FormFieldType; label: string }[] = PALETTE.flatMap(
  (group) => group.types,
);

export const OPTION_TYPES: ReadonlySet<string> = new Set(["dropdown", "radio-buttons"]);

export function labelFor(type: FormFieldType): string {
  return FIELD_TYPES.find((f) => f.type === type)?.label ?? type;
}

/** Presentational fields carry no value, so they have no placeholder or required flag. */
export function isPresentational(type: string): boolean {
  return (
    type === "headline" ||
    type === "headline-with-line" ||
    type === "horizontal-line" ||
    type === "spacer" ||
    type === "hyperlink" ||
    type === "container"
  );
}

/** Types whose value is a number, and so accept min/max rather than length limits. */
export function isNumericType(type: string): boolean {
  return type === "integer" || type === "decimal" || type === "amount";
}

/** Types whose value is free text, and so accept length and pattern limits. */
export function isTextualType(type: string): boolean {
  return type === "text" || type === "multi-line-text";
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
