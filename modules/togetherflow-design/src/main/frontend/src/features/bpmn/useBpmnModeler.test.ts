/**
 * Two behaviours of the modeller hook that nothing else can catch.
 *
 * Both are invisible by inspection and both silently disable large parts of the
 * properties panel, so they are pinned here rather than trusted to review:
 *
 * 1. bpmn-js never puts the diagram root in a selection — clicking empty canvas *clears*
 *    it. Without a fallback the `bpmn:Process` is reachable by nothing, and every
 *    process-level property is uneditable in a diagram without pools.
 * 2. bpmn-js mutates business objects in place. An edit therefore changes no React state,
 *    so the panel does not re-render and its conditional sections stay stale — pick an
 *    external-worker task type and the Topic field never appears.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

/** Handlers bpmn-js would have registered, so the test can fire the same events. */
const handlers = new Map<string, Array<(event: unknown) => void>>();
const ROOT = { id: "Process_1", type: "bpmn:Process", businessObject: { $type: "bpmn:Process", id: "Process_1" } };

const services: Record<string, unknown> = {
  canvas: { getRootElement: () => ROOT, zoom: () => undefined },
  commandStack: { canUndo: () => true, canRedo: () => false, undo: vi.fn(), redo: vi.fn() },
  moddle: { create: (type: string, props: Record<string, unknown>) => ({ $type: type, ...props }) },
  elementRegistry: { get: vi.fn() },
  modeling: { updateProperties: vi.fn() },
};

vi.mock("bpmn-js/lib/Modeler", () => ({
  default: class FakeModeler {
    on(event: string, handler: (event: unknown) => void) {
      const existing = handlers.get(event) ?? [];
      handlers.set(event, [...existing, handler]);
    }
    get(name: string) {
      return services[name];
    }
    importXML() {
      return Promise.resolve({ warnings: [] });
    }
    destroy() {}
  },
}));

vi.mock("diagram-js-minimap", () => ({ default: {} }));

function emit(event: string, payload: unknown) {
  for (const handler of handlers.get(event) ?? []) handler(payload);
}

/**
 * Mounts the hook with a container attached before the XML arrives.
 *
 * That ordering matters and is not incidental: in the real editor React invokes the
 * callback ref during commit, before effects, so the modeller exists by the time the
 * import effect runs. `renderHook` renders no DOM, so the ref has to be attached by hand
 * and the XML supplied afterwards to reproduce the same order.
 */
async function mountModeler() {
  const { useBpmnModeler } = await import("./useBpmnModeler");
  const view = renderHook(({ xml }: { xml: string | null }) => useBpmnModeler(xml), {
    initialProps: { xml: null as string | null },
  });
  act(() => {
    view.result.current.containerRef(document.createElement("div"));
  });
  view.rerender({ xml: "<definitions/>" });
  return view;
}

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
});

describe("useBpmnModeler selection", () => {
  it("falls back to the diagram root when nothing is selected", async () => {
    const view = await mountModeler();
    await waitFor(() => expect(view.result.current.ready).toBe(true));

    // What bpmn-js sends when the user clicks empty canvas.
    act(() => emit("selection.changed", { newSelection: [] }));

    // Not null: the process has to stay editable, or isExecutable and the candidate
    // starters can never be reached.
    expect(view.result.current.selection?.id).toBe("Process_1");
  });

  it("selects the root on import, rather than opening on an empty panel", async () => {
    const view = await mountModeler();
    await waitFor(() => expect(view.result.current.selection?.id).toBe("Process_1"));
  });

  it("keeps a single selected element", async () => {
    const view = await mountModeler();
    await waitFor(() => expect(view.result.current.ready).toBe(true));

    const task = { id: "Task_1", type: "bpmn:UserTask", businessObject: { $type: "bpmn:UserTask", id: "Task_1" } };
    act(() => emit("selection.changed", { newSelection: [task] }));
    expect(view.result.current.selection?.id).toBe("Task_1");

    // More than one selected is not something the panel can edit, so it falls back too.
    act(() => emit("selection.changed", { newSelection: [task, ROOT] }));
    expect(view.result.current.selection?.id).toBe("Process_1");
  });
});

describe("useBpmnModeler revision", () => {
  it("advances when the edited element changes, so the panel re-reads it", async () => {
    const view = await mountModeler();
    await waitFor(() => expect(view.result.current.ready).toBe(true));

    const task = { id: "Task_1", type: "bpmn:ServiceTask", businessObject: { $type: "bpmn:ServiceTask", id: "Task_1" } };
    act(() => emit("selection.changed", { newSelection: [task] }));
    const before = view.result.current.revision;

    /*
     * bpmn-js mutates in place and fires this. Nothing else about React's state changed,
     * which is exactly why the counter has to exist.
     */
    act(() => emit("element.changed", { element: task }));

    expect(view.result.current.revision).toBeGreaterThan(before);
  });

  it("ignores changes to elements that are not on screen", async () => {
    const view = await mountModeler();
    await waitFor(() => expect(view.result.current.ready).toBe(true));

    const task = { id: "Task_1", type: "bpmn:UserTask", businessObject: { $type: "bpmn:UserTask", id: "Task_1" } };
    act(() => emit("selection.changed", { newSelection: [task] }));
    const before = view.result.current.revision;

    // A multi-element command would otherwise re-render the panel once per element.
    act(() => emit("element.changed", { element: { id: "Somewhere_Else" } }));

    expect(view.result.current.revision).toBe(before);
  });
});
