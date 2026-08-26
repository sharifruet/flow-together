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
  useI18n,
  useT,
  useToast,
  type ModelApi,
  type ModelResponse,
  type ModelValidationApi,
  type TFunction,
} from "@togetherflow/common";
import { canDeploy, issuesFromServer, type ValidationIssue } from "../bpmn/validateBpmn";
import { CmmnCanvas, DEFAULT_VIEWPORT, type Viewport } from "./CmmnCanvas";
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
  type Sentry,
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
  /**
   * Server-side model validation (§7.4.2, §7.4.3). Unlike BPMN there are no browser-side
   * checks to fall back on — the engine's `CaseValidator` is the only validator there is
   * for CMMN — so when this is absent, or unreachable, the editor simply does not claim
   * to have checked anything.
   */
  validationApi?: ModelValidationApi;
  model: ModelResponse;
  initialXml: string | null;
  loadError?: string | null;
  onBack: () => void;
  /** Called after a save or deploy; carries the updated draft where one exists. */
  onSaved: (draft?: ModelResponse) => void;
}

export function CmmnEditor({
  modelApi,
  validationApi,
  model,
  initialXml,
  loadError,
  onBack,
  onSaved,
}: CmmnEditorProps) {
  const { t, locale } = useI18n();
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
      return { model: null, error: (cause as Error).message || t("cmmn.openFailed") };
    }
  }, [initialXml, t]);

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
  /**
   * The whole selection. `selectedId` — the last one picked — drives the properties
   * panel; the rest only matter for moving and deleting together.
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);

  const select = useCallback((planItemId: string | null, options?: { additive?: boolean }) => {
    if (planItemId === null) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((current) => {
      if (!options?.additive) return [planItemId];
      // Shift-clicking something already selected removes it, which is what every
      // other selection UI does.
      return current.includes(planItemId)
        ? current.filter((id) => id !== planItemId)
        : [...current, planItemId];
    });
  }, []);

  const setSelectedId = useCallback(
    (planItemId: string | null) => setSelectedIds(planItemId ? [planItemId] : []),
    [],
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [checking, setChecking] = useState(false);

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
    if (!caseModel || selectedIds.length === 0) return;
    // The case plan model is the diagram itself and cannot be deleted.
    const removable = selectedIds.filter((id) => id !== caseModel.planModelId);
    if (removable.length === 0) return;
    const next = removable.reduce((model, id) => removeElement(model, id), caseModel);
    commit(next);
    setSelectedIds([]);
  }, [caseModel, selectedIds, commit]);

  /**
   * Validates the case against the engine's own `CaseValidator` (§7.4.3).
   *
   * Returns the issues so `startDeploy` can decide on them without validating twice. An
   * unreachable validator returns null rather than an empty list: "nothing was reported"
   * and "nothing could be asked" must not look the same to the caller, or a deploy would
   * be waved through on the strength of a failed request.
   */
  const runChecks = useCallback(async (): Promise<ValidationIssue[] | null> => {
    if (!caseModel || !validationApi) return null;
    try {
      const verdict = await validationApi.validateCmmn(serialiseCmmn(caseModel));
      return issuesFromServer(verdict);
    } catch {
      push({ tone: "warning", message: t("cmmn.checks.unreachable") });
      return null;
    }
  }, [caseModel, push, t, validationApi]);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const found = await runChecks();
      setIssues(found);
      if (found && found.length === 0) push({ tone: "success", message: t("cmmn.checksClean") });
    } finally {
      setChecking(false);
    }
  }, [push, runChecks, t]);

  /** Deploying validates first; blocking problems stop it before the round trip. */
  const startDeploy = useCallback(async () => {
    setChecking(true);
    try {
      const found = await runChecks();
      setIssues(found && found.length > 0 ? found : null);
      if (found && !canDeploy(found)) {
        push({ tone: "error", message: t("cmmn.fixBeforeDeploy") });
        return;
      }
    } finally {
      setChecking(false);
    }
    setConfirmDeploy(true);
  }, [push, runChecks, t]);

  /**
   * Cuts a version from the model as it stands (§7.4.1) — the checkpoint before a risky
   * edit. Saves first, so the version records what the user is looking at rather than
   * whatever was last written.
   */
  const saveVersion = useCallback(async () => {
    if (!caseModel) return;
    setSaving(true);
    try {
      const xml = serialiseCmmn(caseModel);
      await modelApi.saveSource(model.id, xml);
      const draft = await modelApi.cutVersion(model, xml);
      setDirty(false);
      setLastSavedAt(new Date());
      push({ tone: "success", message: t("editor.versionSaved", { version: draft.version ?? 1 }) });
      onSaved(draft);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("editor.versionFailed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setSaving(false);
    }
  }, [caseModel, modelApi, model, push, onSaved, t]);

  const save = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!caseModel) return;
      setSaving(true);
      try {
        await modelApi.saveSource(model.id, serialiseCmmn(caseModel));
        setDirty(false);
        setLastSavedAt(new Date());
        if (!options.silent) push({ tone: "success", message: t("editor.saved.toast") });
        onSaved();
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? t("cmmn.saveFailed"),
          reference: apiError?.correlationId,
        });
      } finally {
        setSaving(false);
      }
    },
    [caseModel, modelApi, model.id, push, onSaved, t],
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
      push({ tone: "success", message: t("editor.deployed", { id: deployment.id }) });
      // Deploying cuts a version (§7.4.1), so the draft's version number has moved on.
      // The row itself is unchanged, which is why nothing has to re-import.
      onSaved(deployment.draft);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("editor.deployFailed"),
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
    <section className="tf-editor" aria-label={t("editor.editing", { name: model.name || model.id })}>
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
              ? t("editor.unsaved")
              : lastSavedAt
                ? t("editor.saved", { time: lastSavedAt.toLocaleTimeString(locale) })
                : t("editor.noChanges")}
          </p>
        </div>
        <div className="tf-editor__actions">
          <div className="tf-editor__group" role="group" aria-label={t("editor.history")}>
            <Button variant="secondary" disabled={!canUndo || busy} onClick={undo}>
              {t("action.undo")}
            </Button>
            <Button variant="secondary" disabled={!canRedo || busy} onClick={redo}>
              {t("action.redo")}
            </Button>
          </div>
          <div className="tf-editor__group" role="group" aria-label={t("editor.zoom")}>
            <Button
              variant="secondary"
              aria-label={t("editor.zoomOut")}
              onClick={() => setViewport((v) => ({ ...v, scale: Math.max(0.25, v.scale / 1.2) }))}
            >
              −
            </Button>
            <Button variant="secondary" onClick={() => setViewport(DEFAULT_VIEWPORT)}>
              {t("action.fit")}
            </Button>
            <Button
              variant="secondary"
              aria-label={t("editor.zoomIn")}
              onClick={() => setViewport((v) => ({ ...v, scale: Math.min(3, v.scale * 1.2) }))}
            >
              +
            </Button>
          </div>
          <Button
            variant="secondary"
            loading={checking}
            disabled={!caseModel || !validationApi}
            onClick={() => void check()}
          >
            {t("action.check")}
          </Button>
          <Button variant="secondary" loading={saving} disabled={!caseModel} onClick={() => void save()}>
            {t("action.save")}
          </Button>
          <Button
            variant="secondary"
            loading={saving}
            disabled={!caseModel}
            onClick={() => void saveVersion()}
          >
            {t("editor.saveVersion")}
          </Button>
          <Button
            loading={deploying || checking}
            disabled={!caseModel}
            onClick={() => void startDeploy()}
          >
            {t("action.deploy")}
          </Button>
        </div>
      </header>

      {issues && issues.length > 0 ? (
        <section className="tf-issues" aria-label={t("cmmn.checksLabel")}>
          <h2 className="tf-issues__title">
            {t("bpmn.checks.summary.problems", {
              count: issues.filter((i) => i.severity === "error").length,
            })}
            {", "}
            {t("bpmn.checks.summary.warnings", {
              count: issues.filter((i) => i.severity === "warning").length,
            })}
          </h2>
          <ul className="tf-issues__list">
            {issues.map((issue, index) => (
              <li
                className={`tf-issues__item tf-issues__item--${issue.severity}`}
                key={`${issue.elementId ?? ""}-${index}`}
              >
                <span className="tf-issues__severity">{issue.severity}</span>
                <span>{issue.message}</span>
                {issue.elementId ? (
                  <button
                    type="button"
                    className="tf-issues__locate"
                    onClick={() => setSelectedIds([issue.elementId!])}
                  >
                    {t("action.show")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="tf-issues__caveat">{t("cmmn.checks.caveat")}</p>
          <Button variant="secondary" onClick={() => setIssues(null)}>
            {t("action.dismiss")}
          </Button>
        </section>
      ) : null}

      {loadError ? <ErrorState error={new Error(loadError)} /> : null}
      {parseError ? <ErrorState error={new Error(parseError)} /> : null}

      {!caseModel && !parseError && !loadError ? (
        <div className="tf-editor__loading-standalone">
          <Skeleton rows={6} label={t("cmmn.loading")} />
        </div>
      ) : null}

      {caseModel ? (
        <div className="tf-editor__body tf-editor__body--cmmn">
          <nav className="tf-palette" aria-label={t("cmmn.palette")}>
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
              selectedIds={selectedIds}
              disabled={busy}
              onSelect={select}
              onSelectMany={setSelectedIds}
              viewport={viewport}
              onViewportChange={setViewport}
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
        title={t("editor.leave.title")}
        description={t("editor.leave.description", { name: model.name || model.id })}
        confirmLabel={t("editor.leave.confirm")}
        cancelLabel={t("editor.leave.cancel")}
        destructive
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          onBack();
        }}
      />

      <ConfirmDialog
        open={confirmDeploy}
        title={t("cmmn.deploy.title")}
        description={t("cmmn.deploy.description", { name: model.name || model.id })}
        confirmLabel={t("cmmn.deploy.confirm")}
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
  const t = useT();
  if (isPlanModel) {
    return (
      <aside className="tf-properties" aria-label={t("cmmn.caseProperties")}>
        <header className="tf-properties__header">
          <h2 className="tf-properties__title">{t("cmmn.case")}</h2>
          <p className="tf-properties__type">cmmn:Case</p>
        </header>
        <TextInput
          label={t("cmmn.caseId")}
          value={model.caseId}
          disabled={disabled}
          hint={t("cmmn.caseId.hint")}
          onChange={(event) => onChangeCase({ caseId: event.target.value })}
        />
        <TextInput
          label={t("cmmn.caseName")}
          value={model.caseName}
          disabled={disabled}
          onChange={(event) => onChangeCase({ caseName: event.target.value })}
        />
        <TextInput
          label={t("cmmn.planModelName")}
          value={model.planModelName}
          disabled={disabled}
          onChange={(event) => onChangeCase({ planModelName: event.target.value })}
        />
      </aside>
    );
  }

  if (!element) {
    return (
      <aside className="tf-properties" aria-label={t("properties.label")}>
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
    <aside className="tf-properties" aria-label={t("properties.label")}>
      <header className="tf-properties__header">
        <h2 className="tf-properties__title">{TYPE_LABELS[element.type]}</h2>
        <p className="tf-properties__type">cmmn:{element.type}</p>
      </header>

      <TextInput
        label={t("properties.id")}
        value={element.definitionId}
        disabled={disabled}
        hint={t("cmmn.id.hint")}
        onChange={(event) => onChangeElement({ definitionId: event.target.value })}
      />
      <TextInput
        label={t("properties.name")}
        value={element.name}
        disabled={disabled}
        onChange={(event) => onChangeElement({ name: event.target.value })}
      />

      {element.type === "humanTask" ? (
        <section className="tf-properties__section">
          <h3 className="tf-properties__section-title">{t("properties.flowable")}</h3>
          <TextInput
            label={t("properties.assignee")}
            value={element.attributes.assignee ?? ""}
            disabled={disabled}
            hint={t("cmmn.assignee.hint")}
            onChange={(event) => setAttr("assignee", event.target.value)}
          />
          <TextInput
            label={t("properties.candidateGroups")}
            value={element.attributes.candidateGroups ?? ""}
            disabled={disabled}
            onChange={(event) => setAttr("candidateGroups", event.target.value)}
          />
          <TextInput
            label={t("properties.formKey")}
            value={element.attributes.formKey ?? ""}
            disabled={disabled}
            onChange={(event) => setAttr("formKey", event.target.value)}
          />
        </section>
      ) : null}

      {element.type === "processTask" ? (
        <TextInput
          label={t("cmmn.processRef")}
          value={element.attributes.processRef ?? ""}
          disabled={disabled}
          hint={t("cmmn.processRef.hint")}
          onChange={(event) => setAttr("processRef", event.target.value)}
        />
      ) : null}

      {element.type === "decisionTask" ? (
        <TextInput
          label={t("cmmn.decisionRef")}
          value={element.attributes.decisionRef ?? ""}
          disabled={disabled}
          hint={t("cmmn.decisionRef.hint")}
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
          {t("cmmn.blocking")}
        </label>
      ) : null}

      {/*
        Entry and exit criteria are the same shape — a sentry watching another plan item —
        so they share one editor rather than two near-identical blocks. Exit criteria were
        missing entirely: the model layer round-tripped them, but nothing could author one
        (§7.4.3).
      */}
      <CriteriaSection
        t={t}
        kind="entry"
        model={model}
        element={element}
        disabled={disabled}
        onChangeElement={onChangeElement}
      />
      <CriteriaSection
        t={t}
        kind="exit"
        model={model}
        element={element}
        disabled={disabled}
        onChangeElement={onChangeElement}
      />

      <div className="tf-properties__section">
        <Button variant="danger" disabled={disabled} onClick={onDelete}>
          {t("cmmn.deleteElement")}
        </Button>
      </div>
    </aside>
  );
}

/**
 * One criterion list — entry or exit.
 *
 * The two differ only in which array they read and in what the criterion means: an entry
 * criterion starts the item when the watched event happens, an exit criterion terminates
 * it. The hint says which, because "wait for" reads the same on both and the consequence
 * is opposite.
 */
function CriteriaSection({
  t,
  kind,
  model,
  element,
  disabled,
  onChangeElement,
}: {
  t: TFunction;
  kind: "entry" | "exit";
  model: CmmnCase;
  element: CmmnElement;
  disabled: boolean;
  onChangeElement: (patch: Partial<CmmnElement>) => void;
}) {
  const sentries = kind === "entry" ? element.entrySentries : element.exitSentries;
  const commit = (next: Sentry[]) =>
    onChangeElement(kind === "entry" ? { entrySentries: next } : { exitSentries: next });

  return (
    <section className="tf-properties__section">
      <h3 className="tf-properties__section-title">{t(`cmmn.${kind}Criteria`)}</h3>
      <p className="tf-muted tf-properties__hint">{t(`cmmn.${kind}Criteria.hint`)}</p>

      {sentries.length === 0 ? (
        <p className="tf-muted">{t(`cmmn.${kind}Criteria.none`)}</p>
      ) : (
        <ul className="tf-sentries">
          {sentries.map((sentry) => (
            <li key={sentry.id} className="tf-sentries__item">
              <select
                className="tf-input tf-select"
                aria-label={t("cmmn.waitFor")}
                value={sentry.sourceRef ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  commit(
                    sentries.map((s) =>
                      s.id === sentry.id
                        ? { ...s, sourceRef: event.target.value || undefined }
                        : s,
                    ),
                  )
                }
              >
                <option value="">{t("cmmn.chooseElement")}</option>
                {model.elements
                  .filter((el) => el.planItemId !== element.planItemId)
                  .map((el) => (
                    <option key={el.planItemId} value={el.planItemId}>
                      {el.name || el.definitionId}
                    </option>
                  ))}
              </select>
              <select
                className="tf-input tf-select"
                aria-label={t("cmmn.onEvent")}
                value={sentry.standardEvent || "complete"}
                disabled={disabled}
                onChange={(event) =>
                  commit(
                    sentries.map((s) =>
                      s.id === sentry.id ? { ...s, standardEvent: event.target.value } : s,
                    ),
                  )
                }
              >
                {STANDARD_EVENTS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="tf-chip-item__remove"
                aria-label={t("cmmn.removeCriterion")}
                disabled={disabled}
                onClick={() => commit(sentries.filter((s) => s.id !== sentry.id))}
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
          commit([
            ...sentries,
            { id: `crit_${Date.now().toString(36)}`, standardEvent: "complete" },
          ])
        }
      >
        {t(`cmmn.${kind}Criteria.add`)}
      </Button>
    </section>
  );
}

/**
 * The plan-item lifecycle transitions a sentry can watch. CMMN 1.1 defines more, but
 * these are the ones that are meaningful on the element types this editor can draw.
 */
const STANDARD_EVENTS = ["complete", "terminate", "disable", "enable", "start", "occur"];

export { emptyCase };
