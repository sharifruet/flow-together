/**
 * Renders a Flowable form model (REQUIREMENTS.md §7.1 Forms).
 *
 * Native to Flowable's own SimpleFormModel schema — see
 * docs/ui/adr/0007-flowable-native-form-renderer.md for why this is not an adapter
 * over @bpmn-io/form-js.
 */

import { useId, useState } from "react";
import type { FormField, FormModelResponse, OptionFormField } from "../api/types";
import { useT, type TFunction } from "../i18n/I18nContext";
import { isFieldVisible } from "./visibility";
import {
  isContainer,
  isOptionField,
  toDateInputValue,
  type FormErrors,
  type FormValues,
} from "./formModel";

export interface FormRendererProps {
  model: FormModelResponse;
  values: FormValues;
  errors?: FormErrors;
  disabled?: boolean;
  onChange: (fieldId: string, value: unknown) => void;
  /** Called when a field loses focus, so validation can run per-field (§14.3). */
  onBlur?: (fieldId: string) => void;
  /**
   * Handles an `upload` field's file, returning what should be stored as the field's
   * value (typically an attachment id or URL).
   *
   * Only a task has somewhere to put a file — the attachment endpoint hangs off the
   * task — so a start form is rendered without this and says so rather than showing a
   * control that cannot work. Omitting it is a deliberate, supported state.
   */
  onUploadFile?: (field: FormField, file: File) => Promise<string>;
}

export function FormRenderer({
  model,
  values,
  errors = {},
  disabled = false,
  onChange,
  onBlur,
  onUploadFile,
}: FormRendererProps) {
  return (
    <div className="tf-form">
      {(model.fields ?? []).map((field, index) => (
        <FieldNode
          key={field.id || `field-${index}`}
          field={field}
          values={values}
          errors={errors}
          disabled={disabled}
          onChange={onChange}
          onBlur={onBlur}
          onUploadFile={onUploadFile}
        />
      ))}
    </div>
  );
}

interface NodeProps {
  field: FormField;
  values: FormValues;
  errors: FormErrors;
  disabled: boolean;
  onChange: (fieldId: string, value: unknown) => void;
  onBlur?: (fieldId: string) => void;
  onUploadFile?: (field: FormField, file: File) => Promise<string>;
}

function FieldNode({ field, ...rest }: NodeProps) {
  // Presentation-only: a hidden field is simply not rendered. Its value, if any was
  // entered before the condition turned, is still submitted — hiding is not clearing.
  if (!isFieldVisible(field, rest.values)) return null;

  if (isContainer(field)) {
    return (
      <div className="tf-form__container">
        {(field.fields ?? []).map((row, rowIndex) => (
          <div className="tf-form__row" key={rowIndex}>
            {row.map((child, colIndex) => (
              <div className="tf-form__col" key={child.id || `${rowIndex}-${colIndex}`}>
                <FieldNode field={child} {...rest} />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  switch (field.type) {
    case "headline":
    case "headline-with-line":
      return (
        <h3
          className={[
            "tf-form__headline",
            field.type === "headline-with-line" ? "tf-form__headline--ruled" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {field.name}
        </h3>
      );
    case "horizontal-line":
      return <hr className="tf-form__rule" />;
    case "spacer":
      return <div className="tf-form__spacer" aria-hidden="true" />;
    case "hyperlink":
      return <HyperlinkField field={field} />;
    default:
      return <InputField field={field} {...rest} />;
  }
}

function HyperlinkField({ field }: { field: FormField }) {
  const href = String(field.params?.hyperlinkUrl ?? field.value ?? "");
  const safe = /^https?:\/\//i.test(href);
  if (!safe) {
    // Never render a non-http(s) href: javascript:/data: URLs would execute on click.
    return <p className="tf-form__static">{field.name}</p>;
  }
  return (
    <p className="tf-form__static">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {field.name || href}
      </a>
    </p>
  );
}

function InputField({
  field,
  values,
  errors,
  disabled,
  onChange,
  onBlur,
  onUploadFile,
}: NodeProps) {
  const t = useT();
  const generatedId = useId();
  const inputId = `tf-form-${field.id || generatedId}`;
  const errorId = `${inputId}-error`;
  const error = errors[field.id];
  const value = values[field.id];
  const readOnly = disabled || field.readOnly === true;
  const describedBy = error ? errorId : undefined;

  // Expression fields are evaluated by the engine; showing them read-only is honest,
  // editing them is not (the submitted value would be discarded).
  const isExpression = field.type === "expression";

  const label = (
    <label className="tf-field__label" htmlFor={inputId}>
      {field.name || field.id}
      {field.required && !readOnly ? (
        <span className="tf-field__required" aria-hidden="true">
          {" "}
          *
        </span>
      ) : null}
    </label>
  );

  const commonProps = {
    id: inputId,
    className: "tf-input",
    disabled: readOnly,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy,
    onBlur: onBlur ? () => onBlur(field.id) : undefined,
  };

  let control: React.ReactNode;

  if (isExpression) {
    // Expression fields are engine-computed, so they are not seeded into the values
    // map; their value comes straight off the model.
    const computed = value ?? field.value;
    control = (
      <output className="tf-form__expression" id={inputId}>
        {computed === undefined || computed === null || computed === "" ? "—" : String(computed)}
      </output>
    );
  } else if (field.type === "boolean") {
    control = (
      <div className="tf-form__checkbox">
        <input
          {...commonProps}
          className="tf-form__checkbox-input"
          type="checkbox"
          checked={value === true || value === "true"}
          onChange={(event) => onChange(field.id, event.target.checked)}
        />
        <span>{field.placeholder || "Yes"}</span>
      </div>
    );
  } else if (isOptionField(field)) {
    control = renderOptions(field, {
      value,
      inputId,
      readOnly,
      error: Boolean(error),
      describedBy,
      onChange,
      onBlur,
      t,
    });
  } else if (field.type === "multi-line-text") {
    control = (
      <textarea
        {...commonProps}
        className="tf-input tf-textarea"
        rows={3}
        placeholder={field.placeholder}
        value={String(value ?? "")}
        onChange={(event) => onChange(field.id, event.target.value)}
      />
    );
  } else if (field.type === "upload") {
    // A file needs somewhere to go. On a task that is the attachment endpoint; on a
    // start form there is no instance yet, so the field explains itself instead of
    // rendering a control that would silently drop the file.
    control = onUploadFile ? (
      <UploadField
        field={field}
        inputId={inputId}
        value={value}
        disabled={disabled}
        onChange={onChange}
        onUploadFile={onUploadFile}
      />
    ) : (
      <p className="tf-form__static tf-muted">{t("form.upload.beforeStart")}</p>
    );
  } else if (field.type === "people" || field.type === "functional-group") {
    control = (
      <input
        {...commonProps}
        type="text"
        placeholder={
          field.placeholder ||
          (field.type === "people" ? t("form.userId") : t("form.groupId"))
        }
        value={String(value ?? "")}
        onChange={(event) => onChange(field.id, event.target.value)}
      />
    );
  } else {
    control = (
      <input
        {...commonProps}
        type={inputTypeFor(field.type)}
        inputMode={field.type === "integer" ? "numeric" : undefined}
        step={field.type === "decimal" || field.type === "amount" ? "any" : undefined}
        placeholder={field.placeholder}
        value={field.type === "date" ? toDateInputValue(value) : String(value ?? "")}
        onChange={(event) => onChange(field.id, event.target.value)}
      />
    );
  }

  return (
    <div className={["tf-field", error ? "tf-field--invalid" : ""].filter(Boolean).join(" ")}>
      {label}
      {control}
      {error ? (
        <p className="tf-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface OptionRenderContext {
  value: unknown;
  inputId: string;
  readOnly: boolean;
  error: boolean;
  describedBy: string | undefined;
  onChange: (fieldId: string, value: unknown) => void;
  onBlur?: (fieldId: string) => void;
  /** Passed down rather than hooked: renderOptions is a helper, not a component. */
  t: TFunction;
}

function renderOptions(field: OptionFormField, ctx: OptionRenderContext): React.ReactNode {
  const options = field.options ?? [];

  // An options list driven by a server-side expression arrives unresolved; a free-text
  // input is honest about that rather than showing an empty dropdown.
  if (options.length === 0 && field.optionsExpression) {
    return (
      <input
        id={ctx.inputId}
        className="tf-input"
        type="text"
        disabled={ctx.readOnly}
        aria-invalid={ctx.error || undefined}
        aria-describedby={ctx.describedBy}
        value={String(ctx.value ?? "")}
        onChange={(event) => ctx.onChange(field.id, event.target.value)}
        onBlur={ctx.onBlur ? () => ctx.onBlur?.(field.id) : undefined}
      />
    );
  }

  if (field.type === "radio-buttons") {
    return (
      <div
        className="tf-form__radios"
        role="radiogroup"
        aria-labelledby={undefined}
        aria-describedby={ctx.describedBy}
      >
        {options.map((option, index) => {
          const optionValue = option.name;
          const optionId = `${ctx.inputId}-${index}`;
          return (
            <div className="tf-form__radio" key={option.id ?? optionValue}>
              <input
                type="radio"
                id={optionId}
                name={ctx.inputId}
                value={optionValue}
                disabled={ctx.readOnly}
                checked={String(ctx.value ?? "") === optionValue}
                onChange={() => ctx.onChange(field.id, optionValue)}
                onBlur={ctx.onBlur ? () => ctx.onBlur?.(field.id) : undefined}
              />
              <label htmlFor={optionId}>{optionValue}</label>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <select
      id={ctx.inputId}
      className="tf-input tf-select"
      disabled={ctx.readOnly}
      aria-invalid={ctx.error || undefined}
      aria-describedby={ctx.describedBy}
      value={String(ctx.value ?? "")}
      onChange={(event) => ctx.onChange(field.id, event.target.value)}
      onBlur={ctx.onBlur ? () => ctx.onBlur?.(field.id) : undefined}
    >
      <option value="">{field.placeholder || ctx.t("form.choose")}</option>
      {options.map((option) => (
        <option key={option.id ?? option.name} value={option.name}>
          {option.name}
        </option>
      ))}
    </select>
  );
}

function inputTypeFor(fieldType: string): string {
  switch (fieldType) {
    case "integer":
    case "decimal":
    case "amount":
      return "number";
    case "date":
      return "date";
    default:
      return "text";
  }
}

/**
 * An `upload` field.
 *
 * Uploading is a side effect with three outcomes the user must be able to tell apart:
 * in progress, attached, and failed. A bare file input shows none of them.
 */
function UploadField({
  field,
  inputId,
  value,
  disabled,
  onChange,
  onUploadFile,
}: {
  field: FormField;
  inputId: string;
  value: unknown;
  disabled: boolean;
  onChange: (fieldId: string, value: unknown) => void;
  onUploadFile: (field: FormField, file: File) => Promise<string>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  return (
    <div className="tf-form__upload">
      <input
        id={inputId}
        name={field.id}
        type="file"
        className="tf-input"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setFailed(null);
          onUploadFile(field, file)
            .then((stored) => {
              onChange(field.id, stored);
              setName(file.name);
            })
            .catch((cause: unknown) => {
              setFailed(cause instanceof Error ? cause.message : t("form.upload.failed"));
              // Leave the field empty rather than pretending a value was stored.
              onChange(field.id, undefined);
            })
            .finally(() => setBusy(false));
        }}
      />
      {busy ? (
        <span className="tf-form__upload-state" role="status">
          {t("form.upload.busy")}
        </span>
      ) : failed ? (
        <span className="tf-form__upload-state tf-form__upload-state--error" role="alert">
          {failed}
        </span>
      ) : value && name ? (
        <span className="tf-form__upload-state">{t("form.upload.attached", { name })}</span>
      ) : null}
    </div>
  );
}
