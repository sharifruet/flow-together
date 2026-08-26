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
import minimapModule from "diagram-js-minimap";
import { flowableModdleDescriptor } from "./flowableModdle";
import type { ModdleElement, ModdleFactory } from "./bpmnExtensions";

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
  /**
   * What the properties panel edits: the selected element, or the diagram root when
   * nothing is selected.
   *
   * The fallback is not a convenience. bpmn-js never puts the root in a selection —
   * clicking empty canvas *clears* it — so without this the `bpmn:Process` is reachable
   * by nothing, and every process-level property (executability, candidate starters,
   * version tag, engine listeners) is unreachable in any diagram without pools.
   */
  selection: BpmnElement | null;
  /**
   * Increments whenever the edited element changes.
   *
   * bpmn-js mutates business objects in place, so an edit changes no React state and the
   * panel does not re-render — which leaves every conditional section stale: choose an
   * external-worker task type and its Topic field does not appear until the element is
   * reselected. This is what makes those sections update.
   */
  revision: number;
  updateProperties: (element: BpmnElement, properties: Record<string, unknown>) => void;
  /**
   * The moddle factory, for the properties the panel cannot set as plain attributes:
   * listeners, multi-instance configuration and timer definitions are nested objects
   * that have to be constructed through moddle, not assigned as strings.
   *
   * Null until the modeller has been created.
   */
  moddle: ModdleFactory | null;
  /**
   * Definitions-level root elements (`bpmn:Error`, `bpmn:Signal`, `bpmn:Message`,
   * `bpmn:Escalation`). Error and signal events are meaningless without one, and nothing
   * else in the editor can reach them — they live on `bpmn:Definitions`, not on any
   * element the canvas selects.
   */
  getRootElements: () => ModdleElement[];
  /** Appends a new root element to `bpmn:Definitions`, as one undoable command. */
  addRootElement: (root: ModdleElement) => void;
  /** Outgoing sequence flows of an element, for the gateway default-flow selector. */
  getOutgoingFlows: (elementId: string) => Array<{ id: string; name: string }>;
  /** Resolves a sequence flow id to the element itself, which `default` references. */
  getFlowElement: (flowId: string) => unknown;
  /**
   * Declares an XML namespace prefix on `bpmn:Definitions` if it is not already there.
   *
   * Needed for QName-valued *attribute content* such as a data object's
   * `itemSubjectRef="xsd:long"`. bpmn-moddle declares namespaces for the element and
   * attribute *names* it knows, but not for a prefix that appears only inside a value —
   * so without this the editor writes a model the engine refuses to parse
   * ("Undeclared prefix"). Found by deploying one.
   */
  ensureNamespace: (prefix: string, uri: string) => void;
  /**
   * Changes an element's BPMN type in place, keeping its id, name, position and
   * connections. bpmn-js offers this only through the context pad's wrench icon, which is
   * discoverable if you already know it is there.
   */
  replaceElementType: (element: BpmnElement, type: string) => void;
  /**
   * Updates a moddle object that is not itself a diagram element — a pool's referenced
   * `bpmn:Process`, for instance, which nothing on the canvas selects.
   */
  updateModdleProperties: (
    element: BpmnElement,
    moddleElement: unknown,
    properties: Record<string, unknown>,
  ) => void;
  /**
   * Marks elements on the canvas as having problems, replacing any previous marking.
   *
   * A list the reader has to match back to the diagram by name is a much weaker thing
   * than the diagram showing them.
   */
  markProblems: (marks: Array<{ elementId: string; severity: "error" | "warning" }>) => void;
  /** Fires after any modelling change, so validation can re-run against current state. */
  onModelChanged: (listener: () => void) => () => void;
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
  const [revision, setRevision] = useState(0);
  /** Read inside bpmn-js event handlers, which are registered once and never re-created. */
  const selectionRef = useRef<BpmnElement | null>(null);
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
      /*
       * The minimap starts collapsed: on a small model it is a permanent obstruction over
       * the top-right of the canvas, and it earns its place only once the diagram is
       * larger than the viewport. Opening it is one click and diagram-js remembers.
       */
      additionalModules: [minimapModule],
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
    /** The root stands in for "nothing selected", so the process is always editable. */
    const rootElement = (): BpmnElement | null => {
      const canvas = modeler.get("canvas") as
        | { getRootElement: () => BpmnElement | undefined }
        | undefined;
      return canvas?.getRootElement() ?? null;
    };

    const select = (next: BpmnElement | null) => {
      selectionRef.current = next;
      setSelection(next);
    };

    modeler.on("selection.changed", (event: { newSelection: BpmnElement[] }) => {
      select(event.newSelection.length === 1 ? event.newSelection[0] : rootElement());
    });

    modeler.on("element.changed", (event: { element?: BpmnElement }) => {
      syncStack();
      const current = selectionRef.current;
      if (!current) return;
      /*
       * Only for the element on screen. Bumping on every change would re-render the panel
       * once per element during a multi-element command, for no benefit.
       */
      if (event.element?.id === current.id) setRevision((value) => value + 1);
    });
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
        // Start on the process rather than an empty panel: it is what a modeller most
        // often wants first (key, name, executability) and is otherwise unreachable.
        const canvas = modeler.get("canvas") as
          | { getRootElement: () => BpmnElement | undefined }
          | undefined;
        const root = canvas?.getRootElement() ?? null;
        selectionRef.current = root;
        setSelection(root);
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

  /**
   * `bpmn:Definitions` is the parent of the canvas root, not something the element
   * registry holds, so it is reached through the root element's `$parent`.
   */
  const getDefinitions = useCallback((): ModdleElement | null => {
    const modeler = modelerRef.current;
    if (!modeler) return null;
    const canvas = modeler.get("canvas") as
      | { getRootElement: () => { businessObject?: { $parent?: ModdleElement } } }
      | undefined;
    return canvas?.getRootElement()?.businessObject?.$parent ?? null;
  }, []);

  const getRootElements = useCallback((): ModdleElement[] => {
    const definitions = getDefinitions();
    return (definitions?.rootElements as ModdleElement[] | undefined) ?? [];
  }, [getDefinitions]);

  const addRootElement = useCallback(
    (root: ModdleElement) => {
      const modeler = modelerRef.current;
      const definitions = getDefinitions();
      if (!modeler || !definitions) return;
      const canvas = modeler.get("canvas") as { getRootElement: () => unknown } | undefined;
      const modeling = modelerRef.current?.get("modeling") as
        | {
            updateModdleProperties: (
              element: unknown,
              moddleElement: unknown,
              properties: Record<string, unknown>,
            ) => void;
          }
        | undefined;
      const existing = (definitions.rootElements as ModdleElement[] | undefined) ?? [];
      // Through `modeling` rather than pushing directly, so the new declaration lands on
      // the command stack and undo does not leave a dangling reference behind.
      modeling?.updateModdleProperties(canvas?.getRootElement(), definitions, {
        rootElements: [...existing, root],
      });
    },
    [getDefinitions],
  );

  const getOutgoingFlows = useCallback((elementId: string) => {
    const registry = modelerRef.current?.get("elementRegistry") as
      | { get: (id: string) => { outgoing?: Array<{ id: string; businessObject?: { name?: string } }> } }
      | undefined;
    const element = registry?.get(elementId);
    return (element?.outgoing ?? []).map((flow) => ({
      id: flow.id,
      name: String(flow.businessObject?.name ?? ""),
    }));
  }, []);

  const getFlowElement = useCallback((flowId: string) => {
    const registry = modelerRef.current?.get("elementRegistry") as
      | { get: (id: string) => { businessObject?: unknown } | undefined }
      | undefined;
    return registry?.get(flowId)?.businessObject;
  }, []);

  /**
   * Elements currently marked, so the next call can clear exactly what it set rather than
   * sweeping every element — diagram-js has no "remove this class everywhere" operation,
   * and clearing by iterating the whole registry gets slow on a large model.
   */
  const markedRef = useRef<string[]>([]);

  const markProblems = useCallback(
    (marks: Array<{ elementId: string; severity: "error" | "warning" }>) => {
      const modeler = modelerRef.current;
      if (!modeler) return;
      const canvas = modeler.get("canvas") as
        | { addMarker: (id: string, cls: string) => void; removeMarker: (id: string, cls: string) => void }
        | undefined;
      const registry = modeler.get("elementRegistry") as
        | { get: (id: string) => unknown }
        | undefined;
      if (!canvas || !registry) return;

      for (const id of markedRef.current) {
        // Guard on existence: an element carrying a problem may since have been deleted,
        // and removing a marker from a missing element throws.
        if (registry.get(id)) {
          canvas.removeMarker(id, "tf-problem--error");
          canvas.removeMarker(id, "tf-problem--warning");
        }
      }

      const applied: string[] = [];
      for (const mark of marks) {
        if (!registry.get(mark.elementId)) continue;
        canvas.addMarker(mark.elementId, `tf-problem--${mark.severity}`);
        applied.push(mark.elementId);
      }
      markedRef.current = applied;
    },
    [],
  );

  /**
   * Subscribes to modelling changes.
   *
   * `commandStack.changed` rather than `element.changed`: it fires once per command, so a
   * multi-element edit re-validates once rather than per element.
   */
  const onModelChanged = useCallback((listener: () => void) => {
    const modeler = modelerRef.current;
    if (!modeler) return () => {};
    modeler.on("commandStack.changed", listener);
    return () => {
      (modeler as unknown as { off: (event: string, fn: () => void) => void }).off(
        "commandStack.changed",
        listener,
      );
    };
  }, []);

  const replaceElementType = useCallback((element: BpmnElement, type: string) => {
    const replace = modelerRef.current?.get("bpmnReplace") as
      | { replaceElement: (element: unknown, target: { type: string }) => unknown }
      | undefined;
    // The registry entry, not the businessObject the panel holds: bpmnReplace works on
    // diagram elements.
    const registry = modelerRef.current?.get("elementRegistry") as
      | { get: (id: string) => unknown }
      | undefined;
    const target = registry?.get(element.id);
    if (!replace || !target) return;
    replace.replaceElement(target, { type });
  }, []);

  const updateModdleProperties = useCallback(
    (element: BpmnElement, moddleElement: unknown, properties: Record<string, unknown>) => {
      const modeling = modelerRef.current?.get("modeling") as
        | {
            updateModdleProperties: (
              element: unknown,
              moddleElement: unknown,
              properties: Record<string, unknown>,
            ) => void;
          }
        | undefined;
      const registry = modelerRef.current?.get("elementRegistry") as
        | { get: (id: string) => unknown }
        | undefined;
      const target = registry?.get(element.id);
      if (!modeling || !target) return;
      modeling.updateModdleProperties(target, moddleElement, properties);
    },
    [],
  );

  const ensureNamespace = useCallback(
    (prefix: string, uri: string) => {
      const definitions = getDefinitions();
      if (!definitions) return;
      const attributes = (definitions.$attrs as Record<string, unknown> | undefined) ?? {};
      const key = `xmlns:${prefix}`;
      if (attributes[key]) return;
      // Written straight onto $attrs rather than through `modeling`: this is a namespace
      // declaration, not a modelling change, and it should not land on the undo stack as
      // a separate step from the edit that needed it.
      definitions.$attrs = { ...attributes, [key]: uri };
    },
    [getDefinitions],
  );

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
    revision,
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
    getRootElements,
    addRootElement,
    getOutgoingFlows,
    getFlowElement,
    ensureNamespace,
    replaceElementType,
    updateModdleProperties,
    markProblems,
    onModelChanged,
  };
}
