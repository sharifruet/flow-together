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
import {
  ApiError,
  Button,
  ConfirmDialog,
  ErrorState,
  Skeleton,
  useI18n,
  useToast,
  type ModelApi,
  type ModelResponse,
} from "@togetherflow/common";
import { useBpmnModeler } from "./useBpmnModeler";
import { canDeploy, validateBpmn, type ValidationIssue } from "./validateBpmn";
import { downloadFile } from "../library/importExport";
import { PropertiesPanel } from "./PropertiesPanel";

const AUTOSAVE_IDLE_MS = 4000;

export interface BpmnEditorProps {
  modelApi: ModelApi;
  model: ModelResponse;
  initialXml: string | null;
  loadError?: string | null;
  onBack: () => void;
  /** Called after a save or deploy; carries the updated draft where one exists. */
  onSaved: (draft?: ModelResponse) => void;
}

export function BpmnEditor({
  modelApi,
  model,
  initialXml,
  loadError,
  onBack,
  onSaved,
}: BpmnEditorProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
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
  } = useBpmnModeler(initialXml);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);
  const [sourceXml, setSourceXml] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);

  /** Read-only view of the XML the engine will actually receive (§7.4.2). */
  const openSource = useCallback(async () => {
    try {
      setSourceXml(await getXml());
    } catch (cause) {
      push({ tone: "error", message: (cause as Error).message || t("bpmn.xmlReadFailed") });
    }
  }, [getXml, push, t]);

  /**
   * Runs the client-side checks. They approximate `flowable-process-validation`, which
   * no REST endpoint exposes — so this catches the common mistakes early but is not a
   * guarantee, and the panel says so.
   */
  const check = useCallback(async () => {
    try {
      const found = validateBpmn(await getXml());
      setIssues(found);
      if (found.length === 0) push({ tone: "success", message: t("bpmn.checksClean") });
    } catch (cause) {
      push({ tone: "error", message: (cause as Error).message || t("bpmn.checkFailed") });
    }
  }, [getXml, push, t]);

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
    try {
      const found = validateBpmn(await getXml());
      setIssues(found.length > 0 ? found : null);
      if (!canDeploy(found)) {
        push({
          tone: "error",
          message: t("bpmn.fixBeforeDeploy"),
        });
        return;
      }
    } catch {
      // A model we cannot even read is the engine's problem to report.
    }
    setConfirmDeploy(true);
  }, [getXml, push, t]);

  const save = useCallback(
    async (options: { silent?: boolean } = {}) => {
      setSaving(true);
      try {
        const xml = await getXml();
        await modelApi.saveSource(model.id, xml);
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
    [getXml, markSaved, modelApi, model.id, push, onSaved, t],
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
    if (!dirty || !ready) return;
    const timer = setTimeout(() => void saveRef.current({ silent: true }), AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [dirty, ready]);

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
      <header className="tf-editor__header">
        <div className="tf-editor__identity">
          <button type="button" className="tf-back" onClick={leave}>
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
            <Button variant="secondary" onClick={zoomOut} aria-label={t("editor.zoomOut")}>
              −
            </Button>
            <Button variant="secondary" onClick={zoomFit} aria-label={t("editor.zoomFit")}>
              {t("action.fit")}
            </Button>
            <Button variant="secondary" onClick={zoomIn} aria-label={t("editor.zoomIn")}>
              +
            </Button>
          </div>
          <Button variant="secondary" disabled={!ready} onClick={() => void openSource()}>
            {t("bpmn.xmlTitle")}
          </Button>
          <Button variant="secondary" disabled={!ready} onClick={() => void check()}>
            {t("action.check")}
          </Button>
          <Button variant="secondary" loading={saving} disabled={!ready} onClick={() => void save()}>
            {t("action.save")}
          </Button>
          <Button
            variant="secondary"
            loading={saving}
            disabled={!ready}
            onClick={() => void saveVersion()}
          >
            {t("editor.saveVersion")}
          </Button>
          <Button loading={deploying} disabled={!ready} onClick={() => void startDeploy()}>
            {t("action.deploy")}
          </Button>
        </div>
      </header>

      {issues && issues.length > 0 ? (
        <section className="tf-issues" aria-label={t("bpmn.checksLabel")}>
          <h2 className="tf-issues__title">
            {issues.filter((i) => i.severity === "error").length} problem
            {issues.filter((i) => i.severity === "error").length === 1 ? "" : "s"},{" "}
            {issues.filter((i) => i.severity === "warning").length} warning
            {issues.filter((i) => i.severity === "warning").length === 1 ? "" : "s"}
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
                    onClick={() => selectElement(issue.elementId!)}
                  >
                    {t("action.show")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="tf-issues__caveat">
            These checks run in the browser. The engine's own validator has no REST
            endpoint, so passing here doesn't guarantee the engine will accept the model.
          </p>
          <Button variant="secondary" onClick={() => setIssues(null)}>
            {t("action.dismiss")}
          </Button>
        </section>
      ) : null}

      {sourceXml !== null ? (
        <div className="tf-dialog-backdrop" onMouseDown={() => setSourceXml(null)}>
          <div
            className="tf-dialog tf-dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-label={t("bpmn.xmlLabel")}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="tf-dialog__title">{t("bpmn.xmlTitle")}</h2>
            <p className="tf-dialog__description">
              Exactly what will be deployed. Read-only — edit the diagram, not the text.
            </p>
            <pre className="tf-source">{sourceXml}</pre>
            <div className="tf-dialog__actions">
              <Button
                variant="secondary"
                onClick={() =>
                  downloadFile(
                    `${model.key ?? model.id}.bpmn20.xml`,
                    sourceXml,
                    "application/xml",
                  )
                }
              >
                {t("action.download")}
              </Button>
              <Button variant="secondary" onClick={() => setSourceXml(null)}>
                {t("action.close")}
              </Button>
            </div>
          </div>
        </div>
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
    </section>
  );
}
