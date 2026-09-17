/**
 * Turns the engine's refusal of a form submission into something the renderer can show
 * (FORM_REQUIREMENTS.md FR-S.7, FR-W.4).
 *
 * The engine answers a 400 whose body lists every failing field with a stable `code`
 * (`required`, `type`, `min`, `max`, `minLength`, `maxLength`, `pattern`, `minDate`,
 * `maxDate`, `option`, `identity`, `upload`, `outcome`). Codes are translated here through
 * the same `form.validation.*` keys the browser-side check uses, so a rule that only the
 * server enforces reads exactly like one the browser caught. A code with no translation
 * falls back to the engine's own message — better than a blank, worse than a sentence in
 * the user's language, which is the signal to add the key.
 */

import { ApiError } from "../api/client";
import type { FormField, FormModelResponse, FormValidationErrorBody, FormValidationFieldError } from "../api/types";
import type { TFunction } from "../i18n/I18nContext";
import { fieldConstraints, flattenFields, type FormErrors } from "./formModel";

export interface ServerFormErrors {
  /** Per field, keyed by field id — merge into the renderer's `errors`. */
  fields: FormErrors;
  /** Problems with no field to sit on: a wrong outcome, or an unknown code. */
  general: string[];
}

/** True when the error is the engine refusing a submission on its rules. */
export function isFormValidationError(error: unknown): error is ApiError & { body: FormValidationErrorBody } {
  if (!(error instanceof ApiError) || error.status !== 400) return false;
  const body = error.body as Partial<FormValidationErrorBody> | undefined;
  return Array.isArray(body?.fields);
}

export function serverFormErrors(
  error: unknown,
  model: FormModelResponse | undefined,
  t: TFunction,
): ServerFormErrors | null {
  if (!isFormValidationError(error)) return null;
  const byId = new Map<string, FormField>();
  for (const field of flattenFields(model?.fields)) byId.set(field.id, field);

  const fields: FormErrors = {};
  const general: string[] = [];
  for (const entry of error.body.fields) {
    const field = entry.id ? byId.get(entry.id) : undefined;
    const message = translate(entry, field, t);
    if (entry.id && (field || !fields[entry.id])) {
      // First error per field wins: the renderer shows one message per field, and the
      // engine lists them in rule order (required before range), which is the right one.
      if (!fields[entry.id]) fields[entry.id] = message;
    } else {
      general.push(message);
    }
  }
  return { fields, general };
}

function translate(entry: FormValidationFieldError, field: FormField | undefined, t: TFunction): string {
  const name = field?.name || entry.id || "";
  const limits = field ? fieldConstraints(field) : {};
  switch (entry.code) {
    case "required":
      return t("form.validation.required", { field: name });
    case "minLength":
      return t("form.validation.minLength", { min: limits.minLength ?? "" });
    case "maxLength":
      return t("form.validation.maxLength", { max: limits.maxLength ?? "" });
    case "min":
      return t("form.validation.min", { min: limits.min ?? "" });
    case "max":
      return t("form.validation.max", { max: limits.max ?? "" });
    case "pattern":
      return limits.patternMessage ?? t("form.validation.pattern");
    case "minDate":
      return t("form.validation.minDate", { date: limits.minDate ?? "" });
    case "maxDate":
      return t("form.validation.maxDate", { date: limits.maxDate ?? "" });
    case "type":
      if (field?.type === "integer") return t("form.validation.integer");
      if (field?.type === "decimal" || field?.type === "amount") return t("form.validation.number");
      if (field?.type === "date") return t("form.validation.date");
      return t("form.validation.type");
    case "option":
      return t("form.validation.option");
    case "identity":
      return field?.type === "functional-group"
        ? t("form.validation.group")
        : t("form.validation.user");
    case "upload":
      return t("form.validation.upload");
    case "outcome":
      return t("form.validation.outcome");
    default:
      return entry.message;
  }
}
