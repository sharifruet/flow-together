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
  ConfirmDialog,
  ErrorState,
  Skeleton,
  useI18n,
  useToast,
  type ModelApi,
  type ModelResponse,
} from "@togetherflow/common";
import { useConflictPrompt } from "../editors/ConflictPrompt";
import { EditorMenuBar } from "../editors/EditorMenuBar";
import { downloadFile } from "../library/importExport";

const AUTOSAVE_IDLE_MS = 4000;

interface CommandStack {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

interface Canvas {
  zoom: (level: number | "fit-viewport", center?: unknown) => number;
}

/**
 * A service from whichever dmn-js view is on screen, or `undefined`.
 *
 * Every command here has to go through the *active* viewer: dmn-js holds one per view and
 * swaps them as you move between the DRD and a decision table. Reading a service once and
 * keeping it would leave the toolbar driving a viewer nobody is looking at.
 *
 * `undefined` is a real answer rather than a failure — a decision table has no canvas, so
 * asking it for one is how the zoom controls learn to hide.
 */
function activeService<T>(modeler: DmnModeler, name: string): T | undefined {
  const active = modeler.getActiveViewer?.() as { get?: (id: string) => unknown } | undefined;
  try {
    return active?.get?.(name) as T | undefined;
  } catch {
    // diagram-js throws for a service the current view does not provide.
    return undefined;
  }
}

const ZOOM_STEP = 0.2;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;

export interface DmnEditorProps {
  modelApi: ModelApi;
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

export function DmnEditor({
  modelApi,
  model,
  initialXml,
  loadError,
  onBack,
  onReloadSource,
  onSaved,
}: DmnEditorProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  /*
   * The concurrent-edit guard's user half (W1.1). Declared before `save` so the
   * autosave effect and the save callback can both see it.
   */
  const conflict = useConflictPrompt({ onReload: () => onReloadSource?.() });

  const modelerRef = useRef<DmnModeler | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  /*
   * Undo state, and whether the view on screen can be zoomed at all.
   *
   * This editor used to hand the menu bar nothing but Save and Save-version, while BPMN
   * and CMMN — the same diagram-js foundation, the same drag-and-delete canvas — had
   * undo, redo and zoom. Deleting a decision here was unrecoverable through the UI.
   *
   * dmn-js keeps a viewer per view and swaps the active one as you move between the DRD
   * and a decision table, so there is no single command stack to hold: each is read from
   * whichever viewer is active, and re-read whenever that changes.
   */
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  /** Only the DRD is a canvas; a decision table has rows, and zooming it means nothing. */
  const [canZoom, setCanZoom] = useState(false);
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

    const syncStack = () => {
      const stack = activeService<CommandStack>(modeler, "commandStack");
      setCanUndo(stack?.canUndo() ?? false);
      setCanRedo(stack?.canRedo() ?? false);
      // A decision table's viewer has no canvas, which is how "can this zoom?" is asked.
      setCanZoom(Boolean(activeService(modeler, "canvas")));
    };

    // dmn-js swaps the active viewer when moving between DRD and a decision table,
    // so change events must be re-bound to whichever view is active.
    modeler.on("views.changed", () => {
      const active = modeler.getActiveViewer?.();
      active?.on?.("commandStack.changed", () => {
        setDirty(true);
        syncStack();
      });
      // The new view has its own stack and may not be a canvas at all.
      syncStack();
    });
    modeler.on("view.contentChanged", () => {
      setDirty(true);
      syncStack();
    });
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
        const written = await conflict.guard(async (overwrite) => {
          await modelApi.saveSource(model.id, xml, { overwrite });
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
          message: apiError?.message ?? (cause as Error).message ?? t("editor.saveFailed"),
          reference: apiError?.correlationId,
        });
      } finally {
        setSaving(false);
      }
    },
    [getXml, modelApi, model.id, push, onSaved, t, conflict],
  );

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

  /** Undo and redo, against whichever view is on screen. */
  const runCommand = (command: "undo" | "redo") => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    const stack = activeService<CommandStack>(modeler, "commandStack");
    if (!stack) return;
    if (command === "undo" ? stack.canUndo() : stack.canRedo()) stack[command]();
    setCanUndo(stack.canUndo());
    setCanRedo(stack.canRedo());
  };

  /*
   * Zoom by a step rather than to a level, so repeated presses behave. Clamped, because
   * diagram-js will happily zoom to a point where the diagram is a dot or unreachably
   * large and there is no gesture on a trackpad-less machine to get back.
   */
  const zoomBy = (delta: number) => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    const canvas = activeService<Canvas>(modeler, "canvas");
    if (!canvas) return;
    const current = canvas.zoom(1) as unknown as number;
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (current || 1) + delta));
    canvas.zoom(next);
  };
  const zoomIn = () => zoomBy(ZOOM_STEP);
  const zoomOut = () => zoomBy(-ZOOM_STEP);
  const zoomFit = () => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    activeService<Canvas>(modeler, "canvas")?.zoom("fit-viewport");
  };

  /**
   * The DMN source, as a file.
   *
   * BPMN and CMMN both offer this and DMN did not, so the only way to get a decision
   * model out of here was to deploy it and fetch it back from the engine.
   */
  const exportXml = async () => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    try {
      const { xml } = await modeler.saveXML({ format: true });
      if (!xml) throw new Error("The editor produced no XML.");
      downloadFile(`${model.key ?? model.id}.dmn`, xml, "application/xml");
    } catch (cause) {
      push({ tone: "error", message: (cause as Error).message || t("dmn.exportFailed") });
    }
  };

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
        ready={ready}
        onSaveVersion={() => void saveVersion()}
        undo={{ run: () => runCommand("undo"), can: canUndo }}
        redo={{ run: () => runCommand("redo"), can: canRedo }}
        {...(canZoom ? { zoom: { in: zoomIn, out: zoomOut, fit: zoomFit } } : {})}
        onExport={() => void exportXml()}
        exportLabel={t("dmn.exportLabel")}
        primary={{
          label: t("action.deploy"),
          run: () => setConfirmDeploy(true),
          busy: deploying,
        }}
      />

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

      {/* Reload-or-overwrite, when someone else saved this model (W1.1). */}
      {conflict.prompt}
    </section>
  );
}
