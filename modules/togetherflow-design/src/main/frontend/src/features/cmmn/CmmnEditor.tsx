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
  Modal,
  ConfirmDialog,
  ErrorState,
  SelectInput,
  Skeleton,
  TextAreaInput,
  TextInput,
  useI18n,
  useT,
  useToast,
  type ModelApi,
  type ModelResponse,
  type ModelValidationApi,
  type TFunction,
} from "@togetherflow/common";
import { useConflictPrompt } from "../editors/ConflictPrompt";
import { EditorMenuBar } from "../editors/EditorMenuBar";
import { canDeploy, issuesFromServer, type ValidationIssue } from "../bpmn/validateBpmn";
import { problemMarkers, validateCmmn } from "./validateCmmn";
import {
  attributeGroupsFor,
  taskFieldsFor,
  REPETITION_ATTRIBUTES,
  type CmmnAttributeGroup,
  type CmmnAttributeSpec,
} from "./flowableAttributes";
import { CmmnCanvas, DEFAULT_VIEWPORT, type Viewport } from "./CmmnCanvas";
import { downloadFile } from "../library/importExport";
import {
  TYPE_LABELS,
  createElement,
  emptyCase,
  parseCmmn,
  cloneElements,
  removeElement,
  serialiseCmmn,
  type CmmnCase,
  type CmmnElement,
  type CmmnElementType,
  type CmmnField,
  type CmmnFieldValueKind,
  type EventParameter,
  type ItemControl,
  type LifecycleListener,
  type RuleConfig,
  type Sentry,
} from "./cmmnModel";

const AUTOSAVE_IDLE_MS = 4000;
const UNDO_LIMIT = 50;

/**
 * Flowable's task subtypes in CMMN, expressed through `flowable:type` on `<task>`.
 *
 * A shorter list than BPMN's: CMMN has dedicated elements for the process, case and
 * decision variants, so only these reach a plain task.
 */
const CMMN_TASK_TYPES = [
  "",
  "http",
  "mail",
  "script",
  "send-event",
  "external-worker",
  // A case page task is a `<task>` with this type, so it needs no palette entry of its own.
  "casePage",
] as const;

/** `flowable:exitType` values. Empty is the engine's default. */
const EXIT_TYPES = ["", "activeInstances", "activeAndEnabledInstances"] as const;

/**
 * `flowable:exitEventType` values, from `Criterion`'s own constants.
 *
 * This decides whether the stage or case the criterion exits ends as *terminated* or as
 * *completed*, which is the difference between a case that shows as finished and one that
 * shows as abandoned. Empty is the engine's default, `exit`.
 */
const EXIT_EVENT_TYPES = ["", "exit", "complete", "forceComplete"] as const;

const PALETTE: CmmnElementType[] = [
  "stage",
  "planFragment",
  "humanTask",
  "processTask",
  "decisionTask",
  "caseTask",
  "serviceTask",
  "scriptTask",
  "httpTask",
  "mailTask",
  "externalWorkerTask",
  "casePageTask",
  "sendEventTask",
  "milestone",
  "timerEventListener",
  "userEventListener",
  "genericEventListener",
  "signalEventListener",
  "variableEventListener",
  "intentEventListener",
  "reactivateEventListener",
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
  /**
   * Discards local changes and re-imports what is stored (W1.1). The parent owns it: a
   * reload is a refetch plus a remount, which resets the editor's undo stack — which is
   * exactly what "take theirs, drop mine" means.
   */
  onReloadSource?: () => void;
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
  onReloadSource,
  onSaved,
}: CmmnEditorProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  /*
   * The concurrent-edit guard's user half (W1.1). Declared before `save` so the
   * autosave effect and the save callback can both see it.
   */
  const conflict = useConflictPrompt({ onReload: () => onReloadSource?.() });

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
  /**
   * Re-check as the model changes rather than only when asked (§14.3).
   *
   * Browser checks only. Asking the engine on every edit would be a request per keystroke,
   * and its verdict still arrives on an explicit check or a deploy.
   */
  const [liveChecking, setLiveChecking] = useState(true);
  /** Whether the shown problems include the engine's verdict, which the caveat has to say. */
  const [engineChecked, setEngineChecked] = useState(false);
  /**
   * Read-only view of the XML the engine will actually receive (§7.4.3).
   *
   * This editor keeps things it cannot itself author — case file items, unknown extension
   * elements, `flowable:` attributes it has no field for — so that a round trip loses
   * nothing. Being able to read the output is how that claim is checked without deploying.
   */
  const [sourceXml, setSourceXml] = useState<string | null>(null);
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

  /**
   * The clipboard.
   *
   * Deliberately in a ref rather than the system clipboard: what is copied here is a set of
   * plan items with their sentries and nesting, and there is no sane text form of that to
   * put on the system clipboard — nor any way to paste one back reliably across browsers.
   * The cost is that copy does not cross between two open tabs, which is a smaller loss
   * than a paste that silently drops half of what was copied.
   */
  const clipboard = useRef<CmmnElement[]>([]);

  const copySelection = useCallback(() => {
    if (!caseModel) return;
    const copyable = selectedIds.filter((id) => id !== caseModel.planModelId);
    if (copyable.length === 0) return;
    clipboard.current = cloneElements(caseModel, copyable, { x: 0, y: 0 });
  }, [caseModel, selectedIds]);

  /** Adds copies to the model and selects them, so the paste can be moved straight away. */
  const addCopies = useCallback(
    (copies: CmmnElement[]) => {
      if (!caseModel || copies.length === 0) return;
      commit({ ...caseModel, elements: [...caseModel.elements, ...copies] });
      setSelectedIds(copies.map((element) => element.planItemId));
    },
    [caseModel, commit],
  );

  const paste = useCallback(() => {
    if (clipboard.current.length === 0 || !caseModel) return;
    // Offset from the clipboard's own position each time, so pasting twice does not stack
    // the second copy exactly on the first.
    addCopies(cloneElements(
      { ...caseModel, elements: clipboard.current },
      clipboard.current.map((element) => element.planItemId),
      PASTE_OFFSET,
    ));
  }, [caseModel, addCopies]);

  const duplicateSelection = useCallback(() => {
    if (!caseModel) return;
    const copyable = selectedIds.filter((id) => id !== caseModel.planModelId);
    if (copyable.length === 0) return;
    addCopies(cloneElements(caseModel, copyable, PASTE_OFFSET));
  }, [caseModel, selectedIds, addCopies]);

  /** Moves the selection, leaving the plan model where it is. */
  const nudge = useCallback(
    (direction: { x: number; y: number }, step: number) => {
      if (!caseModel || selectedIds.length === 0) return;
      const moving = new Set(selectedIds.filter((id) => id !== caseModel.planModelId));
      if (moving.size === 0) return;

      commit({
        ...caseModel,
        elements: caseModel.elements.map((element) =>
          moving.has(element.planItemId)
            ? {
                ...element,
                bounds: {
                  ...element.bounds,
                  x: element.bounds.x + direction.x * step,
                  y: element.bounds.y + direction.y * step,
                },
              }
            : element,
        ),
      });
    },
    [caseModel, selectedIds, commit],
  );

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
    if (!caseModel) return null;

    // Browser checks first: they need no round trip and are the only answer available when
    // the engine cannot be reached.
    const local = validateCmmn(caseModel);
    if (!validationApi) {
      setEngineChecked(false);
      return local;
    }

    try {
      const verdict = await validationApi.validateCmmn(serialiseCmmn(caseModel));
      setEngineChecked(true);
      return [...issuesFromServer(verdict), ...local];
    } catch {
      setEngineChecked(false);
      push({ tone: "warning", message: t("cmmn.checks.unreachable") });
      return local;
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

  const markers = useMemo(() => problemMarkers(issues, caseModel), [issues, caseModel]);

  /**
   * Which model has already been seen load, so opening a case is not counted as a change.
   *
   * Without this the checks would fire on mount and an existing case would greet whoever
   * opened it with a panel of problems they had not touched. The BPMN editor gets this for
   * free by subscribing to the modeller's change events; here the model is state, so the
   * load has to be told apart from an edit explicitly.
   */
  const loadedForRef = useRef<string | null>(null);

  /*
   * Re-run the browser checks as the model changes.
   *
   * Debounced, because dragging a shape fires a change per frame. Engine-sourced problems
   * are dropped on the first edit: they described the model as it was, and keeping a stale
   * verdict beside fresh ones would be worse than showing fewer.
   */
  useEffect(() => {
    if (!caseModel) return;

    // The first run for a model is its load, not an edit. Record it and stop.
    if (loadedForRef.current !== model.id) {
      loadedForRef.current = model.id;
      return;
    }
    if (!liveChecking) return;

    const timer = setTimeout(() => {
      const found = validateCmmn(caseModel);
      setEngineChecked(false);
      setIssues(found.length > 0 ? found : null);
    }, 400);
    return () => clearTimeout(timer);
  }, [liveChecking, caseModel, model.id]);

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
        const written = await conflict.guard(async (overwrite) => {
          await modelApi.saveSource(model.id, serialiseCmmn(caseModel), { overwrite });
          return true;
        });
        if (!written) return;
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
    [caseModel, modelApi, model.id, push, onSaved, t, conflict],
  );

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (!dirty || !caseModel || conflict.blocked) return;
    const timer = setTimeout(() => void saveRef.current({ silent: true }), AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [dirty, caseModel, conflict.blocked]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const dialogOpen = sourceXml !== null || confirmLeave || confirmDeploy;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      /*
       * A dialog owns the keyboard while it is up. Without this, Backspace behind an open
       * dialog deletes the selected element where nobody can see it happen, and Cmd-Z
       * undoes an edit the reader is not looking at.
       */
      if (dialogOpen) {
        if (event.key === "Escape" && sourceXml !== null) setSourceXml(null);
        return;
      }

      const target = event.target as HTMLElement | null;
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      const accel = event.metaKey || event.ctrlKey;

      if (accel && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      } else if (accel && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (!typing && accel && event.key.toLowerCase() === "c") {
        copySelection();
      } else if (!typing && accel && event.key.toLowerCase() === "x") {
        copySelection();
        deleteSelected();
      } else if (!typing && accel && event.key.toLowerCase() === "v") {
        event.preventDefault();
        paste();
      } else if (!typing && accel && event.key.toLowerCase() === "d") {
        // Duplicate in place, without disturbing whatever is on the clipboard.
        event.preventDefault();
        duplicateSelection();
      } else if (!typing && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        deleteSelected();
      } else if (!typing && NUDGE[event.key]) {
        /*
         * Arrow keys move the selection. A shape landing one pixel off is invisible until
         * two of them are side by side, so this moves by the grid the canvas snaps to —
         * and by one pixel with Alt, for the case where the grid is the problem.
         */
        event.preventDefault();
        nudge(NUDGE[event.key], event.altKey ? 1 : event.shiftKey ? GRID_STEP * 5 : GRID_STEP);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [save, undo, redo, deleteSelected, dialogOpen, sourceXml, copySelection, paste, duplicateSelection, nudge]);

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
      {/* W2.3 (I8): one menu bar, shared by all six editors. */}
      <EditorMenuBar
        title={model.name || model.key || model.id}
        status={
          dirty
            ? t("editor.unsaved")
            : lastSavedAt
              ? t("editor.saved", { time: lastSavedAt.toLocaleTimeString(locale) })
              : t("editor.noChanges")
        }
        onBack={() => (dirty ? setConfirmLeave(true) : onBack())}
        onSave={() => void save()}
        saving={saving}
        ready={Boolean(caseModel)}
        onSaveVersion={() => void saveVersion()}
        onValidate={validationApi ? () => void check() : undefined}
        validating={checking}
        undo={{ run: undo, can: canUndo && !busy }}
        redo={{ run: redo, can: canRedo && !busy }}
        zoom={{
          in: () => setViewport((v) => ({ ...v, scale: Math.min(3, v.scale * 1.2) })),
          out: () => setViewport((v) => ({ ...v, scale: Math.max(0.25, v.scale / 1.2) })),
          fit: () => setViewport(DEFAULT_VIEWPORT),
        }}
        onExport={() => caseModel && setSourceXml(serialiseCmmn(caseModel))}
        exportLabel={t("cmmn.xmlTitle")}
        primary={{
          label: t("action.deploy"),
          run: () => void startDeploy(),
          busy: deploying || checking,
        }}
      />

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
                <span className={`tf-issues__source tf-issues__source--${issue.source ?? "browser"}`}>
                  {t(`cmmn.checks.source.${issue.source ?? "browser"}`)}
                </span>
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
          <p className="tf-issues__caveat">
            {engineChecked ? t("cmmn.checks.caveat.engine") : t("cmmn.checks.caveat.browserOnly")}
          </p>
          <label className="tf-checkbox tf-issues__live">
            <input
              type="checkbox"
              checked={liveChecking}
              onChange={(event) => setLiveChecking(event.target.checked)}
            />
            {t("bpmn.checks.live")}
          </label>
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
              problems={markers}
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

      {sourceXml !== null ? (
        <Modal
          open
          title={t("cmmn.xmlTitle")}
          description={t("cmmn.xmlDescription")}
          size="lg"
          onClose={() => setSourceXml(null)}
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  downloadFile(`${model.key ?? model.id}.cmmn.xml`, sourceXml, "application/xml")
                }
              >
                {t("action.download")}
              </Button>
              <Button variant="secondary" onClick={() => setSourceXml(null)}>
                {t("action.close")}
              </Button>
            </>
          }
        >
          <pre className="tf-source">{sourceXml}</pre>
        </Modal>
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

      {/* Reload-or-overwrite, when someone else saved this model (W1.1). */}
      {conflict.prompt}
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
        {/*
          Case-level `flowable:` attributes. These decide who may start the case and where
          the starter's id lands — the case equivalent of a process's candidate starters,
          and previously reachable by nothing.
        */}
        {(["candidateStarterUsers", "candidateStarterGroups", "initiatorVariableName"] as const).map(
          (key) => (
            <TextInput
              key={key}
              label={t(`cmmn.${key}`)}
              value={model.caseAttributes[key] ?? ""}
              disabled={disabled}
              hint={t(`cmmn.${key}.hint`)}
              onChange={(event) =>
                onChangeCase({
                  caseAttributes: event.target.value.trim()
                    ? { ...model.caseAttributes, [key]: event.target.value }
                    : Object.fromEntries(
                        Object.entries(model.caseAttributes).filter(([k]) => k !== key),
                      ),
                })
              }
            />
          ),
        )}

        {/* The case plan model is a stage, and auto-completion applies to it too. */}
        <label className="tf-checkbox tf-checkbox--block">
          <input
            type="checkbox"
            checked={model.planModelPlainAttributes.autoComplete === "true"}
            disabled={disabled}
            onChange={(event) =>
              onChangeCase({
                planModelPlainAttributes: event.target.checked
                  ? { ...model.planModelPlainAttributes, autoComplete: "true" }
                  : Object.fromEntries(
                      Object.entries(model.planModelPlainAttributes).filter(
                        ([k]) => k !== "autoComplete",
                      ),
                    ),
              })
            }
          />
          {t("cmmn.autoComplete")}
        </label>

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

  /** A `flowable:`-prefixed attribute. */
  const setAttr = (key: string, value: string) =>
    onChangeElement({
      attributes: value.trim()
        ? { ...element.attributes, [key]: value }
        : Object.fromEntries(Object.entries(element.attributes).filter(([k]) => k !== key)),
    });

  /**
   * An unprefixed CMMN attribute.
   *
   * Separate from `setAttr` because the namespace decides whether the engine reads it at
   * all: `processRef`, `decisionRef` and `caseRef` are looked up with a null namespace, so
   * a `flowable:`-prefixed one is invisible to it.
   */
  const setPlainAttr = (key: string, value: string) =>
    onChangeElement({
      plainAttributes: value.trim()
        ? { ...element.plainAttributes, [key]: value }
        : Object.fromEntries(
            Object.entries(element.plainAttributes).filter(([k]) => k !== key),
          ),
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
      {/*
        `<documentation>` — the schema's own place for "why does this exist", and until now
        reachable by nothing, which is how cases end up with the explanation crammed into
        the task name.
      */}
      <TextAreaInput
        label={t("cmmn.documentation")}
        value={element.documentation ?? ""}
        rows={2}
        disabled={disabled}
        hint={t("cmmn.documentation.hint")}
        onChange={(event) =>
          onChangeElement({ documentation: event.target.value.trim() ? event.target.value : undefined })
        }
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
            label={t("properties.owner")}
            value={element.attributes.owner ?? ""}
            disabled={disabled}
            hint={t("properties.owner.hint")}
            onChange={(event) => setAttr("owner", event.target.value)}
          />
          <TextInput
            label={t("properties.candidateUsers")}
            value={element.attributes.candidateUsers ?? ""}
            disabled={disabled}
            onChange={(event) => setAttr("candidateUsers", event.target.value)}
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
          <TextInput
            label={t("properties.dueDate")}
            value={element.attributes.dueDate ?? ""}
            disabled={disabled}
            hint={t("properties.dueDate.hint")}
            onChange={(event) => setAttr("dueDate", event.target.value)}
          />
          <TextInput
            label={t("properties.priority")}
            value={element.attributes.priority ?? ""}
            disabled={disabled}
            hint={t("properties.priority.hint")}
            onChange={(event) => setAttr("priority", event.target.value)}
          />
          <TextInput
            label={t("properties.category")}
            value={element.attributes.category ?? ""}
            disabled={disabled}
            hint={t("properties.category.hint")}
            onChange={(event) => setAttr("category", event.target.value)}
          />
          <label className="tf-checkbox tf-checkbox--block">
            <input
              type="checkbox"
              checked={element.attributes.formFieldValidation === "true"}
              disabled={disabled}
              onChange={(event) =>
                setAttr("formFieldValidation", event.target.checked ? "true" : "")
              }
            />
            {t("properties.formFieldValidation")}
          </label>
        </section>
      ) : null}

      {element.type === "processTask" ? (
        <TextInput
          label={t("cmmn.processRef")}
          value={element.plainAttributes.processRef ?? ""}
          disabled={disabled}
          hint={t("cmmn.processRef.hint")}
          onChange={(event) => setPlainAttr("processRef", event.target.value)}
        />
      ) : null}

      {element.type === "decisionTask" ? (
        <TextInput
          label={t("cmmn.decisionRef")}
          value={element.plainAttributes.decisionRef ?? ""}
          disabled={disabled}
          hint={t("cmmn.decisionRef.hint")}
          onChange={(event) => setPlainAttr("decisionRef", event.target.value)}
        />
      ) : null}

      {/* A case task was in the palette with nothing to point it at. */}
      {element.type === "caseTask" ? (
        <TextInput
          label={t("cmmn.caseRef")}
          value={element.plainAttributes.caseRef ?? ""}
          disabled={disabled}
          hint={t("cmmn.caseRef.hint")}
          onChange={(event) => setPlainAttr("caseRef", event.target.value)}
        />
      ) : null}

      {/*
        A service task could be drawn but never given an implementation, so it was a shape
        that did nothing. These are all `flowable:`-prefixed, unlike the refs above.
      */}
      {element.type === "serviceTask" ? (
        <section className="tf-properties__section">
          <h3 className="tf-properties__section-title">{t("cmmn.implementation")}</h3>
          {/*
            As in BPMN, Flowable's task subtypes are one element told apart by
            `flowable:type`. Without this the http, mail and script variants could not be
            expressed at all.
          */}
          <SelectInput
            label={t("properties.taskType")}
            value={element.attributes.type ?? ""}
            disabled={disabled}
            hint={t("cmmn.taskType.hint")}
            onChange={(event) => setAttr("type", event.target.value)}
          >
            {CMMN_TASK_TYPES.map((value) => (
              <option key={value || "default"} value={value}>
                {t(`properties.taskType.${value || "default"}`)}
              </option>
            ))}
          </SelectInput>
          <TextInput
            label={t("properties.class")}
            value={element.attributes.class ?? ""}
            disabled={disabled}
            hint={t("cmmn.implementation.hint")}
            onChange={(event) => setAttr("class", event.target.value)}
          />
          <TextInput
            label={t("properties.expression")}
            value={element.attributes.expression ?? ""}
            disabled={disabled}
            onChange={(event) => setAttr("expression", event.target.value)}
          />
          <TextInput
            label={t("properties.delegateExpression")}
            value={element.attributes.delegateExpression ?? ""}
            disabled={disabled}
            onChange={(event) => setAttr("delegateExpression", event.target.value)}
          />
          <TextInput
            label={t("properties.resultVariableName")}
            value={element.attributes.resultVariableName ?? ""}
            disabled={disabled}
            onChange={(event) => setAttr("resultVariableName", event.target.value)}
          />
        </section>
      ) : null}

      {/* Without a schedule a timer event listener never fires. */}
      {element.type === "timerEventListener" ? (
        <TextInput
          label={t("cmmn.timerExpression")}
          value={element.timerExpression ?? ""}
          disabled={disabled}
          hint={t("cmmn.timerExpression.hint")}
          onChange={(event) =>
            onChangeElement({ timerExpression: event.target.value.trim() || undefined })
          }
        />
      ) : null}

      {/*
        `<planItemStartTrigger>` — what starts the clock, as opposed to when it fires. A
        timer with an expression alone starts when its stage becomes available; with a
        trigger it waits for another plan item first, which is what "three days after the
        review completes" actually means.
      */}
      {element.type === "timerEventListener" ? (
        <div className="tf-properties__subsection">
          <h4 className="tf-properties__subsection-title">{t("cmmn.startTrigger")}</h4>
          <p className="tf-muted tf-properties__hint">{t("cmmn.startTrigger.hint")}</p>
          <div className="tf-sentries__part">
            <select
              className="tf-input tf-select"
              aria-label={t("cmmn.startTrigger.source")}
              value={element.timerStartTrigger?.sourceRef ?? ""}
              disabled={disabled}
              onChange={(event) =>
                onChangeElement({
                  timerStartTrigger: event.target.value
                    ? {
                        sourceRef: event.target.value,
                        standardEvent: element.timerStartTrigger?.standardEvent || "complete",
                      }
                    : undefined,
                })
              }
            >
              <option value="">{t("cmmn.startTrigger.none")}</option>
              {model.elements
                .filter((el) => el.planItemId !== element.planItemId)
                .map((el) => (
                  <option key={el.planItemId} value={el.planItemId}>
                    {el.name || el.definitionId}
                  </option>
                ))}
            </select>
            {element.timerStartTrigger ? (
              <select
                className="tf-input tf-select"
                aria-label={t("cmmn.onEvent")}
                value={element.timerStartTrigger.standardEvent || "complete"}
                disabled={disabled}
                onChange={(event) =>
                  onChangeElement({
                    timerStartTrigger: {
                      ...element.timerStartTrigger!,
                      standardEvent: event.target.value,
                    },
                  })
                }
              >
                {STANDARD_EVENTS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
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
        A stage that does not auto-complete waits for every required item, which is often
        not what the modeller intends and was previously unreachable.
      */}
      {element.type === "stage" ? (
        <>
          <label className="tf-checkbox tf-checkbox--block">
            <input
              type="checkbox"
              checked={element.plainAttributes.autoComplete === "true"}
              disabled={disabled}
              onChange={(event) =>
                setPlainAttr("autoComplete", event.target.checked ? "true" : "")
              }
            />
            {t("cmmn.autoComplete")}
          </label>
          <p className="tf-muted tf-properties__hint">{t("cmmn.autoComplete.hint")}</p>
        </>
      ) : null}

      {/*
        Field injections. Typing a task as `http` without these deploys a case that fails
        the moment it starts — "requestMethod is required" — so the type selector above is
        only half of what makes a service task work.
      */}
      {element.type === "sendEventTask" ? (
        <SendEventSection t={t} element={element} disabled={disabled} onChangeElement={onChangeElement} />
      ) : null}

      {taskFieldsFor(element.type).length > 0 ? (
        <KnownFieldsSection element={element} disabled={disabled} onChangeElement={onChangeElement} />
      ) : null}

      {element.type === "serviceTask" ||
      element.type === "decisionTask" ||
      taskFieldsFor(element.type).length > 0 ? (
        <FieldSection t={t} element={element} disabled={disabled} onChangeElement={onChangeElement} />
      ) : null}

      {/*
        The `flowable:` attributes this element type has, from the table in
        `flowableAttributes.ts`. Everything above is hand-written because it needs something
        the table cannot express — identity autosuggest on assignee, a reference picker on
        processRef. Everything the engine merely reads as a string belongs here, where the
        names are checked against `CmmnXmlConstants.java` rather than typed twice.
      */}
      {attributeGroupsFor(element.type).map((group) => (
        <AttributeGroup
          key={group.id}
          group={group}
          values={element.attributes}
          disabled={disabled}
          onChange={setAttr}
        />
      ))}

      <LifecycleListenerSection
        t={t}
        element={element}
        disabled={disabled}
        onChangeElement={onChangeElement}
      />

      <ItemControlSection
        t={t}
        element={element}
        disabled={disabled}
        onChangeElement={onChangeElement}
      />

      <ItemControlSection
        t={t}
        which="defaultControl"
        element={element}
        disabled={disabled}
        onChangeElement={onChangeElement}
      />

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
              {/*
                One row per on-part. A sentry with several waits for all of them, so they
                read as an AND — which is why they are listed rather than being a single
                source picker.
              */}
              {(sentry.onParts ?? []).map((part, partIndex) => (
                <div className="tf-sentries__part" key={partIndex}>
                  <select
                    className="tf-input tf-select"
                    aria-label={t("cmmn.waitFor")}
                    value={part.sourceRef}
                    disabled={disabled}
                    onChange={(event) =>
                      commit(
                        sentries.map((s) =>
                          s.id === sentry.id
                            ? {
                                ...s,
                                onParts: s.onParts.map((existing, i) =>
                                  i === partIndex
                                    ? { ...existing, sourceRef: event.target.value }
                                    : existing,
                                ),
                              }
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
                    value={part.standardEvent || "complete"}
                    disabled={disabled}
                    onChange={(event) =>
                      commit(
                        sentries.map((s) =>
                          s.id === sentry.id
                            ? {
                                ...s,
                                onParts: s.onParts.map((existing, i) =>
                                  i === partIndex
                                    ? { ...existing, standardEvent: event.target.value }
                                    : existing,
                                ),
                              }
                            : s,
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
                    aria-label={t("cmmn.removePart")}
                    disabled={disabled}
                    onClick={() =>
                      commit(
                        sentries.map((s) =>
                          s.id === sentry.id
                            ? { ...s, onParts: s.onParts.filter((_, i) => i !== partIndex) }
                            : s,
                        ),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}

              <div className="tf-sentries__actions">
                <Button
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    commit(
                      sentries.map((s) =>
                        s.id === sentry.id
                          ? {
                              ...s,
                              onParts: [
                                ...(s.onParts ?? []),
                                { sourceRef: "", standardEvent: "complete" },
                              ],
                            }
                          : s,
                      ),
                    )
                  }
                >
                  {t("cmmn.addPart")}
                </Button>

                {kind === "exit" ? (
                  <select
                    className="tf-input tf-select"
                    aria-label={t("cmmn.exitType")}
                    value={sentry.exitType ?? ""}
                    disabled={disabled}
                    onChange={(event) =>
                      commit(
                        sentries.map((s) =>
                          s.id === sentry.id
                            ? { ...s, exitType: event.target.value || undefined }
                            : s,
                        ),
                      )
                    }
                  >
                    {EXIT_TYPES.map((value) => (
                      <option key={value || "default"} value={value}>
                        {t(`cmmn.exitType.${value || "default"}`)}
                      </option>
                    ))}
                  </select>
                ) : null}

                {kind === "exit" ? (
                  <select
                    className="tf-input tf-select"
                    aria-label={t("cmmn.exitEventType")}
                    value={sentry.exitEventType ?? ""}
                    disabled={disabled}
                    onChange={(event) =>
                      commit(
                        sentries.map((s) =>
                          s.id === sentry.id
                            ? { ...s, exitEventType: event.target.value || undefined }
                            : s,
                        ),
                      )
                    }
                  >
                    {EXIT_EVENT_TYPES.map((value) => (
                      <option key={value || "default"} value={value}>
                        {t(`cmmn.exitEventType.${value || "default"}`)}
                      </option>
                    ))}
                  </select>
                ) : null}

                <button
                  type="button"
                  className="tf-chip-item__remove"
                  aria-label={t("cmmn.removeCriterion")}
                  disabled={disabled}
                  onClick={() => commit(sentries.filter((s) => s.id !== sentry.id))}
                >
                  ×
                </button>
              </div>
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
            {
              id: `crit_${Date.now().toString(36)}`,
              onParts: [{ sourceRef: "", standardEvent: "complete" }],
            },
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

/** Far enough that a pasted copy is visibly its own shape, near enough to be obviously related. */
const PASTE_OFFSET = { x: 30, y: 30 };

/** The canvas snaps to a 10px grid, so nudging by less than that fights it. */
const GRID_STEP = 10;

const NUDGE: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export { emptyCase };

/**
 * The plan item's control rules (§7.4.3).
 *
 * These are what make a case a case rather than a flowchart: whether an item must be done
 * before its stage can complete, whether it can repeat, and whether a person has to start
 * it. All four were absent, so the editor could draw a case but not say how it behaves.
 *
 * Each rule is a presence plus an optional condition, which is exactly how CMMN models it
 * — a bare `<requiredRule/>` means always, and one with a `<condition>` means sometimes.
 * The condition input therefore appears only once the rule is switched on.
 */
/**
 * The rules on a plan item, or the defaults on its definition.
 *
 * `<itemControl>` sits on the plan item and governs that one occurrence; `<defaultControl>`
 * sits on the definition and governs every plan item referencing it that carries no control
 * of its own. Same content model, so the same editor, told apart by `which`.
 */
function ItemControlSection({
  t,
  which = "itemControl",
  element,
  disabled,
  onChangeElement,
}: {
  t: TFunction;
  which?: "itemControl" | "defaultControl";
  element: CmmnElement;
  disabled: boolean;
  onChangeElement: (patch: Partial<CmmnElement>) => void;
}) {
  const control = element[which] ?? {};
  const commit = (next: ItemControl | undefined) => onChangeElement({ [which]: next });

  const setRule = (key: keyof typeof RULE_LABELS, patch: Partial<RuleConfig>) => {
    const next: ItemControl = {
      ...control,
      [key]: { ...(control[key] ?? { enabled: false }), ...patch },
    };
    // A rule switched off carries no condition; keeping one would resurface if it were
    // switched back on, which is not what "off" looked like when it was turned off.
    if (next[key] && !next[key]!.enabled) next[key] = { enabled: false };
    const anyOn = Object.keys(RULE_LABELS).some(
      (name) => next[name as keyof typeof RULE_LABELS]?.enabled,
    );
    commit(anyOn ? next : undefined);
  };

  const setRepetitionAttribute = (name: string, value: string) => {
    const current = control.repetitionAttributes ?? {};
    const next = value.trim()
      ? { ...current, [name]: value }
      : Object.fromEntries(Object.entries(current).filter(([key]) => key !== name));
    commit({ ...control, repetitionAttributes: Object.keys(next).length > 0 ? next : undefined });
  };

  return (
    <section className="tf-properties__section">
      <h3 className="tf-properties__section-title">{t(`cmmn.${which}`)}</h3>
      <p className="tf-muted tf-properties__hint">{t(`cmmn.${which}.hint`)}</p>

      {(Object.keys(RULE_LABELS) as Array<keyof typeof RULE_LABELS>).map((key) => {
        const rule = control[key];
        return (
          <div key={key}>
            <label className="tf-checkbox tf-checkbox--block">
              <input
                type="checkbox"
                checked={rule?.enabled === true}
                disabled={disabled}
                onChange={(event) => setRule(key, { enabled: event.target.checked })}
              />
              {t(`cmmn.itemControl.${key}`)}
            </label>
            {rule?.enabled ? (
              <TextInput
                label={t("cmmn.itemControl.condition")}
                value={rule.condition ?? ""}
                disabled={disabled}
                hint={t("cmmn.itemControl.condition.hint")}
                onChange={(event) =>
                  setRule(key, { condition: event.target.value.trim() || undefined })
                }
              />
            ) : null}
            {/*
              Repetition's own `flowable:` attributes, shown only while repetition is on
              because that is the only time they mean anything. The model has round-tripped
              all six since repetition was added; none of them had anywhere to be typed, so
              a repeating item could not name the collection it repeats over.
            */}
            {key === "repetition" && rule?.enabled ? (
              <AttributeGroup
                group={{ id: "repetition", attributes: REPETITION_ATTRIBUTES }}
                values={control.repetitionAttributes ?? {}}
                disabled={disabled}
                onChange={setRepetitionAttribute}
              />
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

/**
 * The rules the editor offers.
 *
 * `completionNeutralRule` is absent on purpose: Flowable's parser understands it, but it
 * is in no CMMN schema, and deployment validates against the schema before parsing — so a
 * case carrying one cannot be deployed at all. An imported file keeps its own; this
 * editor will not create one.
 */
const RULE_LABELS = {
  required: "required",
  repetition: "repetition",
  manualActivation: "manualActivation",
} as const;

/** The four value forms the engine reads, so an imported field keeps the one it had. */
const FIELD_VALUE_KINDS: CmmnFieldValueKind[] = [
  "stringValue",
  "expression",
  "string",
  "expressionElement",
];

/**
 * `<flowable:field>` entries on a task.
 *
 * The same repeating-row shape as the criteria editor above. Values can be an attribute or
 * a child element, and a literal or an expression — the kind is offered rather than
 * inferred, because an imported field must keep the form it arrived in.
 */
function FieldSection({
  t,
  element,
  disabled,
  onChangeElement,
}: {
  t: TFunction;
  element: CmmnElement;
  disabled: boolean;
  onChangeElement: (patch: Partial<CmmnElement>) => void;
}) {
  const all = element.fields ?? [];
  /*
   * Only the fields the known-field editor above does not already own. Showing a field in
   * two boxes means whichever is typed second wins and the other shows a stale value — the
   * exact confusion the typed editors exist to remove.
   */
  const owned = new Set(taskFieldsFor(element.type));
  const rows = all.filter((row) => !owned.has(row.name.trim()));

  const commit = (fields: CmmnField[]) => onChangeElement({ fields });
  /** Indices are into the filtered view; the model still holds the owned fields. */
  const update = (index: number, patch: Partial<CmmnField>) => {
    const target = rows[index];
    commit(all.map((row) => (row === target ? { ...row, ...patch } : row)));
  };

  return (
    <section className="tf-properties__section">
      <h3 className="tf-properties__section-title">{t("cmmn.fields")}</h3>
      <p className="tf-muted tf-properties__hint">{t("cmmn.fields.hint")}</p>

      {rows.length === 0 ? <p className="tf-muted">{t("cmmn.fields.none")}</p> : null}

      <ul className="tf-properties__rows">
        {rows.map((row, index) => (
          <li className="tf-properties__row" key={index}>
            <TextInput
              label={t("cmmn.fields.name")}
              value={row.name}
              disabled={disabled}
              onChange={(event) => update(index, { name: event.target.value })}
            />
            <SelectInput
              label={t("cmmn.fields.kind")}
              value={row.valueKind}
              disabled={disabled}
              onChange={(event) =>
                update(index, { valueKind: event.target.value as CmmnFieldValueKind })
              }
            >
              {FIELD_VALUE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`cmmn.fields.kind.${kind}`)}
                </option>
              ))}
            </SelectInput>
            <TextInput
              label={t("cmmn.fields.value")}
              value={row.value}
              disabled={disabled}
              onChange={(event) => update(index, { value: event.target.value })}
            />
            <Button
              variant="ghost"
              disabled={disabled}
              aria-label={t("cmmn.fields.remove", { index: index + 1 })}
              onClick={() => commit(all.filter((row) => row !== rows[index]))}
            >
              ×
            </Button>
          </li>
        ))}
      </ul>

      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => commit([...all, { name: "", valueKind: "stringValue", value: "" }])}
      >
        {t("cmmn.fields.add")}
      </Button>
    </section>
  );
}

/** Plan item lifecycle states, as the engine names them. */
const LIFECYCLE_STATES = [
  "",
  "available",
  "enabled",
  "disabled",
  "active",
  "suspended",
  "completed",
  "terminated",
  "failed",
];

const LISTENER_IMPLEMENTATIONS = ["class", "delegateExpression", "expression"] as const;

/**
 * Lifecycle listeners on a plan item.
 *
 * They fire as the item moves between states — available to active, active to completed.
 * Both bounds are optional and an empty one means "any", which is why the selects carry a
 * blank entry rather than defaulting to a state.
 */
function LifecycleListenerSection({
  t,
  element,
  disabled,
  onChangeElement,
}: {
  t: TFunction;
  element: CmmnElement;
  disabled: boolean;
  onChangeElement: (patch: Partial<CmmnElement>) => void;
}) {
  const rows = element.lifecycleListeners ?? [];
  const commit = (lifecycleListeners: LifecycleListener[]) => onChangeElement({ lifecycleListeners });
  const update = (index: number, patch: Partial<LifecycleListener>) =>
    commit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <section className="tf-properties__section">
      <h3 className="tf-properties__section-title">{t("cmmn.lifecycleListeners")}</h3>
      <p className="tf-muted tf-properties__hint">{t("cmmn.lifecycleListeners.hint")}</p>

      {rows.length === 0 ? <p className="tf-muted">{t("cmmn.lifecycleListeners.none")}</p> : null}

      <ul className="tf-properties__rows">
        {rows.map((row, index) => (
          <li className="tf-properties__row" key={index}>
            <SelectInput
              label={t("cmmn.lifecycleListeners.from")}
              value={row.sourceState}
              disabled={disabled}
              onChange={(event) => update(index, { sourceState: event.target.value })}
            >
              {LIFECYCLE_STATES.map((state) => (
                <option key={state || "any"} value={state}>
                  {state || t("cmmn.lifecycleListeners.anyState")}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              label={t("cmmn.lifecycleListeners.to")}
              value={row.targetState}
              disabled={disabled}
              onChange={(event) => update(index, { targetState: event.target.value })}
            >
              {LIFECYCLE_STATES.map((state) => (
                <option key={state || "any"} value={state}>
                  {state || t("cmmn.lifecycleListeners.anyState")}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              label={t("properties.listeners.implementation")}
              value={row.implementationType}
              disabled={disabled}
              onChange={(event) =>
                update(index, {
                  implementationType: event.target
                    .value as LifecycleListener["implementationType"],
                })
              }
            >
              {LISTENER_IMPLEMENTATIONS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`properties.${kind}`)}
                </option>
              ))}
            </SelectInput>
            <TextInput
              label={t("properties.listeners.value")}
              value={row.value}
              disabled={disabled}
              onChange={(event) => update(index, { value: event.target.value })}
            />
            <Button
              variant="ghost"
              disabled={disabled}
              aria-label={t("cmmn.lifecycleListeners.remove", { index: index + 1 })}
              onClick={() => commit(rows.filter((_, i) => i !== index))}
            >
              ×
            </Button>
          </li>
        ))}
      </ul>

      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() =>
          commit([
            ...rows,
            { sourceState: "", targetState: "", implementationType: "class", value: "" },
          ])
        }
      >
        {t("cmmn.lifecycleListeners.add")}
      </Button>
    </section>
  );
}

/**
 * One collapsible group of `flowable:` attributes.
 *
 * Rendered from the table in `flowableAttributes.ts` rather than written out per field.
 * Twenty-five hand-written boxes is twenty-five chances to misspell an attribute the
 * engine matches exactly, and a misspelt one is silent — see `attributeCoverage.test.ts`.
 *
 * Groups start closed. The panel is long because the engine reads this much, and a wall of
 * empty boxes is how a panel stops being read; the count on the summary means a closed
 * group is still not a blind spot.
 */
function AttributeGroup({
  group,
  values,
  disabled,
  onChange,
}: {
  group: CmmnAttributeGroup;
  values: Record<string, string>;
  disabled: boolean;
  onChange: (name: string, value: string) => void;
}) {
  const t = useT();
  const set = group.attributes.filter((attribute) => (values[attribute.name] ?? "").trim() !== "");

  return (
    <details className="tf-properties__group tf-properties__section" open={set.length > 0}>
      <summary>
        {t(`cmmn.group.${group.id}`)}
        {set.length > 0 ? (
          <span className="tf-properties__group-count">
            {t("cmmn.group.count", { set: set.length, total: group.attributes.length })}
          </span>
        ) : null}
      </summary>
      {group.attributes.map((attribute) => (
        <AttributeField
          key={attribute.name}
          attribute={attribute}
          value={values[attribute.name] ?? ""}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
    </details>
  );
}

/** One attribute, as the box its kind calls for. */
function AttributeField({
  attribute,
  value,
  disabled,
  onChange,
}: {
  attribute: CmmnAttributeSpec;
  value: string;
  disabled: boolean;
  onChange: (name: string, value: string) => void;
}) {
  const t = useT();
  const label = t(`cmmn.attr.${attribute.name}`);
  const hint = t(`cmmn.attr.${attribute.name}.hint`);

  if (attribute.kind === "boolean") {
    return (
      <label className="tf-checkbox tf-checkbox--block">
        <input
          type="checkbox"
          checked={value === "true"}
          disabled={disabled}
          /* Absent and "false" mean the same thing to the engine, so unchecking removes
             the attribute rather than writing false — the file stays as short as what it
             actually says. */
          onChange={(event) => onChange(attribute.name, event.target.checked ? "true" : "")}
        />
        <span>
          {label}
          <span className="tf-checkbox__hint">{hint}</span>
        </span>
      </label>
    );
  }

  return (
    <TextInput
      label={label}
      value={value}
      disabled={disabled}
      hint={hint}
      inputMode={attribute.kind === "number" ? "numeric" : undefined}
      onChange={(event) => onChange(attribute.name, event.target.value)}
    />
  );
}

/**
 * The fields a typed task is actually configured with, named rather than guessed.
 *
 * Flowable's specialised tasks take almost everything as `<flowable:field>` children — a
 * script task's script is a field called `script`, an HTTP task's URL a field called
 * `requestUrl`. The generic field editor could always author them, but only if you already
 * knew the names, and the engine does not tell you: a misspelt `requestMethods` is simply
 * ignored, and the case fails when an instance reaches it.
 *
 * Fields not in the list stay in the generic editor below, so an imported case keeps
 * whatever it carried.
 */
function KnownFieldsSection({
  element,
  disabled,
  onChangeElement,
}: {
  element: CmmnElement;
  disabled: boolean;
  onChangeElement: (patch: Partial<CmmnElement>) => void;
}) {
  const t = useT();
  const names = taskFieldsFor(element.type);
  const rows = element.fields ?? [];
  const valueOf = (name: string) => rows.find((row) => row.name.trim() === name)?.value ?? "";
  const set = names.filter((name) => valueOf(name).trim() !== "");

  const setField = (name: string, value: string) => {
    const existing = rows.find((row) => row.name.trim() === name);
    if (!value.trim()) {
      onChangeElement({ fields: rows.filter((row) => row !== existing) });
      return;
    }
    onChangeElement({
      fields: existing
        ? rows.map((row) => (row === existing ? { ...row, value } : row))
        : /* Expressions are the common case for these, and `string` is the value form that
             takes a CDATA body — which is what a script or a mail body needs. */
          [...rows, { name, valueKind: "string" as const, value }],
    });
  };

  return (
    <details className="tf-properties__group tf-properties__section" open>
      <summary>
        {t(`cmmn.taskFields.${element.type}`)}
        <span className="tf-properties__group-count">
          {t("cmmn.group.count", { set: set.length, total: names.length })}
        </span>
      </summary>
      {names.map((name) =>
        MULTILINE_TASK_FIELDS.has(name) ? (
          <TextAreaInput
            key={name}
            label={t(`cmmn.field.${name}`)}
            value={valueOf(name)}
            rows={name === "script" ? 8 : 3}
            disabled={disabled}
            hint={t(`cmmn.field.${name}.hint`)}
            onChange={(event) => setField(name, event.target.value)}
          />
        ) : (
          <TextInput
            key={name}
            label={t(`cmmn.field.${name}`)}
            value={valueOf(name)}
            disabled={disabled}
            hint={t(`cmmn.field.${name}.hint`)}
            onChange={(event) => setField(name, event.target.value)}
          />
        ),
      )}
    </details>
  );
}

/** Fields that hold a body rather than a value, and need room to be read. */
const MULTILINE_TASK_FIELDS = new Set(["script", "requestBody", "text", "html", "requestHeaders"]);

/**
 * What a send-event task actually sends.
 *
 * `<flowable:eventType>` names the registry event — not to be confused with the
 * `flowable:eventType` *attribute*, which on an event listener names the listener's kind.
 * The engine reuses the name for two unrelated things, so the label here says "event key"
 * rather than repeating it.
 *
 * The parameters map between case variables and the event's payload: in-parameters carry
 * variables out into the event, out-parameters carry received fields back in. Each side is
 * either a plain name or an expression, and the engine reads whichever is set.
 */
function SendEventSection({
  t,
  element,
  disabled,
  onChangeElement,
}: {
  t: TFunction;
  element: CmmnElement;
  disabled: boolean;
  onChangeElement: (patch: Partial<CmmnElement>) => void;
}) {
  return (
    <section className="tf-properties__section">
      <h3 className="tf-properties__section-title">{t("cmmn.sendEvent")}</h3>

      <TextInput
        label={t("cmmn.sendEvent.eventType")}
        value={element.eventType ?? ""}
        disabled={disabled}
        hint={t("cmmn.sendEvent.eventType.hint")}
        onChange={(event) =>
          onChangeElement({ eventType: event.target.value.trim() ? event.target.value : undefined })
        }
      />

      <EventParameterRows
        t={t}
        kind="in"
        rows={element.eventInParameters ?? []}
        disabled={disabled}
        onChange={(eventInParameters) => onChangeElement({ eventInParameters })}
      />
      <EventParameterRows
        t={t}
        kind="out"
        rows={element.eventOutParameters ?? []}
        disabled={disabled}
        onChange={(eventOutParameters) => onChangeElement({ eventOutParameters })}
      />
    </section>
  );
}

function EventParameterRows({
  t,
  kind,
  rows,
  disabled,
  onChange,
}: {
  t: TFunction;
  kind: "in" | "out";
  rows: EventParameter[];
  disabled: boolean;
  onChange: (rows: EventParameter[]) => void;
}) {
  const update = (index: number, patch: Partial<EventParameter>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="tf-properties__subsection">
      <h4 className="tf-properties__subsection-title">{t(`cmmn.sendEvent.${kind}`)}</h4>
      <p className="tf-muted tf-properties__hint">{t(`cmmn.sendEvent.${kind}.hint`)}</p>

      <ul className="tf-properties__rows">
        {rows.map((row, index) => (
          <li className="tf-properties__row" key={index}>
            <input
              className="tf-input"
              aria-label={t("cmmn.sendEvent.source")}
              placeholder={t("cmmn.sendEvent.source")}
              value={row.source ?? ""}
              disabled={disabled}
              onChange={(event) =>
                update(index, { source: event.target.value || undefined })
              }
            />
            <input
              className="tf-input"
              aria-label={t("cmmn.sendEvent.sourceExpression")}
              placeholder={t("cmmn.sendEvent.sourceExpression")}
              value={row.sourceExpression ?? ""}
              disabled={disabled}
              onChange={(event) =>
                update(index, { sourceExpression: event.target.value || undefined })
              }
            />
            <input
              className="tf-input"
              aria-label={t("cmmn.sendEvent.target")}
              placeholder={t("cmmn.sendEvent.target")}
              value={row.target ?? ""}
              disabled={disabled}
              onChange={(event) => update(index, { target: event.target.value || undefined })}
            />
            {kind === "out" ? (
              <label className="tf-checkbox">
                <input
                  type="checkbox"
                  checked={row.transient === true}
                  disabled={disabled}
                  onChange={(event) => update(index, { transient: event.target.checked || undefined })}
                />
                {t("cmmn.sendEvent.transient")}
              </label>
            ) : null}
            <button
              type="button"
              className="tf-chip-item__remove"
              aria-label={t("cmmn.sendEvent.remove", { index: index + 1 })}
              disabled={disabled}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => onChange([...rows, {}])}
      >
        {t(`cmmn.sendEvent.add.${kind}`)}
      </Button>
    </div>
  );
}
