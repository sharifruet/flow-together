/**
 * Start new work (REQUIREMENTS.md §7.1): browse what the user may start, and start it.
 *
 * Processes and cases live on different engines and different servlets, but from the
 * user's side "start something" is one job, so they share one screen with a kind
 * switch rather than being split into two pages.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  EmptyState,
  FormRenderer,
  NoResultsState,
  TextInput,
  fieldIdsInOrder,
  formValuesToVariables,
  hasRenderableFields,
  initialValues,
  toRestVariables,
  useAsync,
  useT,
  useToast,
  validateForm,
  validateVariables,
  type EditableVariable,
  type FormValues,
  type CaseApi,
  type ProcessApi,
} from "@togetherflow/common";
import { VariableEditor } from "../tasks/VariableEditor";

export type StartKind = "process" | "case";

/** Namespaces the start form's field ids, so its error summary links resolve. */
const START_FORM_ID = "tf-start-form";

/** What both definition kinds have in common, as far as this screen is concerned. */
type Startable = {
  id: string;
  key: string;
  name?: string;
  version: number;
  description?: string;
  startFormDefined?: boolean;
};

export interface StartWorkProps {
  processApi: ProcessApi;
  caseApi: CaseApi;
  onStarted: (kind: StartKind) => void;
}

export function StartWork({ processApi, caseApi, onStarted }: StartWorkProps) {
  const t = useT();
  const { push } = useToast();
  const [kind, setKind] = useState<StartKind>("process");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Startable | null>(null);
  const [businessKey, setBusinessKey] = useState("");
  const [variables, setVariables] = useState<EditableVariable[]>([]);
  const [formValues, setFormValues] = useState<FormValues>({});
  /** Bumped per rejected submit, so a second attempt re-announces rather than going quiet. */
  const [submitAttempt, setSubmitAttempt] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const { data, error, loading, refetch } = useAsync(
    async (signal) =>
      kind === "process"
        ? await processApi.listDefinitions({ latest: true }, signal)
        : await caseApi.listDefinitions({ latest: true }, signal),
    [processApi, caseApi, kind],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data.data;
    return data.data.filter((definition) =>
      `${definition.name ?? ""} ${definition.key}`.toLowerCase().includes(term),
    );
  }, [data, search]);

  // Only fetched once a definition is chosen, and only when it declares a start form.
  const startForm = useAsync(
    async (signal) => {
      if (!selected?.startFormDefined) return null;
      return kind === "process"
        ? await processApi.getStartForm(selected.id, signal)
        : await caseApi.getStartForm(selected.id, signal);
    },
    [processApi, caseApi, kind, selected?.id, selected?.startFormDefined],
  );

  const form = startForm.data ?? undefined;
  const usingForm = hasRenderableFields(form);

  // Seed defaults from the model the first time it loads for this definition.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (form && selected && seededFor.current !== selected.id) {
      seededFor.current = selected.id;
      setFormValues(initialValues(form));
      setTouched({});
    }
  }, [form, selected]);

  const formErrors = useMemo(
    () => (form ? validateForm(form, formValues, t) : {}),
    [form, formValues, t],
  );
  const visibleFormErrors = useMemo(() => {
    const visible: Record<string, string> = {};
    for (const [id, message] of Object.entries(formErrors)) {
      if (touched[id]) visible[id] = message;
    }
    return visible;
  }, [formErrors, touched]);

  const gridErrors = useMemo(() => validateVariables(variables), [variables]);
  const validationErrors = usingForm
    ? Object.keys(formErrors).map((name) => ({ name, message: formErrors[name] }))
    : gridErrors;

  /**
   * A submit attempt is always accepted (§14.1). An invalid form answers by revealing
   * every problem and listing them in a summary that takes focus — a Start button that
   * is simply disabled tells a user who has not visited the required field nothing at
   * all about why.
   */
  function attemptStart() {
    if (usingForm && form && Object.keys(formErrors).length > 0) {
      setTouched(Object.fromEntries(fieldIdsInOrder(form).map((id) => [id, true])));
      setSubmitAttempt((attempt) => attempt + 1);
      return;
    }
    void start();
  }

  async function start() {
    if (!selected) return;
    setBusy(true);
    try {
      const request = {
        businessKey: businessKey.trim() || undefined,
        variables:
          usingForm && form ? formValuesToVariables(form, formValues) : toRestVariables(variables),
      };
      const instance =
        kind === "process"
          ? await processApi.start({ ...request, processDefinitionId: selected.id })
          : await caseApi.start({ ...request, caseDefinitionId: selected.id });
      push({
        tone: "success",
        message: t("start.started", { name: selected.name ?? selected.key }),
      });
      setSelected(null);
      setBusinessKey("");
      setVariables([]);
      setFormValues({});
      setTouched({});
      onStarted(kind);
      return instance;
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t(`start.failed.${kind}`),
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    return (
      <section
        className="tf-start"
        aria-label={t("start.label.for", { name: selected.name ?? selected.key })}
      >
        <button type="button" className="tf-back" onClick={() => setSelected(null)}>
          {t(`start.back.${kind}`)}
        </button>
        <h1 className="tf-start__title">{selected.name ?? selected.key}</h1>
        <p className="tf-start__meta">
          {t("start.version", { version: selected.version })}
          {selected.description ? ` · ${selected.description}` : ""}
        </p>

        <div className="tf-start__form">
          <TextInput
            label={t("start.businessKey")}
            hint={t("start.businessKey.hint")}
            value={businessKey}
            onChange={(event) => setBusinessKey(event.target.value)}
          />

          {selected.startFormDefined && startForm.loading ? (
            <p className="tf-muted">{t("start.form.loading")}</p>
          ) : usingForm && form ? (
            <>
              <h2 className="tf-detail__section-title">
                {form.name || t("start.form.title")}
              </h2>
              <FormRenderer
                id={START_FORM_ID}
                model={form}
                values={formValues}
                errors={visibleFormErrors}
                submitAttempt={submitAttempt}
                disabled={busy}
                onSubmit={attemptStart}
                onChange={(fieldId, value) =>
                  setFormValues((previous) => ({ ...previous, [fieldId]: value }))
                }
                onBlur={(fieldId) => setTouched((previous) => ({ ...previous, [fieldId]: true }))}
              />
            </>
          ) : (
            <>
              {selected.startFormDefined ? (
                <p className="tf-detail__note">{t(`start.form.unloadable.${kind}`)}</p>
              ) : null}
              <h2 className="tf-detail__section-title">{t("start.variables")}</h2>
              <VariableEditor variables={variables} onChange={setVariables} disabled={busy} />
            </>
          )}

          <div className="tf-start__actions">
            <Button variant="secondary" onClick={() => setSelected(null)} disabled={busy}>
              {t("dialog.cancel")}
            </Button>
            <Button
              loading={busy}
              // Never disabled on a form: the form itself reports what is wrong.
              disabled={!usingForm && validationErrors.length > 0}
              onClick={attemptStart}
            >
              {t("start.submit")}
            </Button>
          </div>
          {!usingForm && validationErrors.length > 0 ? (
            <p className="tf-detail__note tf-detail__note--error" role="alert">
              {t("start.validation.variables")}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="tf-start" aria-label={t("start.label")}>
      <h1 className="tf-start__title">{t("start.title")}</h1>
      <p className="tf-start__meta">{t(`start.choose.${kind}`)}</p>

      <div className="tf-inbox__filters" role="tablist" aria-label={t("start.kindLabel")}>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "process"}
          className={["tf-chip", kind === "process" ? "tf-chip--active" : ""].filter(Boolean).join(" ")}
          onClick={() => {
            setKind("process");
            setSearch("");
          }}
        >
          {t("start.kind.process")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "case"}
          className={["tf-chip", kind === "case" ? "tf-chip--active" : ""].filter(Boolean).join(" ")}
          onClick={() => {
            setKind("case");
            setSearch("");
          }}
        >
          {t("start.kind.case")}
        </button>
      </div>

      <div className="tf-start__search">
        <label className="tf-visually-hidden" htmlFor="tf-definition-search">
          {t(`start.search.${kind}`)}
        </label>
        <input
          id="tf-definition-search"
          className="tf-input"
          type="search"
          placeholder={t(`start.search.placeholder.${kind}`)}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          <EmptyState
            title={t(`start.empty.${kind}.title`)}
            description={t(`start.empty.${kind}.description`)}
          />
        }
      >
        {() =>
          filtered.length === 0 ? (
            <NoResultsState onClear={() => setSearch("")} />
          ) : (
            <ul className="tf-definitions">
              {filtered.map((definition) => (
                <li key={definition.id}>
                  <button
                    type="button"
                    className="tf-definition"
                    onClick={() => setSelected(definition)}
                  >
                    <span className="tf-definition__name">
                      {definition.name ?? definition.key}
                    </span>
                    <span className="tf-definition__meta">
                      {definition.key} · v{definition.version}
                    </span>
                    {definition.description ? (
                      <span className="tf-definition__description">{definition.description}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </AsyncBoundary>
    </section>
  );
}
