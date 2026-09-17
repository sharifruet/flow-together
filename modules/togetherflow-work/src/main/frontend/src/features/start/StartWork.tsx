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
  serverFormErrors,
  type IdentityLookup,
  type IdmApi,
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
  /** Powers the people and group pickers on a start form (FR-W.5); absent without an IDM. */
  idmApi?: IdmApi | null;
  onStarted: (kind: StartKind) => void;
}

export function StartWork({ processApi, caseApi, idmApi, onStarted }: StartWorkProps) {
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
  /** What the engine refused on the last attempt (FR-W.4); cleared per field on change. */
  const [serverErrors, setServerErrors] = useState<{ fields: Record<string, string>; general: string[] } | null>(null);

  const identityLookup = useMemo<IdentityLookup | undefined>(
    () =>
      idmApi
        ? {
            users: async (query, signal) =>
              (await idmApi.listUsers({ displayNameLike: `%${query}%`, size: 8 }, signal)).data.map((user) => ({
                id: user.id,
                label: user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.id,
              })),
            groups: async (query, signal) =>
              (await idmApi.listGroups({ nameLike: `%${query}%`, size: 8 }, signal)).data.map((group) => ({
                id: group.id,
                label: group.name || group.id,
              })),
          }
        : undefined,
    [idmApi],
  );

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
    for (const [id, message] of Object.entries(serverErrors?.fields ?? {})) visible[id] = message;
    return visible;
  }, [formErrors, touched, serverErrors]);

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
  function attemptStart(outcome?: string) {
    if (usingForm && form && Object.keys(formErrors).length > 0) {
      setTouched(Object.fromEntries(fieldIdsInOrder(form).map((id) => [id, true])));
      setSubmitAttempt((attempt) => attempt + 1);
      return;
    }
    void start(outcome);
  }

  async function start(outcome?: string) {
    if (!selected) return;
    setBusy(true);
    try {
      // With a start form the values go as `startFormVariables`, which the engine
      // validates against the form, converts and records as a submission (FR-S.2);
      // without one they are plain variables.
      const request =
        usingForm && form
          ? {
              businessKey: businessKey.trim() || undefined,
              startFormVariables: formValuesToVariables(form, formValues),
              ...(outcome ? { outcome } : {}),
            }
          : {
              businessKey: businessKey.trim() || undefined,
              variables: toRestVariables(variables),
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
      const refused = usingForm && form ? serverFormErrors(cause, form, t) : null;
      if (refused) {
        setServerErrors(refused);
        setTouched(Object.fromEntries(fieldIdsInOrder(form!).map((id) => [id, true])));
        setSubmitAttempt((attempt) => attempt + 1);
      }
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: refused ? t("form.server.rejected") : (apiError?.message ?? t(`start.failed.${kind}`)),
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
              {serverErrors?.general.length ? (
                <p className="tf-detail__note tf-detail__note--error" role="alert">
                  {t("form.server.rejected")} {serverErrors.general.join(" ")}
                </p>
              ) : null}
              <FormRenderer
                id={START_FORM_ID}
                model={form}
                values={formValues}
                errors={visibleFormErrors}
                submitAttempt={submitAttempt}
                identityLookup={identityLookup}
                disabled={busy}
                onSubmit={() => attemptStart(form.outcomes?.[0]?.id ?? form.outcomes?.[0]?.name)}
                onChange={(fieldId, value) => {
                  setServerErrors((previous) => {
                    if (!previous || !(fieldId in previous.fields)) return previous;
                    const { [fieldId]: _cleared, ...rest } = previous.fields;
                    return { ...previous, fields: rest };
                  });
                  setFormValues((previous) => ({ ...previous, [fieldId]: value }));
                }}
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
            {usingForm && form && (form.outcomes?.length ?? 0) > 0 ? (
              // A start form with outcomes offers one button per outcome (FR-W.2), the
              // first being the primary — the engine records which was pressed.
              form.outcomes!.map((outcome, index) => (
                <Button
                  key={outcome.id ?? outcome.name}
                  loading={busy}
                  variant={index === 0 ? "primary" : "secondary"}
                  onClick={() => attemptStart(outcome.id ?? outcome.name)}
                >
                  {outcome.name}
                </Button>
              ))
            ) : (
              <Button
                loading={busy}
                // Never disabled on a form: the form itself reports what is wrong.
                disabled={!usingForm && validationErrors.length > 0}
                onClick={() => attemptStart()}
              >
                {t("start.submit")}
              </Button>
            )}
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

  /*
   * `--picker` because the two branches of this screen want opposite widths: the form
   * above is prose and inputs, which stay narrow to keep line lengths readable, while
   * this is a list of things to choose between and was wasting most of a wide screen in
   * a single 760px column.
   */
  return (
    <section className="tf-start tf-start--picker" aria-label={t("start.label")}>
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
                    {definition.description ? (
                      <span className="tf-definition__description">{definition.description}</span>
                    ) : null}
                    {/*
                      The definition key (`vacationRequest`) used to sit here under every
                      name. It is how the engine identifies a process, not how the person
                      starting one thinks about it, and it appeared on every card. Search
                      still matches it, so anyone who knows a key can still find its
                      process — it just no longer labels the screen.

                      The version stays only when there is one worth mentioning: this list
                      is fetched `latest=true`, so "v1" told the reader nothing at all.
                    */}
                    {definition.version > 1 ? (
                      <span className="tf-definition__meta">
                        {t("start.version", { version: definition.version })}
                      </span>
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
