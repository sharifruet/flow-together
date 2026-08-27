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
  Badge,
  Icon,
  ApiError,
  Button,
  ConfirmDialog,
  FormRenderer,
  SelectInput,
  TextInput,
  fieldIdsInOrder,
  getVisibilityRule,
  initialValues,
  useT,
  useToast,
  validateForm,
  withVisibilityRule,
  type FormField,
  type FormFieldType,
  type FormModelResponse,
  type FormValues,
  type ModelApi,
  type ModelResponse,
  type VisibilityOperator,
} from "@togetherflow/common";
import { useConflictPrompt } from "../editors/ConflictPrompt";
import { EditorMenuBar } from "../editors/EditorMenuBar";
import { FieldProperties } from "./FieldProperties";
import {
  PALETTE,
  OPTION_TYPES,
  isPresentational,
  newField,
  parseFormModel,
} from "./formDraft";

const AUTOSAVE_IDLE_MS = 4000;

/*
 * Drag payload keys (I3). Two distinct types rather than one with a discriminator inside
 * it: `dataTransfer.types` is readable during `dragover` while the *data* is not, so
 * separate keys are what lets a drop target tell an insert from a reorder before the drop.
 */
const DRAG_NEW_FIELD = "application/x-togetherflow-field-type";
const DRAG_MOVE_FIELD = "application/x-togetherflow-field-index";

/** Namespaces the preview's field ids, keeping them clear of the builder's own controls. */
const PREVIEW_FORM_ID = "tf-form-preview";

export interface FormBuilderProps {
  modelApi: ModelApi;
  model: ModelResponse;
  initialSource: string | null;
  loadError?: string | null;
  onBack: () => void;
  /**
   * Discards local changes and re-imports what is stored (W1.1). The parent owns it: a
   * reload is a refetch plus a remount, which resets the editor's undo stack — which is
   * exactly what "take theirs, drop mine" means.
   */
  onReloadSource?: () => void;
  /** Called after a save or deploy; carries the updated draft where one exists. */
  onSaved: (draft?: ModelResponse) => void;
}

export function FormBuilder({
  modelApi,
  model,
  initialSource,
  loadError,
  onBack,
  onReloadSource,
  onSaved,
}: FormBuilderProps) {
  const t = useT();
  const { push } = useToast();
  /*
   * The concurrent-edit guard's user half (W1.1). Declared before `save` so the
   * autosave effect and the save callback can both see it.
   */
  const conflict = useConflictPrompt({ onReload: () => onReloadSource?.() });

  const parsed = useMemo(() => parseFormModel(initialSource, model), [initialSource, model]);
  const [edits, setEdits] = useState<{ modelId: string; form: FormModelResponse } | null>(null);
  const form = edits && edits.modelId === model.id ? edits.form : parsed;

  const [selected, setSelected] = useState<number | null>(null);
  /** Row the pointer is currently over during a drag, for the insertion marker. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);
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

  /**
   * Reorders a field (I3). Selection follows the field rather than the position, or
   * moving the selected row would silently switch the properties panel to its neighbour.
   */
  const moveField = (from: number, to: number) => {
    if (to < 0 || to >= fields.length || from === to) return;
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    update({ fields: next });
    setSelected(to);
  };

  /** Handles both drop kinds: a new type from the palette, and a row being reordered. */
  const onDropAt = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    setDropIndex(null);
    const newType = event.dataTransfer.getData(DRAG_NEW_FIELD);
    if (newType) {
      const created = newField(newType as FormFieldType, fields);
      const next = [...fields];
      next.splice(index, 0, created);
      update({ fields: next });
      setSelected(index);
      return;
    }
    const moveFrom = event.dataTransfer.getData(DRAG_MOVE_FIELD);
    if (moveFrom !== "") {
      const from = Number(moveFrom);
      // Dropping below the origin shifts the target up by one once the row is lifted.
      moveField(from, from < index ? index - 1 : index);
    }
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
        const written = await conflict.guard(async (overwrite) => {
          await modelApi.saveSource(model.id, JSON.stringify(form, null, 2), { overwrite });
          return true;
        });
        if (!written) return;
        setDirty(false);
        if (!options.silent) push({ tone: "success", message: t("editor.saved.toast") });
        onSaved();
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? t("form.saveFailed"),
          reference: apiError?.correlationId,
        });
      } finally {
        setSaving(false);
      }
    },
    [modelApi, model.id, form, push, onSaved, t, conflict],
  );

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    if (!dirty || conflict.blocked) return;
    const timer = setTimeout(() => void saveRef.current({ silent: true }), AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [dirty, conflict.blocked]);
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

  /*
   * Live preview (§7.4.6: "renders using the same component at runtime in Work so
   * authoring and execution stay visually consistent").
   *
   * Literally the same component, not a lookalike: a second renderer written here would
   * be the thing that drifts, and the author would be checking their work against it
   * rather than against what the person filling the form will see. It is interactive on
   * purpose — a required field, a visibility rule or a pattern is only really authored
   * once you have watched it behave.
   */
  const [tab, setTab] = useState<"fields" | "preview">("fields");
  const signature = useMemo(() => fieldIdsInOrder(form).join("|"), [form]);
  const [preview, setPreview] = useState<{ signature: string; values: FormValues }>({
    signature: "",
    values: {},
  });
  const [previewTouched, setPreviewTouched] = useState<Record<string, boolean>>({});
  const [previewAttempt, setPreviewAttempt] = useState(0);

  // Adding or removing a field re-seeds from the model's own defaults; editing a label
  // does not, so a preview being filled in is not reset by every keystroke elsewhere.
  const previewValues =
    preview.signature === signature ? preview.values : initialValues(form);

  const setPreviewValue = (fieldId: string, value: unknown) =>
    setPreview({ signature, values: { ...previewValues, [fieldId]: value } });

  const previewErrors = useMemo(
    () => validateForm(form, previewValues, t),
    [form, previewValues, t],
  );
  const visiblePreviewErrors = useMemo(() => {
    const visible: Record<string, string> = {};
    for (const [id, message] of Object.entries(previewErrors)) {
      if (previewTouched[id]) visible[id] = message;
    }
    return visible;
  }, [previewErrors, previewTouched]);

  const resetPreview = () => {
    setPreview({ signature, values: initialValues(form) });
    setPreviewTouched({});
    setPreviewAttempt(0);
  };

  /** Submits the preview, so the author sees exactly what a filler would see. */
  const submitPreview = () => {
    if (Object.keys(previewErrors).length > 0) {
      setPreviewTouched(Object.fromEntries(fieldIdsInOrder(form).map((id) => [id, true])));
      setPreviewAttempt((attempt) => attempt + 1);
      return;
    }
    push({ tone: "success", message: t("form.preview.valid") });
  };

  return (
    <section className="tf-panel" aria-label={t("editor.editing", { name: model.name || model.id })}>
      {/* W2.3 (I8): the form builder had no toolbar at all, so "save" lived somewhere
          different from every canvas editor. Now it is the same bar. */}
      <EditorMenuBar
        title={form.name || model.id}
        status={dirty ? t("editor.unsaved") : t("form.definition")}
        onBack={() => (dirty ? setConfirmLeave(true) : onBack())}
        onSave={() => void save()}
        saving={saving}
      />

      <p className="tf-banner" role="note">
        {t("form.deployNote")}
      </p>

      {loadError ? (
        <p className="tf-detail__note tf-detail__note--error" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="tf-form-builder">
        {/*
          W2.3 (I2, I3): all nineteen renderable types, grouped, and draggable onto the
          canvas. Before this the palette offered eleven and clicking appended to the end
          with no way to reorder — so a form's field order was the order you thought of
          them in.
        */}
        <nav className="tf-palette" aria-label={t("form.palette")}>
          <h2 className="tf-palette__title">{t("form.addField")}</h2>
          {PALETTE.map((group) => (
            <div className="tf-palette__group" key={group.id}>
              <h3 className="tf-palette__group-title">{t(`form.palette.${group.id}`)}</h3>
              {group.types.map(({ type, label }) => (
                <button
                  key={type}
                  type="button"
                  className="tf-palette__item"
                  disabled={saving}
                  draggable={!saving}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_NEW_FIELD, type);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  // Click still adds to the end. Drag is an addition, not a replacement:
                  // it is unavailable to a keyboard user, so the click path has to stay.
                  onClick={() => addField(type)}
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="tf-form-canvas">
          <TextInput
            label={t("form.key")}
            value={form.key ?? ""}
            disabled={saving}
            hint={t("form.key.hint")}
            onChange={(event) => update({ key: event.target.value })}
          />
          <TextInput
            label={t("form.name")}
            value={form.name ?? ""}
            disabled={saving}
            onChange={(event) => update({ name: event.target.value })}
          />

          <div className="tf-form-canvas__tabs" role="tablist" aria-label={t("form.view")}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "fields"}
              className={["tf-chip", tab === "fields" ? "tf-chip--active" : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setTab("fields")}
            >
              {t("form.fields", { count: fields.length })}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "preview"}
              className={["tf-chip", tab === "preview" ? "tf-chip--active" : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setTab("preview")}
            >
              {t("form.tab.preview")}
            </button>
          </div>

          {tab === "preview" ? (
            <section className="tf-form-preview" aria-label={t("form.preview.label")}>
              <p className="tf-form-preview__note">{t("form.preview.note")}</p>
              {fields.length === 0 ? (
                <p className="tf-muted">{t("form.noFields")}</p>
              ) : (
                <>
                  <FormRenderer
                    id={PREVIEW_FORM_ID}
                    model={form}
                    values={previewValues}
                    errors={visiblePreviewErrors}
                    submitAttempt={previewAttempt}
                    onSubmit={submitPreview}
                    onChange={setPreviewValue}
                    onBlur={(fieldId) =>
                      setPreviewTouched((previous) => ({ ...previous, [fieldId]: true }))
                    }
                    /*
                      No upload handler: a preview has no task to hang an attachment on,
                      which is the same state a start form is in, and the renderer already
                      says so rather than offering a control that cannot work.
                    */
                  />
                  <div className="tf-form-preview__actions">
                    {outcomes.length > 0 ? (
                      outcomes.map((outcome, index) => (
                        <Button key={index} onClick={submitPreview}>
                          {outcome.name}
                        </Button>
                      ))
                    ) : (
                      <Button onClick={submitPreview}>{t("form.preview.submit")}</Button>
                    )}
                    <Button variant="secondary" onClick={resetPreview}>
                      {t("form.preview.reset")}
                    </Button>
                  </div>
                </>
              )}
            </section>
          ) : fields.length === 0 ? (
            <p className="tf-muted">{t("form.noFields")}</p>
          ) : (
            <ul
              className="tf-form-fields"
              // Dropping past the last row appends, which is what "drop at the bottom"
              // means and is otherwise unreachable — the row handlers only cover rows.
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDropAt(event, fields.length)}
            >
              {fields.map((field, index) => (
                <li
                  key={field.id}
                  draggable={!saving}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_MOVE_FIELD, String(index));
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropIndex(index);
                  }}
                  onDrop={(event) => onDropAt(event, index)}
                  className={dropIndex === index ? "tf-form-fields__row--drop" : undefined}
                >
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
                    <span className="tf-form-fields__meta">
                      {/* The row grid, visible on the field list — otherwise a colspan is
                          invisible until the preview. */}
                      {field.layout?.colspan && field.layout.colspan !== 12 ? (
                        <Badge tone="neutral" subtle>
                          {t(`form.field.width.${field.layout.colspan}`)}
                        </Badge>
                      ) : null}
                      <Badge tone="info">{field.type}</Badge>
                    </span>
                  </button>
                  {/*
                    Keyboard reordering, because drag-and-drop is unavailable to a keyboard
                    user and "reorder your form" must not be a pointer-only capability.
                  */}
                  <span className="tf-form-fields__reorder">
                    <button
                      type="button"
                      className="tf-icon-button"
                      aria-label={t("form.field.moveUp", { name: field.name || field.id })}
                      disabled={saving || index === 0}
                      onClick={() => moveField(index, index - 1)}
                    >
                      <Icon name="chevron-up" size={14} />
                    </button>
                    <button
                      type="button"
                      className="tf-icon-button"
                      aria-label={t("form.field.moveDown", { name: field.name || field.id })}
                      disabled={saving || index === fields.length - 1}
                      onClick={() => moveField(index, index + 1)}
                    >
                      <Icon name="chevron-down" size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h2 className="tf-panel__section-title">
            {t("form.outcomes", { count: outcomes.length })}
          </h2>
          <p className="tf-muted">{t("form.outcomes.blurb")}</p>
          {outcomes.length > 0 ? (
            <ul className="tf-form-fields">
              {outcomes.map((outcome, index) => (
                <li className="tf-outcome-row" key={index}>
                  <TextInput
                    label={t("form.outcome", { index: index + 1 })}
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
                    aria-label={t("form.outcome.remove", { index: index + 1 })}
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
            {t("form.outcome.add")}
          </Button>

          {outcomes.length > 0 ? (
            <TextInput
              label={t("form.outcomeVariable")}
              value={form.outcomeVariableName ?? ""}
              disabled={saving}
              hint={t("form.outcomeVariable.hint")}
              onChange={(event) => update({ outcomeVariableName: event.target.value })}
            />
          ) : null}
        </div>

        <aside className="tf-properties" aria-label={t("form.fieldProperties")}>
          {!current || selected === null ? (
            <p className="tf-muted tf-properties__empty">
              {t("form.selectField")}
            </p>
          ) : (
            <>
              <header className="tf-properties__header">
                <h2 className="tf-properties__title">{current.name || current.id}</h2>
                <p className="tf-properties__type">{current.type}</p>
              </header>

              <TextInput
                label={t("form.field.id")}
                value={current.id}
                disabled={saving}
                hint={t("form.field.id.hint")}
                onChange={(event) => updateField(selected, { id: event.target.value })}
              />
              <TextInput
                label={t("form.field.label")}
                value={current.name ?? ""}
                disabled={saving}
                onChange={(event) => updateField(selected, { name: event.target.value })}
              />

              {!isPresentational(current.type) ? (
                <>
                  <TextInput
                    label={t("form.field.placeholder")}
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
                    {t("action.required")}
                  </label>
                </>
              ) : null}

              {/* W2.3 (I2): every constraint the renderer already honours. */}
              <FieldProperties
                field={current}
                disabled={saving}
                onChange={(patch) => updateField(selected, patch)}
              />

              {OPTION_TYPES.has(current.type) ? (
                <section className="tf-properties__section">
                  <h3 className="tf-properties__section-title">{t("form.options")}</h3>
                  {(("options" in current && current.options) || []).map((option, optionIndex) => (
                    <div className="tf-sentries__item" key={optionIndex}>
                      <TextInput
                        label={t("form.option", { index: optionIndex + 1 })}
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
                        aria-label={t("form.option.remove", { index: optionIndex + 1 })}
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
                    {t("form.option.add")}
                  </Button>
                </section>
              ) : null}

              {/*
                Conditional visibility is a TogetherFlow convention carried in the
                engine's free-form `params` map — Flowable's FormField has no such
                property. See visibility.ts.
              */}
              <section className="tf-properties__section">
                <h3 className="tf-properties__section-title">{t("form.visibility.title")}</h3>
                {(() => {
                  const rule = getVisibilityRule(current);
                  const candidates = fields.filter(
                    (f, i) => i !== selected && !isPresentational(f.type),
                  );
                  return (
                    <>
                      <SelectInput
                        label={t("form.visibility.when")}
                        value={rule ? rule.field : ""}
                        disabled={saving || candidates.length === 0}
                        hint={
                          candidates.length === 0
                            ? t("form.visibility.needAnother")
                            : t("form.visibility.always")
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
                        <option value="">{t("form.visibility.alwaysOption")}</option>
                        {candidates.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name || f.id}
                          </option>
                        ))}
                      </SelectInput>

                      {rule ? (
                        <>
                          <SelectInput
                            label={t("form.visibility.condition")}
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
                            <option value="isSet">{t("form.visibility.isSet")}</option>
                            <option value="isEmpty">{t("form.visibility.isEmpty")}</option>
                            <option value="equals">{t("form.visibility.equals")}</option>
                            <option value="notEquals">{t("form.visibility.notEquals")}</option>
                          </SelectInput>

                          {rule.operator === "equals" || rule.operator === "notEquals" ? (
                            <TextInput
                              label={t("form.visibility.value")}
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
                    {t("action.moveUp")}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={saving || selected === fields.length - 1}
                    onClick={() => move(selected, 1)}
                  >
                    {t("action.moveDown")}
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
                  {t("form.field.delete")}
                </Button>
              </section>
            </>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title={t("editor.leave.title")}
        description={t("editor.leave.description", { name: form.name || model.id })}
        confirmLabel={t("editor.leave.confirm")}
        cancelLabel={t("editor.leave.cancel")}
        destructive
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          onBack();
        }}
      />

      {/* Reload-or-overwrite, when someone else saved this model (W1.1). */}
      {conflict.prompt}
    </section>
  );
}
