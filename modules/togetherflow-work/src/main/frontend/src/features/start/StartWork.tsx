import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  EmptyState,
  FormRenderer,
  NoResultsState,
  TextInput,
  formValuesToVariables,
  hasRenderableFields,
  initialValues,
  toRestVariables,
  useAsync,
  useToast,
  validateForm,
  validateVariables,
  type EditableVariable,
  type FormValues,
  type ProcessApi,
  type ProcessDefinitionResponse,
} from "@togetherflow/common";
import { VariableEditor } from "../tasks/VariableEditor";

export interface StartWorkProps {
  processApi: ProcessApi;
  onStarted: () => void;
}

export function StartWork({ processApi, onStarted }: StartWorkProps) {
  const { push } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProcessDefinitionResponse | null>(null);
  const [businessKey, setBusinessKey] = useState("");
  const [variables, setVariables] = useState<EditableVariable[]>([]);
  const [formValues, setFormValues] = useState<FormValues>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const { data, error, loading, refetch } = useAsync(
    (signal) => processApi.listDefinitions({ latest: true }, signal),
    [processApi],
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
    async (signal) =>
      selected?.startFormDefined ? await processApi.getStartForm(selected.id, signal) : null,
    [processApi, selected?.id, selected?.startFormDefined],
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
    () => (form ? validateForm(form, formValues) : {}),
    [form, formValues],
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

  async function start() {
    if (!selected) return;
    setBusy(true);
    try {
      const instance = await processApi.start({
        processDefinitionId: selected.id,
        businessKey: businessKey.trim() || undefined,
        variables:
          usingForm && form ? formValuesToVariables(form, formValues) : toRestVariables(variables),
      });
      push({
        tone: "success",
        message: `Started "${selected.name ?? selected.key}".`,
      });
      setSelected(null);
      setBusinessKey("");
      setVariables([]);
      setFormValues({});
      setTouched({});
      onStarted();
      return instance;
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? "Could not start that process.",
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    return (
      <section className="tf-start" aria-label={`Start ${selected.name ?? selected.key}`}>
        <button type="button" className="tf-back" onClick={() => setSelected(null)}>
          ← Back to all processes
        </button>
        <h1 className="tf-start__title">{selected.name ?? selected.key}</h1>
        <p className="tf-start__meta">
          Version {selected.version}
          {selected.description ? ` · ${selected.description}` : ""}
        </p>

        <div className="tf-start__form">
          <TextInput
            label="Business key"
            hint="Optional reference you can use to find this instance later."
            value={businessKey}
            onChange={(event) => setBusinessKey(event.target.value)}
          />

          {selected.startFormDefined && startForm.loading ? (
            <p className="tf-muted">Loading form…</p>
          ) : usingForm && form ? (
            <>
              <h2 className="tf-detail__section-title">{form.name || "Start form"}</h2>
              <FormRenderer
                model={form}
                values={formValues}
                errors={visibleFormErrors}
                disabled={busy}
                onChange={(fieldId, value) =>
                  setFormValues((previous) => ({ ...previous, [fieldId]: value }))
                }
                onBlur={(fieldId) => setTouched((t) => ({ ...t, [fieldId]: true }))}
              />
            </>
          ) : (
            <>
              {selected.startFormDefined ? (
                <p className="tf-detail__note">
                  This process declares a start form, but its definition could not be loaded.
                  Set the underlying variables instead.
                </p>
              ) : null}
              <h2 className="tf-detail__section-title">Starting variables</h2>
              <VariableEditor variables={variables} onChange={setVariables} disabled={busy} />
            </>
          )}

          <div className="tf-start__actions">
            <Button variant="secondary" onClick={() => setSelected(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={validationErrors.length > 0}
              onClick={() => void start()}
            >
              Start
            </Button>
          </div>
          {validationErrors.length > 0 ? (
            <p className="tf-detail__note tf-detail__note--error" role="alert">
              {usingForm
                ? "Fill in the required fields before starting."
                : "Fix the highlighted variables before starting."}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="tf-start" aria-label="Start new work">
      <h1 className="tf-start__title">Start work</h1>
      <p className="tf-start__meta">Choose a process to start a new instance.</p>

      <div className="tf-start__search">
        <label className="tf-visually-hidden" htmlFor="tf-definition-search">
          Search processes
        </label>
        <input
          id="tf-definition-search"
          className="tf-input"
          type="search"
          placeholder="Search processes…"
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
            title="No processes deployed"
            description="Once a process is deployed to the engine, it'll be startable from here."
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
