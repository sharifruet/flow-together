/**
 * Conditional required (REQUIREMENTS.md §7.4.6).
 *
 * The sibling of conditional visibility: `params.tfVisibleWhen` decides whether a field
 * is *asked*, `params.tfRequiredWhen` decides whether an answer is *demanded*. Both are
 * TogetherFlow conventions living in Flowable's free-form `params` map — the engine's
 * `FormField` has a plain boolean `required` and nothing that varies with another
 * answer — and both share the rule shape and evaluation in visibility.ts.
 *
 * What it is for: an approval whose remarks are optional when approving and mandatory
 * when rejecting. "Rejected without saying why" is the state this prevents.
 *
 * Like visibility, the rule is **presentation only**. The engine does not read it, so a
 * client that ignores it can still submit a blank value; a rule that must hold has to be
 * enforced by the process as well.
 */

import type { FormField } from "../api/types";
import type { FormValues } from "./formModel";
import { matchesRule, readRule, writeRule, type VisibilityRule } from "./visibility";

/** Same shape as a visibility rule — one field, one operator, one compared value. */
export type RequiredRule = VisibilityRule;

export const REQUIRED_WHEN_PARAM = "tfRequiredWhen";

export function getRequiredRule(field: FormField): RequiredRule | undefined {
  return readRule(field, REQUIRED_WHEN_PARAM);
}

export function withRequiredRule(field: FormField, rule: RequiredRule | undefined): FormField {
  return writeRule(field, REQUIRED_WHEN_PARAM, rule);
}

/**
 * Whether an answer is required right now.
 *
 * A field the model marks required stays required whatever the rule says: a conditional
 * rule can only ever add a demand, never lift one the form author already made.
 */
export function isFieldRequired(field: FormField, values: FormValues): boolean {
  if (field.required === true) return true;
  const rule = getRequiredRule(field);
  return rule ? matchesRule(rule, values) : false;
}
