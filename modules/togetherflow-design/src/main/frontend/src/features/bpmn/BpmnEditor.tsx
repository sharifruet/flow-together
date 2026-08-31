/**
 * BPMN editor screen (REQUIREMENTS.md §7.4.2).
 *
 * Autosave and the unsaved-changes guard are close to hard requirements here
 * (IMPLEMENTATION_PLAN.md Phase 4): losing an hour of modelling to a browser crash or
 * a stray back-navigation is the fastest way for this to feel unprofessional.
 */

import { useCallback, useEffect, useRef, useState } from "react";
// Imported here rather than in the entry point so the stylesheets are code-split
// alongside the library that needs them.
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "diagram-js-minimap/assets/diagram-js-minimap.css";
import {
  ApiError,
  Button,
  Modal,
  Icon,
  ConfirmDialog,
  ErrorState,
  Skeleton,
  useI18n,
  useToast,
  type ModelApi,
  type ModelResponse,
  type ModelValidationApi,
  type ProcessApi,
} from "@togetherflow/common";
import { useConflictPrompt } from "../editors/ConflictPrompt";
import { EditorMenuBar } from "../editors/EditorMenuBar";
import { useBpmnModeler } from "./useBpmnModeler";
import type { IdentitySource } from "./useIdentities";
import { canDeploy, issuesFromServer, validateBpmn, type ValidationIssue } from "./validateBpmn";
import { downloadFile } from "../library/importExport";
import { RuntimePreview } from "../editors/RuntimePreview";
import { PropertiesPanel } from "./PropertiesPanel";

const AUTOSAVE_IDLE_MS = 4000;

export interface BpmnEditorProps {
  modelApi: ModelApi;
  /**
   * Server-side validation (§7.4.2). Optional so the editor still works against a
   * deployment whose engine predates the model-validation endpoint — it falls back to the
   * browser checks and says so, rather than refusing to validate at all.
   */
  validationApi?: ModelValidationApi;
  /** Ids the reference fields suggest, and the lookup that widens them as you type. */
  identities?: IdentitySource;
  /**
   * Lets a deploy be followed by starting a test instance (W3.3). Omitted, the offer is
   * simply not made — there is nowhere to start one.
   */
  /** Null until there is a session — the app makes no authenticated calls before one. */
  processApi?: ProcessApi | null;
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

export function BpmnEditor({
  modelApi,
  validationApi,
  identities,
  processApi,
  model,
  initialXml,
  loadError,
  onBack,
  onReloadSource,
  onSaved,
}: BpmnEditorProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  /*
   * The concurrent-edit guard's user half (W1.1). Declared before `save` so the
   * autosave effect and the save callback can both see it.
   */
  const conflict = useConflictPrompt({ onReload: () => onReloadSource?.() });

  // Destructured rather than kept as an object: the members are passed as props, and
  // property access on the hook's result confuses the refs lint rule.
  const {
    containerRef,
    ready,
    error: editorError,
    dirty,
    canUndo,
    canRedo,
    selection,
    undo,
    redo,
    zoomIn,
    zoomOut,
    zoomFit,
    getXml,
    selectElement,
    markSaved,
    updateProperties,
    moddle,
    getRootElements,
    addRootElement,
    getOutgoingFlows,
    getFlowElement,
    ensureNamespace,
    replaceElementType,
    updateModdleProperties,
    markProblems,
    onModelChanged,
  } = useBpmnModeler(initialXml);
  /*
   * `useBpmnModeler` keeps a `revision` counter that it bumps whenever the edited element
   * changes. It is deliberately not read here: bumping it re-renders this component, which
   * re-renders the properties panel, which re-reads the business object bpmn-js mutated in
   * place. Re-mounting the panel instead — by keying it on the revision — would work too,
   * and would throw away input focus on every keystroke.
   */
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);
  /**
   * Whether this model has been deployed in this session, which is what makes a test run
   * possible — and a *button*, not a dialog that opens by itself.
   *
   * The first cut popped the dialog open on every deploy. Deploying is a frequent action
   * and starting an instance is a rare one, so that put a modal about creating real
   * runtime state in front of someone who had just asked for something else entirely.
   * An offer waits to be taken.
   */
  const [deployed, setDeployed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sourceXml, setSourceXml] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  /** Whether the last check got a verdict from the engine, which decides the panel's caveat. */
  const [engineChecked, setEngineChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  /**
   * Re-check as the model changes, rather than only when asked (§14.3).
   *
   * Browser checks only: they are synchronous and free, whereas asking the engine on every
   * keystroke would be a request per edit. The engine's verdict still arrives on an
   * explicit check or a deploy, and the panel keeps saying which side reported what.
   */
  const [liveChecking, setLiveChecking] = useState(true);

  /** Read-only view of the XML the engine will actually receive (§7.4.2). */
  const openSource = useCallback(async () => {
    try {
      setSourceXml(await getXml());
    } catch (cause) {
      push({ tone: "error", message: (cause as Error).message || t("bpmn.xmlReadFailed") });
    }
  }, [getXml, push, t]);

  /**
   * Validates the model, preferring the engine's own verdict.
   *
   * The browser checks run first and unconditionally: they need no round trip, and they are
   * the only answer available when the engine cannot be reached. The engine's validator then
   * runs over the same XML and its findings are merged in, labelled as its own. Returns the
   * combined list so the deploy path can decide on it without checking twice.
   */
  const runChecks = useCallback(
    async (xml: string): Promise<{ found: ValidationIssue[]; fromEngine: boolean }> => {
      const browserIssues = validateBpmn(xml).map((issue) => ({
        ...issue,
        source: "browser" as const,
      }));

      /*
       * Structural linting, loaded on demand so it stays out of the editor's own chunk.
       * A failure here is not allowed to lose the checks that did run — the linter is the
       * least authoritative of the three, so it degrades quietly.
       */
      let lintIssues: ValidationIssue[] = [];
      try {
        const { lintXml } = await import("./lintBpmn");
        lintIssues = await lintXml(xml);
      } catch {
        /* linting is advisory; its absence is not worth a message */
      }

      if (!validationApi) return { found: [...lintIssues, ...browserIssues], fromEngine: false };
      try {
        const verdict = await validationApi.validateBpmn(xml);
        return {
          found: [...issuesFromServer(verdict), ...browserIssues, ...lintIssues],
          fromEngine: true,
        };
      } catch {
        // An unreachable validator must not block modelling, but it must not be silent
        // either: the panel's caveat changes, and the toast says which half ran.
        push({ tone: "warning", message: t("bpmn.checks.serverUnreachable") });
        return { found: [...browserIssues, ...lintIssues], fromEngine: false };
      }
    },
    [push, t, validationApi],
  );

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const { found, fromEngine } = await runChecks(await getXml());
      setIssues(found);
      setEngineChecked(fromEngine);
      if (found.length === 0) push({ tone: "success", message: t("bpmn.checksClean") });
    } catch (cause) {
      push({ tone: "error", message: (cause as Error).message || t("bpmn.checkFailed") });
    } finally {
      setChecking(false);
    }
  }, [getXml, push, runChecks, t]);

  /*
   * Keep the canvas markers in step with whatever the panel is currently showing. Done as
   * an effect on `issues` rather than at each call site, so no path can update the list
   * and forget the diagram — dismissing the panel clears the markers for the same reason.
   */
  useEffect(() => {
    markProblems(
      (issues ?? [])
        .filter((issue) => issue.elementId)
        .map((issue) => ({ elementId: issue.elementId!, severity: issue.severity })),
    );
  }, [issues, markProblems]);

  /*
   * Re-run the browser checks whenever the model changes.
   *
   * Debounced, because `commandStack.changed` fires on every keystroke in a label and
   * re-parsing the XML each time is wasted work. Engine-sourced problems are dropped on
   * the first edit: they described the model as it was, and silently keeping a stale
   * verdict next to fresh ones would be worse than showing fewer.
   */
  useEffect(() => {
    if (!liveChecking || !ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onModelChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void (async () => {
          try {
            const found = validateBpmn(await getXml()).map((issue) => ({
              ...issue,
              source: "browser" as const,
            }));
            setIssues(found.length > 0 ? found : null);
            setEngineChecked(false);
          } catch {
            // A model that cannot be serialised mid-edit is not worth reporting; the next
            // change will re-check.
          }
        })();
      }, 400);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [liveChecking, ready, onModelChanged, getXml]);

  /** Deploying runs the checks first; blocking problems stop it before the round trip. */

  /**
   * Cuts a version from what is on the canvas right now (§7.4.1) — the checkpoint before
   * a risky edit. Saves first, so the version records what the user is looking at rather
   * than whatever was last written.
   */
  const saveVersion = useCallback(async () => {
    setSaving(true);
    try {
      const xml = await getXml();
      await modelApi.saveSource(model.id, xml);
      const draft = await modelApi.cutVersion(model, xml);
      markSaved();
      setLastSavedAt(new Date());
      push({ tone: "success", message: t("editor.versionSaved", { version: draft.version ?? 1 }) });
      onSaved(draft);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? (cause as Error).message ?? t("editor.versionFailed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setSaving(false);
    }
  }, [getXml, markSaved, modelApi, model, push, onSaved, t]);

  const startDeploy = useCallback(async () => {
    setChecking(true);
    try {
      const { found, fromEngine } = await runChecks(await getXml());
      setIssues(found.length > 0 ? found : null);
      setEngineChecked(fromEngine);
      if (!canDeploy(found)) {
        push({
          tone: "error",
          message: t("bpmn.fixBeforeDeploy"),
        });
        return;
      }
    } catch {
      // A model we cannot even read is the engine's problem to report.
    } finally {
      setChecking(false);
    }
    setConfirmDeploy(true);
  }, [getXml, push, runChecks, t]);

  const save = useCallback(
    async (options: { silent?: boolean } = {}) => {
      setSaving(true);
      try {
        const xml = await getXml();
        const written = await conflict.guard(async (overwrite) => {
          await modelApi.saveSource(model.id, xml, { overwrite });
          return true;
        });
        // Refused: someone else saved since this editor last read. The prompt is up and
        // autosave is paused; returning false lets a caller that was going to deploy stop.
        if (!written) return false;
        markSaved();
        setLastSavedAt(new Date());
        if (!options.silent) push({ tone: "success", message: t("editor.saved.toast") });
        onSaved();
        return true;
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? (cause as Error).message ?? t("editor.saveFailed"),
          reference: apiError?.correlationId,
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [getXml, markSaved, modelApi, model.id, push, onSaved, t, conflict],
  );

  // Autosave once editing goes idle. Held in a ref so a re-render mid-typing does not
  // restart the clock in a way that prevents it ever firing.
  // Synced in an effect, not during render: writing a ref mid-render is unsafe under
  // concurrent rendering. The timer below only reads it once it fires, by which point
  // the effect has run.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    if (!dirty || !ready || conflict.blocked) return;
    const timer = setTimeout(() => void saveRef.current({ silent: true }), AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [dirty, ready, conflict.blocked]);

  // Browser-level guard: covers reloads and tab closes, which no in-app router can.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Ctrl/Cmd+S is muscle memory for anyone who has used a modelling tool.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [save]);

  const leave = () => (dirty ? setConfirmLeave(true) : onBack());

  const deploy = async () => {
    setDeploying(true);
    try {
      // Deploy what is on the canvas, not what was last saved — otherwise a user who
      // edits and deploys without saving silently ships the previous version.
      const xml = await getXml();
      await modelApi.saveSource(model.id, xml);
      markSaved();
      setLastSavedAt(new Date());
      const deployment = await modelApi.deploy(model, xml);
      push({ tone: "success", message: t("editor.deployed", { id: deployment.id }) });
      // Enables the Test run button; it does not open anything.
      if (processApi && model.key) setDeployed(true);
      // Deploying cuts a version (§7.4.1), so the draft's version number has moved on.
      // The row itself is unchanged, which is why nothing has to re-import.
      onSaved(deployment.draft);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? (cause as Error).message ?? t("editor.deployFailed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setDeploying(false);
    }
  };

  const busy = saving || deploying;

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
        onBack={leave}
        onSave={() => void save()}
        saving={saving}
        ready={ready}
        onSaveVersion={() => void saveVersion()}
        onValidate={() => void check()}
        validating={checking}
        undo={{ run: undo, can: canUndo && !busy }}
        redo={{ run: redo, can: canRedo && !busy }}
        zoom={{ in: zoomIn, out: zoomOut, fit: zoomFit }}
        onExport={() => void openSource()}
        exportLabel={t("bpmn.xmlTitle")}
        /*
          Appears once this model has been deployed, because only then is there a
          definition to start. Deliberately a button rather than something that opens
          itself: it creates real runtime state, and that should never be the side effect
          of asking for something else.
        */
        extra={
          deployed && processApi ? (
            <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
              <Icon name="play" size={16} />
              {t("preview.action")}
            </Button>
          ) : undefined
        }
        primary={{
          label: t("action.deploy"),
          run: () => void startDeploy(),
          busy: deploying || checking,
        }}
      />

      {issues && issues.length > 0 ? (
        <section className="tf-issues" aria-label={t("bpmn.checksLabel")}>
          <h2 className="tf-issues__title">
            {t("bpmn.checks.summary.problems", {
              count: issues.filter((i) => i.severity === "error").length,
            })}
            {", "}
            {t("bpmn.checks.summary.warnings", {
              count: issues.filter((i) => i.severity === "warning").length,
            })}
          </h2>
          {/*
            Whether any of this stops a deploy, said outright.
            `canDeploy` already ignores warnings — an unnamed gateway deploys and runs —
            but the panel never said so, and a warning sitting under a caveat about "what
            a deploy would reject" reads as a rejection. The rule is in the code; this is
            the sentence that tells the reader.
          */}
          <p className="tf-issues__verdict">
            {canDeploy(issues)
              ? t("bpmn.checks.nonBlocking")
              : t("bpmn.checks.blocking", {
                  count: issues.filter((i) => i.severity === "error").length,
                })}
          </p>
          <ul className="tf-issues__list">
            {issues.map((issue, index) => (
              <li
                className={`tf-issues__item tf-issues__item--${issue.severity}`}
                key={`${issue.elementId ?? ""}-${index}`}
              >
                {/* Translated, not the raw enum: this was rendering English in every locale. */}
                <span className="tf-issues__severity">
                  {t(`bpmn.checks.severity.${issue.severity}`)}
                </span>
                <span className={`tf-issues__source tf-issues__source--${issue.source ?? "browser"}`}>
                  {t(`bpmn.checks.source.${issue.source ?? "browser"}`)}
                </span>
                <span>{issue.message}</span>
                {issue.elementId ? (
                  <button
                    type="button"
                    className="tf-issues__locate"
                    onClick={() => selectElement(issue.elementId!)}
                  >
                    {t("action.show")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="tf-issues__caveat">
            {engineChecked ? t("bpmn.checks.caveat.engine") : t("bpmn.checks.caveat.browserOnly")}
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

      {sourceXml !== null ? (
        <Modal
          open
          title={t("bpmn.xmlTitle")}
          description={t("bpmn.xmlDescription")}
          size="lg"
          onClose={() => setSourceXml(null)}
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  downloadFile(`${model.key ?? model.id}.bpmn20.xml`, sourceXml, "application/xml")
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

      {loadError ? (
        <ErrorState error={new Error(loadError)} />
      ) : editorError ? (
        <ErrorState error={new Error(editorError)} />
      ) : null}

      <div className="tf-editor__body">
        <div className="tf-editor__canvas-wrap">
          {!ready && !editorError ? (
            <div className="tf-editor__loading">
              <Skeleton rows={6} label={t("bpmn.loadingDiagram")} />
            </div>
          ) : null}
          <div className="tf-editor__canvas" ref={containerRef} data-testid="bpmn-canvas" />
        </div>
        <PropertiesPanel
          moddle={moddle}
          element={selection}
          disabled={busy}
          onChange={updateProperties}
          getRootElements={getRootElements}
          addRootElement={addRootElement}
          getOutgoingFlows={getOutgoingFlows}
          getFlowElement={getFlowElement}
          ensureNamespace={ensureNamespace}
          identities={identities}
          onIdentitySearch={identities?.search}
          replaceElementType={replaceElementType}
          updateModdleProperties={updateModdleProperties}
        />
      </div>

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
        title={t("bpmn.deploy.title")}
        description={t("bpmn.deploy.description", { name: model.name || model.id })}
        confirmLabel={t("bpmn.deploy.confirm")}
        busy={deploying}
        onCancel={() => setConfirmDeploy(false)}
        onConfirm={() => {
          setConfirmDeploy(false);
          void deploy();
        }}
      />

      {previewOpen && processApi && model.key ? (
        <RuntimePreview
          processApi={processApi}
          definitionKey={model.key}
          modelName={model.name || model.key || model.id}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}

      {/* Reload-or-overwrite, when someone else saved this model (W1.1). */}
      {conflict.prompt}
    </section>
  );
}
