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
  onSaved: () => void;
}

export function DmnEditor({
  modelApi,
  model,
  initialXml,
  loadError,
  onBack,
  onSaved,
}: DmnEditorProps) {
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
        setError(cause.message || "This decision model could not be opened.");
      });

    return () => {
      cancelled = true;
    };
  }, [initialXml]);

  // Teardown is handled by the callback ref (invoked with null on unmount). A separate
  // unmount effect would be double-invoked under StrictMode and destroy the modeler the
  // ref created — see the note in useBpmnModeler.ts.

  const getXml = useCallback(async () => {
    const modeler = modelerRef.current;
    if (!modeler) throw new Error("The editor is not ready yet.");
    const { xml } = await modeler.saveXML({ format: true });
    if (!xml) throw new Error("The decision model could not be serialised.");
    return xml;
  }, []);

  const save = useCallback(
    async (options: { silent?: boolean } = {}) => {
      setSaving(true);
      try {
        const xml = await getXml();
        await modelApi.saveSource(model.id, xml);
        setDirty(false);
        setLastSavedAt(new Date());
        if (!options.silent) push({ tone: "success", message: "Saved." });
        onSaved();
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? (cause as Error).message ?? "Could not save this model.",
          reference: apiError?.correlationId,
        });
      } finally {
        setSaving(false);
      }
    },
    [getXml, modelApi, model.id, push, onSaved],
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
      push({ tone: "success", message: `Deployed as ${deployment.id}.` });
      onSaved();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? (cause as Error).message ?? "Deployment failed.",
        reference: apiError?.correlationId,
      });
    } finally {
      setDeploying(false);
    }
  };

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
          <Button variant="secondary" loading={saving} disabled={!ready} onClick={() => void save()}>
            Save
          </Button>
          <Button loading={deploying} disabled={!ready} onClick={() => setConfirmDeploy(true)}>
            Deploy
          </Button>
        </div>
      </header>

      {loadError ? <ErrorState error={new Error(loadError)} /> : null}
      {error ? <ErrorState error={new Error(error)} /> : null}

      <div className="tf-editor__body">
        <div className="tf-editor__canvas-wrap">
          {!ready && !error ? (
            <div className="tf-editor__loading">
              <Skeleton rows={6} label="Loading decision model" />
            </div>
          ) : null}
          <div className="tf-editor__canvas tf-editor__canvas--dmn" ref={containerRef} data-testid="dmn-canvas" />
        </div>
      </div>

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
        title="Deploy this decision?"
        description={`"${model.name || model.id}" will be saved and deployed to the decision engine. Evaluations from now on use this version.`}
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
