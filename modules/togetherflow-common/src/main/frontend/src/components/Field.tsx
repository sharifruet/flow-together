import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

export interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Wraps a control with its label, hint and inline validation message (§14.3). */
export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={["tf-field", error ? "tf-field--invalid" : ""].filter(Boolean).join(" ")}>
      <label className="tf-field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="tf-field__required" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p className="tf-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="tf-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextInput({ label, error, hint, required, ...rest }: TextInputProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <input
          {...rest}
          id={id}
          className="tf-input"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
        />
      )}
    </Field>
  );
}

export interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function SelectInput({ label, error, hint, children, ...rest }: SelectInputProps) {
  return (
    <Field label={label} error={error} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <select
          {...rest}
          id={id}
          className="tf-input tf-select"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

export interface TextAreaInputProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

/**
 * Multi-line input, for the values a single-line box makes unusable: a script task's
 * body, an element's documentation, a mail task's HTML. Same `Field` wrapper as
 * `TextInput`, so labelling, hints and error wiring behave identically.
 */
export function TextAreaInput({ label, error, hint, required, rows = 4, ...rest }: TextAreaInputProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <textarea
          {...rest}
          id={id}
          rows={rows}
          className="tf-input tf-textarea"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
        />
      )}
    </Field>
  );
}
