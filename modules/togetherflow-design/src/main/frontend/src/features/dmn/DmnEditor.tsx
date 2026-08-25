/**
 * DMN editor screen (REQUIREMENTS.md §7.4.4).
 *
 * dmn-js ships both the DRD view and the decision-table editor, and switches between
 * them itself, so this screen wires lifecycle and persistence rather than rebuilding
 * the editing surface. Same autosave and unsaved-changes guarantees as BPMN.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import DmnModeler from "dmn-js/lib/Modeler";
import "dmn-js/dist/assets/diagram-js.css";
import "dmn-js/dist/assets/dmn-js-shared.css";
import "dmn-js/dist/assets/dmn-js-drd.css";
import "dmn-js/dist/assets/dmn-js-decision-table.css";
import "dmn-js/dist/assets/dmn-js-decision-table-controls.css";
import "dmn-js/dist/assets/dmn-font/css/dmn.css";
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

const AUTOSAVE_IDLE_MS = 4000;

export interface DmnEditorProps {
  modelApi: ModelApi;
  model: ModelResponse;
  initialXml: string | null;
  loadError?: string | null;
  onBack: () => void;
  /** Called after a save or deploy; carries the updated draft where one exists. */
  onSaved: (draft?: ModelResponse) => void;
}

export function DmnEditor({
  modelApi,
  model,
  initialXml,
  loadError,
  onBack,
  onSaved,
}: DmnEditorProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const modelerRef = useRef<DmnModeler | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      modelerRef.current?.destroy();
      modelerRef.current = null;
      return;
    }
    if (modelerRef.current) return;

    const modeler = new DmnModeler({ container: node });
    modelerRef.current = modeler;

    // dmn-js swaps the active viewer when moving between DRD and a decision table,
    // so change events must be re-bound to whichever view is active.
    modeler.on("views.changed", () => {
      const active = modeler.getActiveViewer?.();
      active?.on?.("commandStack.changed", () => setDirty(true));
    });
    modeler.on("view.contentChanged", () => setDirty(true));
  }, []);

  useEffect(() => {
    const modeler = modelerRef.current;
    if (!modeler || initialXml === null) return;
    let cancelled = false;

    modeler
      .importXML(initialXml)
      .then(() => {
        if (cancelled) return;
        setReady(true);
        setError(null);
        setDirty(false);
      })
      .catch((cause: Error) => {
        if (cancelled) return;
        setReady(false);
        setError(cause.message || t("dmn.openFailed"));
      });

    return () => {
      cancelled = true;
    };
  }, [initialXml, t]);

  // Teardown is handled by the callback ref (invoked with null on unmount). A separate
  // unmount effect would be double-invoked under StrictMode and destroy the modeler the
  // ref created — see the note in useBpmnModeler.ts.

  const getXml = useCallback(async () => {
    const modeler = modelerRef.current;
    if (!modeler) throw new Error(t("dmn.notReady"));
    const { xml } = await modeler.saveXML({ format: true });
    if (!xml) throw new Error(t("dmn.serialiseFailed"));
    return xml;
  }, [t]);

  /**
   * Cuts a version from what is in the editor (§7.4.1) — the checkpoint before a risky
   * edit. Saves first, so the version records what the user is looking at.
   */
  const saveVersion = useCallback(async () => {
    setSaving(true);
    try {
      const xml = await getXml();
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
        message: apiError?.message ?? (cause as Error).message ?? t("editor.versionFailed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setSaving(false);
    }
  }, [getXml, modelApi, model, push, onSaved, t]);

  const save = useCallback(
    async (options: { silent?: boolean } = {}) => {
      setSaving(true);
      try {
        const xml = await getXml();
        await modelApi.saveSource(model.id, xml);
        setDirty(false);
        setLastSavedAt(new Date());
        if (!options.silent) push({ tone: "success", message: t("editor.saved.toast") });
        onSaved();
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? (cause as Error).message ?? t("editor.saveFailed"),
          reference: apiError?.correlationId,
        });
      } finally {
        setSaving(false);
      }
    },
    [getXml, modelApi, model.id, push, onSaved, t],
  );

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

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const deploy = async () => {
    setDeploying(true);
    try {
      const xml = await getXml();
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
        message: apiError?.message ?? (cause as Error).message ?? t("editor.deployFailed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setDeploying(false);
    }
  };

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
          <Button loading={deploying} disabled={!ready} onClick={() => setConfirmDeploy(true)}>
            {t("action.deploy")}
          </Button>
        </div>
      </header>

      {loadError ? <ErrorState error={new Error(loadError)} /> : null}
      {error ? <ErrorState error={new Error(error)} /> : null}

      <div className="tf-editor__body">
        <div className="tf-editor__canvas-wrap">
          {!ready && !error ? (
            <div className="tf-editor__loading">
              <Skeleton rows={6} label={t("dmn.loading")} />
            </div>
          ) : null}
          <div className="tf-editor__canvas tf-editor__canvas--dmn" ref={containerRef} data-testid="dmn-canvas" />
        </div>
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
        title={t("dmn.deploy.title")}
        description={t("dmn.deploy.description", { name: model.name || model.id })}
        confirmLabel={t("dmn.deploy.confirm")}
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
