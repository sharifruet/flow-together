/**
 * Form builder (REQUIREMENTS.md §7.4.6).
 *
 * Authors Flowable's own `SimpleFormModel` JSON — the same schema the Work app's
 * renderer consumes (ADR 0007) — so a form built here renders there without any
 * translation.
 *
 * **Deployment caveat, verified against a running engine:** there is no form REST
 * module, and the stock `flowable-rest` image does not even initialise a form engine
 * (`GET /runtime/tasks/{id}/form` answers "Form engine is not initialized"). Forms are
 * therefore deployed by bundling them into an app (§7.4.5), and only take effect where
 * a form engine is actually configured. The builder says so rather than offering a
 * Deploy button that cannot work.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  Button,
  ConfirmDialog,
  SelectInput,
  TextInput,
  getVisibilityRule,
  useToast,
  withVisibilityRule,
  type FormField,
  type FormFieldType,
  type FormModelResponse,
  type ModelApi,
  type ModelResponse,
  type VisibilityOperator,
} from "@togetherflow/common";
import {
  FIELD_TYPES,
  OPTION_TYPES,
  isPresentational,
  newField,
  parseFormModel,
} from "./formDraft";

const AUTOSAVE_IDLE_MS = 4000;

export interface FormBuilderProps {
  modelApi: ModelApi;
  model: ModelResponse;
  initialSource: string | null;
  loadError?: string | null;
  onBack: () => void;
  onSaved: () => void;
}

export function FormBuilder({
  modelApi,
  model,
  initialSource,
  loadError,
  onBack,
  onSaved,
}: FormBuilderProps) {
  const { push } = useToast();
  const parsed = useMemo(() => parseFormModel(initialSource, model), [initialSource, model]);
  const [edits, setEdits] = useState<{ modelId: string; form: FormModelResponse } | null>(null);
  const form = edits && edits.modelId === model.id ? edits.form : parsed;

  const [selected, setSelected] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const update = useCallback(
    (changes: Partial<FormModelResponse>) => {
      setEdits({ modelId: model.id, form: { ...form, ...changes } });
      setDirty(true);
    },
    [form, model.id],
  );

  const fields = form.fields ?? [];
  const outcomes = form.outcomes ?? [];

  const addField = (type: FormFieldType) => {
    update({ fields: [...fields, newField(type, fields)] });
    setSelected(fields.length);
  };

  const updateField = (index: number, changes: Partial<FormField>) =>
    update({
      fields: fields.map((field, i) => (i === index ? ({ ...field, ...changes } as FormField) : field)),
    });

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    update({ fields: next });
    setSelected(target);
  };

  const save = useCallback(
    async (options: { silent?: boolean } = {}) => {
      setSaving(true);
      try {
        await modelApi.saveSource(model.id, JSON.stringify(form, null, 2));
        setDirty(false);
        if (!options.silent) push({ tone: "success", message: "Saved." });
        onSaved();
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? "Could not save this form.",
          reference: apiError?.correlationId,
        });
      } finally {
        setSaving(false);
      }
    },
    [modelApi, model.id, form, push, onSaved],
  );

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void saveRef.current({ silent: true }), AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const current = selected !== null ? fields[selected] : undefined;

  return (
    <section className="tf-panel" aria-label={`Editing ${model.name || model.id}`}>
      <button
        type="button"
        className="tf-back"
        onClick={() => (dirty ? setConfirmLeave(true) : onBack())}
      >
        ← Back to models
      </button>

      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">{form.name || model.id}</h1>
          <p className="tf-panel__meta" aria-live="polite">
            {dirty ? "Unsaved changes" : "Form definition"}
          </p>
        </div>
        <Button variant="secondary" loading={saving} onClick={() => void save()}>
          Save
        </Button>
      </header>

      <p className="tf-banner" role="note">
        Forms deploy as part of an app. Add this form to an app in the model library and
        publish that — and note it only takes effect where a form engine is configured.
      </p>

      {loadError ? (
        <p className="tf-detail__note tf-detail__note--error" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="tf-form-builder">
        <nav className="tf-palette" aria-label="Field palette">
          <h2 className="tf-palette__title">Add field</h2>
          {FIELD_TYPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              className="tf-palette__item"
              disabled={saving}
              onClick={() => addField(type)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="tf-form-canvas">
          <TextInput
            label="Form key"
            value={form.key ?? ""}
            disabled={saving}
            hint="Referenced by a user task's form key."
            onChange={(event) => update({ key: event.target.value })}
          />
          <TextInput
            label="Form name"
            value={form.name ?? ""}
            disabled={saving}
            onChange={(event) => update({ name: event.target.value })}
          />

          <h2 className="tf-panel__section-title">Fields ({fields.length})</h2>
          {fields.length === 0 ? (
            <p className="tf-muted">No fields yet — add one from the palette.</p>
          ) : (
            <ul className="tf-form-fields">
              {fields.map((field, index) => (
                <li key={field.id}>
                  <button
                    type="button"
                    className={[
                      "tf-form-fields__item",
                      selected === index ? "is-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setSelected(index)}
                  >
                    <span className="tf-form-fields__name">
                      {field.name || field.id}
                      {field.required ? " *" : ""}
                    </span>
                    <span className="tf-badge tf-badge--running">{field.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h2 className="tf-panel__section-title">Outcomes ({outcomes.length})</h2>
          <p className="tf-muted">
            Named submit buttons. With none, the task shows a single "Complete task"; with
            outcomes, each becomes its own button and the choice is recorded as a variable.
          </p>
          {outcomes.length > 0 ? (
            <ul className="tf-form-fields">
              {outcomes.map((outcome, index) => (
                <li className="tf-outcome-row" key={index}>
                  <TextInput
                    label={`Outcome ${index + 1}`}
                    value={outcome.name}
                    disabled={saving}
                    onChange={(event) =>
                      update({
                        outcomes: outcomes.map((o, i) =>
                          i === index ? { ...o, name: event.target.value } : o,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="tf-chip-item__remove"
                    aria-label={`Remove outcome ${index + 1}`}
                    disabled={saving}
                    onClick={() => update({ outcomes: outcomes.filter((_, i) => i !== index) })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() =>
              update({ outcomes: [...outcomes, { name: `Outcome ${outcomes.length + 1}` }] })
            }
          >
            Add outcome
          </Button>

          {outcomes.length > 0 ? (
            <TextInput
              label="Outcome variable"
              value={form.outcomeVariableName ?? ""}
              disabled={saving}
              hint="Where the chosen outcome is stored. Defaults to form_<key>_outcome."
              onChange={(event) => update({ outcomeVariableName: event.target.value })}
            />
          ) : null}
        </div>

        <aside className="tf-properties" aria-label="Field properties">
          {!current || selected === null ? (
            <p className="tf-muted tf-properties__empty">
              Select a field to edit its properties.
            </p>
          ) : (
            <>
              <header className="tf-properties__header">
                <h2 className="tf-properties__title">{current.name || current.id}</h2>
                <p className="tf-properties__type">{current.type}</p>
              </header>

              <TextInput
                label="Id"
                value={current.id}
                disabled={saving}
                hint="Becomes the process variable name."
                onChange={(event) => updateField(selected, { id: event.target.value })}
              />
              <TextInput
                label="Label"
                value={current.name ?? ""}
                disabled={saving}
                onChange={(event) => updateField(selected, { name: event.target.value })}
              />

              {!isPresentational(current.type) ? (
                <>
                  <TextInput
                    label="Placeholder"
                    value={current.placeholder ?? ""}
                    disabled={saving}
                    onChange={(event) => updateField(selected, { placeholder: event.target.value })}
                  />
                  <label className="tf-checkbox tf-checkbox--block">
                    <input
                      type="checkbox"
                      checked={current.required === true}
                      disabled={saving}
                      onChange={(event) =>
                        updateField(selected, { required: event.target.checked || undefined })
                      }
                    />
                    Required
                  </label>
                </>
              ) : null}

              {OPTION_TYPES.has(current.type) ? (
                <section className="tf-properties__section">
                  <h3 className="tf-properties__section-title">Options</h3>
                  {(("options" in current && current.options) || []).map((option, optionIndex) => (
                    <div className="tf-sentries__item" key={optionIndex}>
                      <TextInput
                        label={`Option ${optionIndex + 1}`}
                        value={option.name}
                        disabled={saving}
                        onChange={(event) => {
                          const options = [...(("options" in current && current.options) || [])];
                          options[optionIndex] = { ...options[optionIndex], name: event.target.value };
                          updateField(selected, { options } as Partial<FormField>);
                        }}
                      />
                      <button
                        type="button"
                        className="tf-chip-item__remove"
                        aria-label={`Remove option ${optionIndex + 1}`}
                        disabled={saving}
                        onClick={() => {
                          const options = (("options" in current && current.options) || []).filter(
                            (_, i) => i !== optionIndex,
                          );
                          updateField(selected, { options } as Partial<FormField>);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    disabled={saving}
                    onClick={() => {
                      const options = [
                        ...(("options" in current && current.options) || []),
                        { name: `Option ${(("options" in current && current.options) || []).length + 1}` },
                      ];
                      updateField(selected, { options } as Partial<FormField>);
                    }}
                  >
                    Add option
                  </Button>
                </section>
              ) : null}

              {/*
                Conditional visibility is a TogetherFlow convention carried in the
                engine's free-form `params` map — Flowable's FormField has no such
                property. See visibility.ts.
              */}
              <section className="tf-properties__section">
                <h3 className="tf-properties__section-title">Show this field</h3>
                {(() => {
                  const rule = getVisibilityRule(current);
                  const candidates = fields.filter(
                    (f, i) => i !== selected && !isPresentational(f.type),
                  );
                  return (
                    <>
                      <SelectInput
                        label="When"
                        value={rule ? rule.field : ""}
                        disabled={saving || candidates.length === 0}
                        hint={
                          candidates.length === 0
                            ? "Add another field first."
                            : "Leave as Always to show it unconditionally."
                        }
                        onChange={(event) => {
                          const fieldId = event.target.value;
                          updateField(
                            selected,
                            withVisibilityRule(
                              current,
                              fieldId ? { field: fieldId, operator: rule?.operator ?? "isSet", value: rule?.value } : undefined,
                            ) as Partial<FormField>,
                          );
                        }}
                      >
                        <option value="">Always</option>
                        {candidates.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name || f.id}
                          </option>
                        ))}
                      </SelectInput>

                      {rule ? (
                        <>
                          <SelectInput
                            label="Condition"
                            value={rule.operator}
                            disabled={saving}
                            onChange={(event) =>
                              updateField(
                                selected,
                                withVisibilityRule(current, {
                                  ...rule,
                                  operator: event.target.value as VisibilityOperator,
                                }) as Partial<FormField>,
                              )
                            }
                          >
                            <option value="isSet">has any answer</option>
                            <option value="isEmpty">is empty</option>
                            <option value="equals">equals</option>
                            <option value="notEquals">does not equal</option>
                          </SelectInput>

                          {rule.operator === "equals" || rule.operator === "notEquals" ? (
                            <TextInput
                              label="Value"
                              value={rule.value ?? ""}
                              disabled={saving}
                              onChange={(event) =>
                                updateField(
                                  selected,
                                  withVisibilityRule(current, {
                                    ...rule,
                                    value: event.target.value,
                                  }) as Partial<FormField>,
                                )
                              }
                            />
                          ) : null}
                        </>
                      ) : null}
                    </>
                  );
                })()}
              </section>

              <section className="tf-properties__section">
                <div className="tf-row-actions">
                  <Button variant="secondary" disabled={saving || selected === 0} onClick={() => move(selected, -1)}>
                    Move up
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={saving || selected === fields.length - 1}
                    onClick={() => move(selected, 1)}
                  >
                    Move down
                  </Button>
                </div>
                <Button
                  variant="danger"
                  disabled={saving}
                  onClick={() => {
                    update({ fields: fields.filter((_, i) => i !== selected) });
                    setSelected(null);
                  }}
                >
                  Delete field
                </Button>
              </section>
            </>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        description={`"${form.name || model.id}" has unsaved changes. Leaving now discards them.`}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          onBack();
        }}
      />
    </section>
  );
}
