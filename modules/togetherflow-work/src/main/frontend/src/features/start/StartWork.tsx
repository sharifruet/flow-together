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
  type CaseApi,
  type ProcessApi,
} from "@togetherflow/common";
import { VariableEditor } from "../tasks/VariableEditor";

export type StartKind = "process" | "case";

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
  const { push } = useToast();
  const [kind, setKind] = useState<StartKind>("process");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Startable | null>(null);
  const [businessKey, setBusinessKey] = useState("");
  const [variables, setVariables] = useState<EditableVariable[]>([]);
  const [formValues, setFormValues] = useState<FormValues>({});
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
        message: `Started "${selected.name ?? selected.key}".`,
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
        message: apiError?.message ?? `Could not start that ${kind}.`,
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
          ← Back to all {kind === "process" ? "processes" : "cases"}
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
                  This {kind} declares a start form, but its definition could not be loaded.
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
      <p className="tf-start__meta">
        Choose a {kind === "process" ? "process" : "case"} to start a new instance.
      </p>

      <div className="tf-inbox__filters" role="tablist" aria-label="What to start">
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
          Processes
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
          Cases
        </button>
      </div>

      <div className="tf-start__search">
        <label className="tf-visually-hidden" htmlFor="tf-definition-search">
          Search {kind === "process" ? "processes" : "cases"}
        </label>
        <input
          id="tf-definition-search"
          className="tf-input"
          type="search"
          placeholder={kind === "process" ? "Search processes…" : "Search cases…"}
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
            title={kind === "process" ? "No processes deployed" : "No cases deployed"}
            description={`Once a ${kind} is deployed to the engine, it'll be startable from here.`}
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
