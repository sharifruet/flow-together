/**
 * Conditional field visibility (REQUIREMENTS.md §7.4.6).
 *
 * **This is a TogetherFlow convention, not an engine feature.** Flowable's `FormField`
 * has no visibility property — checked against `flowable-form-model`'s own Java class,
 * which carries `id`, `name`, `type`, `value`, `required`, `readOnly`, `overrideId`,
 * `placeholder`, `params` and `layout`, and nothing else. What it does have is `params`,
 * a free-form `Map<String, Object>` that the engine stores and returns untouched.
 *
 * So the rule lives in `params.tfVisibleWhen`. Consequences worth being explicit about:
 *
 * - A form using it stays a perfectly valid Flowable form; other consumers simply see
 *   an extra params entry and show the field unconditionally.
 * - The condition is **presentation only**. It must never be relied on for security or
 *   for correctness of the submitted data — anything hidden this way is still absent
 *   rather than protected, and validation of a hidden field is skipped deliberately
 *   (see `isFieldVisible` usage in the renderer and validator).
 */

import type { FormField, FormModelResponse } from "../api/types";
import type { FormValues } from "./formModel";

export type VisibilityOperator = "equals" | "notEquals" | "isSet" | "isEmpty";

export interface VisibilityRule {
  /** Id of the field this one depends on. */
  field: string;
  operator: VisibilityOperator;
  /** Compared as a string; unused by isSet/isEmpty. */
  value?: string;
}

export const VISIBILITY_PARAM = "tfVisibleWhen";

export function getVisibilityRule(field: FormField): VisibilityRule | undefined {
  const raw = field.params?.[VISIBILITY_PARAM];
  if (!raw || typeof raw !== "object") return undefined;
  const rule = raw as Partial<VisibilityRule>;
  if (!rule.field || !rule.operator) return undefined;
  return { field: rule.field, operator: rule.operator, value: rule.value };
}

export function withVisibilityRule(field: FormField, rule: VisibilityRule | undefined): FormField {
  const params = { ...(field.params ?? {}) };
  if (rule) params[VISIBILITY_PARAM] = rule;
  else delete params[VISIBILITY_PARAM];
  const next = { ...field, params } as FormField;
  if (Object.keys(params).length === 0) delete (next as { params?: unknown }).params;
  return next;
}

/**
 * Whether a field should be shown for the current answers.
 *
 * A rule pointing at a field that does not exist shows the field rather than hiding it:
 * a typo in a condition must not silently remove an input someone needs to fill in.
 */
export function isFieldVisible(field: FormField, values: FormValues): boolean {
  const rule = getVisibilityRule(field);
  if (!rule) return true;

  const other = values[rule.field];
  const isBlank = other === undefined || other === null || other === "" || other === false;

  switch (rule.operator) {
    case "isSet":
      return !isBlank;
    case "isEmpty":
      return isBlank;
    case "equals":
      return String(other ?? "") === String(rule.value ?? "");
    case "notEquals":
      return String(other ?? "") !== String(rule.value ?? "");
    default:
      return true;
  }
}

/** Ids of every field currently hidden, so validation can skip them. */
export function hiddenFieldIds(model: FormModelResponse, values: FormValues): Set<string> {
  const hidden = new Set<string>();
  const walk = (fields: FormField[] | undefined) => {
    for (const field of fields ?? []) {
      if (!isFieldVisible(field, values)) hidden.add(field.id);
      const container = field as { fields?: FormField[][] };
      if (Array.isArray(container.fields)) {
        for (const row of container.fields) walk(row);
      }
    }
  };
  walk(model.fields);
  return hidden;
}
