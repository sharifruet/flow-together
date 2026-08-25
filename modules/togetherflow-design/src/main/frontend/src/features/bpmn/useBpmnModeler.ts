/**
 * bpmn-js lifecycle as a hook: create the modeller, import XML, and expose the
 * commands the editor UI needs (undo/redo, zoom, export).
 *
 * Dirty tracking hangs off the command stack rather than a manual flag, so it cannot
 * disagree with what the user actually did — which matters because the unsaved-changes
 * guard depends on it (REQUIREMENTS.md §14.3).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import { flowableModdleDescriptor } from "./flowableModdle";
import type { ModdleFactory } from "./bpmnExtensions";

export interface BpmnModelerState {
  containerRef: (node: HTMLDivElement | null) => void;
  ready: boolean;
  error: string | null;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  getXml: () => Promise<string>;
  /** Selects an element by id and scrolls it into view (used by validation). */
  selectElement: (elementId: string) => void;
  markSaved: () => void;
  /** The currently selected element, for the properties panel. */
  selection: BpmnElement | null;
  updateProperties: (element: BpmnElement, properties: Record<string, unknown>) => void;
  /**
   * The moddle factory, for the properties the panel cannot set as plain attributes:
   * listeners, multi-instance configuration and timer definitions are nested objects
   * that have to be constructed through moddle, not assigned as strings.
   *
   * Null until the modeller has been created.
   */
  moddle: ModdleFactory | null;
}

export interface BpmnElement {
  id: string;
  type: string;
  businessObject: Record<string, unknown> & { $type: string; id: string; name?: string };
}

interface CommandStack {
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;
}

export function useBpmnModeler(xml: string | null): BpmnModelerState {
  const modelerRef = useRef<BpmnModeler | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [selection, setSelection] = useState<BpmnElement | null>(null);
  /*
   * Held in state rather than read from the ref during render: a ref read while
   * rendering is unsafe under concurrent rendering, and the properties panel needs this
   * as a prop. Set once, in the callback ref, where the modeller is created.
   */
  const [moddle, setModdle] = useState<ModdleFactory | null>(null);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      modelerRef.current?.destroy();
      modelerRef.current = null;
      setModdle(null);
      return;
    }
    if (modelerRef.current) return;

    const modeler = new BpmnModeler({
      container: node,
      // Keyboard binding is implicit in current diagram-js; passing keyboard.bindTo
      // is rejected outright.
      moddleExtensions: { flowable: flowableModdleDescriptor },
    });
    modelerRef.current = modeler;
    setModdle(modeler.get("moddle") as ModdleFactory);

    const syncStack = () => {
      const stack = modeler.get("commandStack") as CommandStack;
      setCanUndo(stack.canUndo());
      setCanRedo(stack.canRedo());
    };

    modeler.on("commandStack.changed", () => {
      setDirty(true);
      syncStack();
    });
    modeler.on("selection.changed", (event: { newSelection: BpmnElement[] }) => {
      setSelection(event.newSelection.length === 1 ? event.newSelection[0] : null);
    });
    modeler.on("element.changed", () => syncStack());
  }, []);

  // Import whenever the source changes. bpmn-js has no "reimport" concept beyond
  // calling importXML again, which resets the command stack — hence dirty=false after.
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!modeler || xml === null) return;
    let cancelled = false;

    modeler
      .importXML(xml)
      .then(({ warnings }: { warnings: unknown[] }) => {
        if (cancelled) return;
        if (warnings.length > 0) {
          // Warnings are not failures — an unknown extension element still imports —
          // so they are surfaced without blocking editing.
          console.warn("BPMN import warnings", warnings);
        }
        setReady(true);
        setError(null);
        setDirty(false);
        try {
          (modeler.get("canvas") as { zoom: (a: string, b: string) => void }).zoom(
            "fit-viewport",
            "auto",
          );
        } catch {
          /* zoom is cosmetic; never let it break the import */
        }
      })
      .catch((cause: Error) => {
        if (cancelled) return;
        setReady(false);
        setError(cause.message || "This diagram could not be opened.");
      });

    return () => {
      cancelled = true;
    };
  }, [xml]);

  /*
   * Teardown lives only in the callback ref above, which React invokes with null on
   * unmount. A separate unmount effect looks equivalent but is not: under StrictMode
   * effects are double-invoked while callback refs are not, so the effect's cleanup
   * destroyed the modeler the ref had created and nothing recreated it — the canvas
   * silently never appeared. Only reproducible in dev, which is why a production
   * build hid it.
   */

  /**
   * Each command is a stable useCallback so the returned object's members keep their
   * identity across renders — the properties panel takes `updateProperties` as a prop,
   * and a fresh function every render would re-render it needlessly. Reading the ref
   * inside the callback (rather than in the hook body) also keeps the ref access out
   * of render, which is what makes it safe under concurrent rendering.
   */
  const undo = useCallback(() => {
    (modelerRef.current?.get("commandStack") as CommandStack | undefined)?.undo();
  }, []);

  const redo = useCallback(() => {
    (modelerRef.current?.get("commandStack") as CommandStack | undefined)?.redo();
  }, []);

  const zoomIn = useCallback(() => {
    const canvas = modelerRef.current?.get("canvas") as
      | { zoom: (level?: number | string) => number }
      | undefined;
    if (canvas) canvas.zoom(canvas.zoom() + 0.2);
  }, []);

  const zoomOut = useCallback(() => {
    const canvas = modelerRef.current?.get("canvas") as
      | { zoom: (level?: number | string) => number }
      | undefined;
    if (canvas) canvas.zoom(Math.max(0.2, canvas.zoom() - 0.2));
  }, []);

  const zoomFit = useCallback(() => {
    const canvas = modelerRef.current?.get("canvas") as
      | { zoom: (a: string, b: string) => void }
      | undefined;
    canvas?.zoom("fit-viewport", "auto");
  }, []);

  /**
   * Selects an element by id and scrolls it into view.
   *
   * Used by the validation panel: a problem the user cannot find on the canvas is only
   * marginally more useful than no message at all.
   */
  const selectElement = useCallback((elementId: string) => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    const registry = modeler.get("elementRegistry") as
      | { get: (id: string) => unknown }
      | undefined;
    const element = registry?.get(elementId);
    if (!element) return;
    const selection = modeler.get("selection") as
      | { select: (element: unknown) => void }
      | undefined;
    selection?.select(element);
    const canvas = modeler.get("canvas") as
      | { scrollToElement?: (element: unknown) => void }
      | undefined;
    canvas?.scrollToElement?.(element);
  }, []);

  const getXml = useCallback(async () => {
    const modeler = modelerRef.current;
    if (!modeler) throw new Error("The editor is not ready yet.");
    const { xml: exported } = await modeler.saveXML({ format: true });
    if (!exported) throw new Error("The diagram could not be serialised.");
    return exported;
  }, []);

  const markSaved = useCallback(() => setDirty(false), []);

  const updateProperties = useCallback(
    (element: BpmnElement, properties: Record<string, unknown>) => {
      const modeling = modelerRef.current?.get("modeling") as
        | { updateProperties: (el: BpmnElement, props: Record<string, unknown>) => void }
        | undefined;
      modeling?.updateProperties(element, properties);
    },
    [],
  );

  return {
    containerRef,
    ready,
    error,
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
    moddle,
    updateProperties,
  };
}
