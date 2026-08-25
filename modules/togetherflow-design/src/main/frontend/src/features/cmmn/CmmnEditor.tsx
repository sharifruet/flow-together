/**
 * CMMN case editor (REQUIREMENTS.md §7.4.3).
 *
 * Same guarantees as the BPMN editor — autosave, unsaved-changes guard, undo/redo —
 * over a hand-built canvas. Undo history is a stack of whole model snapshots: the
 * models are small enough that this is cheaper than command objects and cannot drift
 * out of sync with what is on screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  Button,
  ConfirmDialog,
  ErrorState,
  Skeleton,
  TextInput,
  useToast,
  type ModelApi,
  type ModelResponse,
} from "@togetherflow/common";
import { CmmnCanvas } from "./CmmnCanvas";
import {
  TYPE_LABELS,
  createElement,
  emptyCase,
  parseCmmn,
  removeElement,
  serialiseCmmn,
  type CmmnCase,
  type CmmnElement,
  type CmmnElementType,
} from "./cmmnModel";

const AUTOSAVE_IDLE_MS = 4000;
const UNDO_LIMIT = 50;

const PALETTE: CmmnElementType[] = [
  "stage",
  "humanTask",
  "processTask",
  "decisionTask",
  "caseTask",
  "serviceTask",
  "milestone",
  "timerEventListener",
  "userEventListener",
];

export interface CmmnEditorProps {
  modelApi: ModelApi;
  model: ModelResponse;
  initialXml: string | null;
  loadError?: string | null;
  onBack: () => void;
  onSaved: () => void;
}

export function CmmnEditor({
  modelApi,
  model,
  initialXml,
  loadError,
  onBack,
  onSaved,
}: CmmnEditorProps) {
  const { push } = useToast();
  /**
   * The parse happens during render, and only *edits* live in state, keyed by model
   * id. Syncing parsed input into state from an effect would cost a cascading render
   * and could disagree with the input it was derived from.
   */
  const parsed = useMemo(() => {
    if (initialXml === null) return { model: null as CmmnCase | null, error: null as string | null };
    try {
      return { model: parseCmmn(initialXml), error: null };
    } catch (cause) {
      return { model: null, error: (cause as Error).message || "This case model could not be opened." };
    }
  }, [initialXml]);

  /** Undo history as state, not refs: `canUndo`/`canRedo` then derive safely. */
  const [edits, setEdits] = useState<{
    modelId: string;
    past: CmmnCase[];
    present: CmmnCase;
    future: CmmnCase[];
  } | null>(null);

  // Memoised so the callbacks below keep stable identities; without it the object is
  // rebuilt every render and every dependent useCallback churns with it.
  const history = useMemo(
    () =>
      edits && edits.modelId === model.id
        ? edits
        : parsed.model
          ? { modelId: model.id, past: [] as CmmnCase[], present: parsed.model, future: [] as CmmnCase[] }
          : null,
    [edits, model.id, parsed.model],
  );

  const caseModel = history?.present ?? null;
  const parseError = parsed.error;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);

  /** A committed change: pushes the previous state onto the undo stack. */
  const commit = useCallback(
    (next: CmmnCase) => {
      if (!history) return;
      setEdits({
        modelId: model.id,
        past: [...history.past, history.present].slice(-UNDO_LIMIT),
        present: next,
        future: [],
      });
      setDirty(true);
    },
    [history, model.id],
  );

  /** A live gesture preview: no history entry, so undo steps stay meaningful. */
  const preview = useCallback(
    (next: CmmnCase) => {
      if (!history) return;
      setEdits({ ...history, modelId: model.id, present: next });
    },
    [history, model.id],
  );

  const undo = useCallback(() => {
    if (!history || history.past.length === 0) return;
    setEdits({
      modelId: model.id,
      past: history.past.slice(0, -1),
      present: history.past[history.past.length - 1],
      future: [...history.future, history.present],
    });
    setDirty(true);
  }, [history, model.id]);

  const redo = useCallback(() => {
    if (!history || history.future.length === 0) return;
    setEdits({
      modelId: model.id,
      past: [...history.past, history.present],
      present: history.future[history.future.length - 1],
      future: history.future.slice(0, -1),
    });
    setDirty(true);
  }, [history, model.id]);

  const selected = useMemo(
    () => caseModel?.elements.find((el) => el.planItemId === selectedId) ?? null,
    [caseModel, selectedId],
  );

  const addElement = (type: CmmnElementType) => {
    if (!caseModel) return;
    const plan = caseModel.planModelBounds;
    // Offset each new element so a run of additions does not stack on one spot.
    const offset = caseModel.elements.length * 20;
    const element = createElement(
      type,
      { x: plan.x + 40 + (offset % 240), y: plan.y + 60 + (offset % 180) },
      caseModel.planModelId,
    );
    commit({ ...caseModel, elements: [...caseModel.elements, element] });
    setSelectedId(element.planItemId);
  };

  const updateSelected = (changes: Partial<CmmnElement>) => {
    if (!caseModel || !selectedId) return;
    commit({
      ...caseModel,
      elements: caseModel.elements.map((el) =>
        el.planItemId === selectedId ? { ...el, ...changes } : el,
      ),
    });
  };

  const deleteSelected = useCallback(() => {
    if (!caseModel || !selectedId || selectedId === caseModel.planModelId) return;
    commit(removeElement(caseModel, selectedId));
    setSelectedId(null);
  }, [caseModel, selectedId, commit]);

  const save = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!caseModel) return;
      setSaving(true);
      try {
        await modelApi.saveSource(model.id, serialiseCmmn(caseModel));
        setDirty(false);
        setLastSavedAt(new Date());
        if (!options.silent) push({ tone: "success", message: "Saved." });
        onSaved();
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? "Could not save this case model.",
          reference: apiError?.correlationId,
        });
      } finally {
        setSaving(false);
      }
    },
    [caseModel, modelApi, model.id, push, onSaved],
  );

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (!dirty || !caseModel) return;
    const timer = setTimeout(() => void saveRef.current({ silent: true }), AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [dirty, caseModel]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (!typing && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        deleteSelected();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [save, undo, redo, deleteSelected]);

  const deploy = async () => {
    if (!caseModel) return;
    setDeploying(true);
    try {
      const xml = serialiseCmmn(caseModel);
      await modelApi.saveSource(model.id, xml);
      setDirty(false);
      setLastSavedAt(new Date());
      const deployment = await modelApi.deploy(model, xml);
      push({ tone: "success", message: `Deployed as ${deployment.id}.` });
      onSaved();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? "Deployment failed.",
        reference: apiError?.correlationId,
      });
    } finally {
      setDeploying(false);
    }
  };

  const busy = saving || deploying;
  const canUndo = (history?.past.length ?? 0) > 0;
  const canRedo = (history?.future.length ?? 0) > 0;

  return (
    <section className="tf-editor" aria-label={`Editing ${model.name || model.id}`}>
      <header className="tf-editor__header">
        <div className="tf-editor__identity">
          <button
            type="button"
            className="tf-back"
            onClick={() => (dirty ? setConfirmLeave(true) : onBack())}
          >
            ← Back to models
          </button>
          <h1 className="tf-editor__title">{model.name || model.key || model.id}</h1>
          <p className="tf-editor__meta" aria-live="polite">
            {dirty
              ? "Unsaved changes"
              : lastSavedAt
                ? `Saved ${lastSavedAt.toLocaleTimeString()}`
                : "No changes"}
          </p>
        </div>
        <div className="tf-editor__actions">
          <div className="tf-editor__group" role="group" aria-label="History">
            <Button variant="secondary" disabled={!canUndo || busy} onClick={undo}>
              Undo
            </Button>
            <Button variant="secondary" disabled={!canRedo || busy} onClick={redo}>
              Redo
            </Button>
          </div>
          <Button variant="secondary" loading={saving} disabled={!caseModel} onClick={() => void save()}>
            Save
          </Button>
          <Button loading={deploying} disabled={!caseModel} onClick={() => setConfirmDeploy(true)}>
            Deploy
          </Button>
        </div>
      </header>

      {loadError ? <ErrorState error={new Error(loadError)} /> : null}
      {parseError ? <ErrorState error={new Error(parseError)} /> : null}

      {!caseModel && !parseError && !loadError ? (
        <div className="tf-editor__loading-standalone">
          <Skeleton rows={6} label="Loading case model" />
        </div>
      ) : null}

      {caseModel ? (
        <div className="tf-editor__body tf-editor__body--cmmn">
          <nav className="tf-palette" aria-label="Palette">
            <h2 className="tf-palette__title">Add</h2>
            {PALETTE.map((type) => (
              <button
                key={type}
                type="button"
                className="tf-palette__item"
                disabled={busy}
                onClick={() => addElement(type)}
              >
                {TYPE_LABELS[type]}
              </button>
            ))}
          </nav>

          <div className="tf-editor__canvas-wrap tf-editor__canvas-wrap--scroll">
            <CmmnCanvas
              model={caseModel}
              selectedId={selectedId}
              disabled={busy}
              onSelect={setSelectedId}
              onCommit={commit}
              onPreview={preview}
            />
          </div>

          <CmmnProperties
            model={caseModel}
            element={selected}
            isPlanModel={selectedId === caseModel.planModelId}
            disabled={busy}
            onChangeElement={updateSelected}
            onChangeCase={(changes) => commit({ ...caseModel, ...changes })}
            onDelete={deleteSelected}
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        description={`"${model.name || model.id}" has unsaved changes. Leaving now discards them.`}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          onBack();
        }}
      />

      <ConfirmDialog
        open={confirmDeploy}
        title="Deploy this case?"
        description={`"${model.name || model.id}" will be saved and deployed to the case engine. New case instances use this version; instances already running keep the version they started on.`}
        confirmLabel="Save and deploy"
        busy={deploying}
        onCancel={() => setConfirmDeploy(false)}
        onConfirm={() => {
          setConfirmDeploy(false);
          void deploy();
        }}
      />
    </section>
  );
}

function CmmnProperties({
  model,
  element,
  isPlanModel,
  disabled,
  onChangeElement,
  onChangeCase,
  onDelete,
}: {
  model: CmmnCase;
  element: CmmnElement | null;
  isPlanModel: boolean;
  disabled: boolean;
  onChangeElement: (changes: Partial<CmmnElement>) => void;
  onChangeCase: (changes: Partial<CmmnCase>) => void;
  onDelete: () => void;
}) {
  if (isPlanModel) {
    return (
      <aside className="tf-properties" aria-label="Case properties">
        <header className="tf-properties__header">
          <h2 className="tf-properties__title">Case</h2>
          <p className="tf-properties__type">cmmn:Case</p>
        </header>
        <TextInput
          label="Case id"
          value={model.caseId}
          disabled={disabled}
          hint="The key the engine starts this case by."
          onChange={(event) => onChangeCase({ caseId: event.target.value })}
        />
        <TextInput
          label="Case name"
          value={model.caseName}
          disabled={disabled}
          onChange={(event) => onChangeCase({ caseName: event.target.value })}
        />
        <TextInput
          label="Plan model name"
          value={model.planModelName}
          disabled={disabled}
          onChange={(event) => onChangeCase({ planModelName: event.target.value })}
        />
      </aside>
    );
  }

  if (!element) {
    return (
      <aside className="tf-properties" aria-label="Element properties">
        <p className="tf-muted tf-properties__empty">
          Select an element on the canvas, or the case plan model, to edit its properties.
        </p>
      </aside>
    );
  }

  const setAttr = (key: string, value: string) =>
    onChangeElement({
      attributes: value.trim()
        ? { ...element.attributes, [key]: value }
        : Object.fromEntries(Object.entries(element.attributes).filter(([k]) => k !== key)),
    });

  return (
    <aside className="tf-properties" aria-label="Element properties">
      <header className="tf-properties__header">
        <h2 className="tf-properties__title">{TYPE_LABELS[element.type]}</h2>
        <p className="tf-properties__type">cmmn:{element.type}</p>
      </header>

      <TextInput
        label="Id"
        value={element.definitionId}
        disabled={disabled}
        hint="Referenced by the engine and by sentries."
        onChange={(event) => onChangeElement({ definitionId: event.target.value })}
      />
      <TextInput
        label="Name"
        value={element.name}
        disabled={disabled}
        onChange={(event) => onChangeElement({ name: event.target.value })}
      />

      {element.type === "humanTask" ? (
        <section className="tf-properties__section">
          <h3 className="tf-properties__section-title">Flowable</h3>
          <TextInput
            label="Assignee"
            value={element.attributes.assignee ?? ""}
            disabled={disabled}
            hint="A user id, or an expression."
            onChange={(event) => setAttr("assignee", event.target.value)}
          />
          <TextInput
            label="Candidate groups"
            value={element.attributes.candidateGroups ?? ""}
            disabled={disabled}
            onChange={(event) => setAttr("candidateGroups", event.target.value)}
          />
          <TextInput
            label="Form key"
            value={element.attributes.formKey ?? ""}
            disabled={disabled}
            onChange={(event) => setAttr("formKey", event.target.value)}
          />
        </section>
      ) : null}

      {element.type === "processTask" ? (
        <TextInput
          label="Process reference"
          value={element.attributes.processRef ?? ""}
          disabled={disabled}
          hint="Key of the BPMN process to start."
          onChange={(event) => setAttr("processRef", event.target.value)}
        />
      ) : null}

      {element.type === "decisionTask" ? (
        <TextInput
          label="Decision reference"
          value={element.attributes.decisionRef ?? ""}
          disabled={disabled}
          hint="Key of the DMN decision to evaluate."
          onChange={(event) => setAttr("decisionRef", event.target.value)}
        />
      ) : null}

      {!element.type.endsWith("EventListener") && element.type !== "milestone" ? (
        <label className="tf-checkbox tf-checkbox--block">
          <input
            type="checkbox"
            checked={element.blocking !== false}
            disabled={disabled}
            onChange={(event) => onChangeElement({ blocking: event.target.checked })}
          />
          Blocking
        </label>
      ) : null}

      <section className="tf-properties__section">
        <h3 className="tf-properties__section-title">Entry criteria</h3>
        {element.entrySentries.length === 0 ? (
          <p className="tf-muted">Starts as soon as its stage becomes active.</p>
        ) : (
          <ul className="tf-sentries">
            {element.entrySentries.map((sentry) => (
              <li key={sentry.id} className="tf-sentries__item">
                <select
                  className="tf-input tf-select"
                  aria-label="Wait for"
                  value={sentry.sourceRef ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    onChangeElement({
                      entrySentries: element.entrySentries.map((s) =>
                        s.id === sentry.id ? { ...s, sourceRef: event.target.value || undefined } : s,
                      ),
                    })
                  }
                >
                  <option value="">Choose an element…</option>
                  {model.elements
                    .filter((el) => el.planItemId !== element.planItemId)
                    .map((el) => (
                      <option key={el.planItemId} value={el.planItemId}>
                        {el.name || el.definitionId}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="tf-chip-item__remove"
                  aria-label="Remove entry criterion"
                  disabled={disabled}
                  onClick={() =>
                    onChangeElement({
                      entrySentries: element.entrySentries.filter((s) => s.id !== sentry.id),
                    })
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() =>
            onChangeElement({
              entrySentries: [
                ...element.entrySentries,
                { id: `crit_${Date.now().toString(36)}`, standardEvent: "complete" },
              ],
            })
          }
        >
          Add entry criterion
        </Button>
      </section>

      <div className="tf-properties__section">
        <Button variant="danger" disabled={disabled} onClick={onDelete}>
          Delete element
        </Button>
      </div>
    </aside>
  );
}

export { emptyCase };
