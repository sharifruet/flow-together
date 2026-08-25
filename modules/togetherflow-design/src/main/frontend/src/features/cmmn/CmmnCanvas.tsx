/**
 * CMMN drawing surface (REQUIREMENTS.md §7.4.3).
 *
 * Hand-built SVG rather than a canvas library — see docs/ui/adr/0009-cmmn-canvas.md.
 * Handles selection (single, additive and marquee), dragging, resizing, drop-target
 * reparenting, zoom and pan, and drawing entry criteria between elements; the editor
 * screen owns the model and undo history.
 *
 * CMMN shape conventions follow the OMG notation: the case plan model and stages are
 * rectangles with angled top corners, tasks are rounded rectangles with a type icon,
 * milestones are stadium-shaped, event listeners are circles, and sentries are small
 * diamonds on the element border (hollow for entry, filled for exit).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONTAINER_TYPES,
  containerAt,
  type Bounds,
  type CmmnCase,
  type CmmnElement,
  type CmmnElementType,
} from "./cmmnModel";

const GRID = 10;
const MIN_SIZE = { width: 60, height: 40 };

export interface CmmnCanvasProps {
  model: CmmnCase;
  /** The element whose properties are shown; always the last one selected. */
  selectedId: string | null;
  /** Everything selected, for multi-element move and delete. */
  selectedIds?: string[];
  disabled?: boolean;
  /** `additive` is a shift-click or marquee, which extends the selection. */
  onSelect: (planItemId: string | null, options?: { additive?: boolean }) => void;
  /** Replaces the whole selection, used by the marquee. */
  onSelectMany?: (planItemIds: string[]) => void;
  /** Externally driven viewport, so the editor's toolbar can zoom and fit. */
  viewport?: Viewport;
  onViewportChange?: (viewport: Viewport) => void;
  /** Emitted once per gesture, not per pointer move, so undo steps stay meaningful. */
  onCommit: (model: CmmnCase) => void;
  /** Live preview during a drag; not pushed onto the undo stack. */
  onPreview: (model: CmmnCase) => void;
}

/** Where the diagram is looked at from: top-left corner in diagram units, plus scale. */
export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

type Gesture =
  | {
      kind: "move";
      planItemId: string;
      startX: number;
      startY: number;
      origin: Bounds;
      /** Everything dragged together, including the primary element. */
      alsoMoving: string[];
    }
  | { kind: "resize"; planItemId: string | null; startX: number; startY: number; origin: Bounds }
  | { kind: "pan"; startX: number; startY: number; origin: Viewport }
  | { kind: "marquee"; startX: number; startY: number; currentX: number; currentY: number }
  | { kind: "connect"; sourceId: string; startX: number; startY: number; currentX: number; currentY: number };

export function CmmnCanvas({
  model,
  selectedId,
  selectedIds,
  disabled = false,
  onSelect,
  onSelectMany,
  viewport = DEFAULT_VIEWPORT,
  onViewportChange,
  onCommit,
  onPreview,
}: CmmnCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const selection = selectedIds ?? (selectedId ? [selectedId] : []);
  const selectionSet = new Set(selection);
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  /**
   * Client coordinates to diagram coordinates.
   *
   * Must account for the viewport: with the SVG zoomed, a pixel on screen is no longer
   * a unit in the diagram, and dragging would drift from the pointer at any scale but 1.
   */
  const toDiagram = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: viewport.x + (event.clientX - rect.left) / viewport.scale,
        y: viewport.y + (event.clientY - rect.top) / viewport.scale,
      };
    },
    [viewport],
  );

  // Pointer move/up live on the window so a fast drag that leaves the SVG still tracks.
  useEffect(() => {
    if (!gesture) return;

    const onMove = (event: PointerEvent) => {
      const point = toDiagram(event);

      if (gesture.kind === "pan") {
        // Panning moves the viewport, not the model, so it never touches undo.
        onViewportChange?.({
          ...gesture.origin,
          x: gesture.origin.x - (point.x - gesture.startX),
          y: gesture.origin.y - (point.y - gesture.startY),
        });
        return;
      }
      if (gesture.kind === "marquee" || gesture.kind === "connect") {
        setGesture({ ...gesture, currentX: point.x, currentY: point.y });
        return;
      }

      const dx = point.x - gesture.startX;
      const dy = point.y - gesture.startY;
      onPreview(applyGesture(modelRef.current, gesture, dx, dy));
    };

    const onUp = (event: PointerEvent) => {
      const point = toDiagram(event);

      if (gesture.kind === "pan") {
        setGesture(null);
        return;
      }

      if (gesture.kind === "marquee") {
        const box = normalise(gesture.startX, gesture.startY, point.x, point.y);
        // A marquee selects what it fully contains; partial overlap would make it
        // impossible to select a small element sitting inside a stage.
        const inside = modelRef.current.elements
          .filter((element) => contains(box, element.bounds))
          .map((element) => element.planItemId);
        setGesture(null);
        if (inside.length > 0) onSelectMany?.(inside);
        else onSelect(null);
        return;
      }

      if (gesture.kind === "connect") {
        const target = elementAtPoint(modelRef.current, point, gesture.sourceId);
        setGesture(null);
        if (target) onCommit(connectElements(modelRef.current, gesture.sourceId, target));
        return;
      }

      const dx = point.x - gesture.startX;
      const dy = point.y - gesture.startY;
      let next = applyGesture(modelRef.current, gesture, dx, dy);

      // Reparent on drop: whichever stage now contains the element's centre owns it.
      if (gesture.kind === "move") {
        const moved = next.elements.find((el) => el.planItemId === gesture.planItemId);
        if (moved) {
          const centre = {
            x: moved.bounds.x + moved.bounds.width / 2,
            y: moved.bounds.y + moved.bounds.height / 2,
          };
          const parentId = containerAt(next, centre, moved.planItemId);
          if (parentId !== moved.parentId) {
            next = {
              ...next,
              elements: next.elements.map((el) =>
                el.planItemId === moved.planItemId ? { ...el, parentId } : el,
              ),
            };
          }
        }
      }

      setGesture(null);
      onCommit(next);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gesture, toDiagram, onPreview, onCommit, onSelect, onSelectMany, onViewportChange]);

  const startMove = (event: React.PointerEvent, element: CmmnElement) => {
    if (disabled) return;
    event.stopPropagation();
    const additive = event.shiftKey;
    onSelect(element.planItemId, { additive });

    // Dragging one of several selected elements moves them all; dragging an unselected
    // one selects it first, so a drag never moves something the user didn't grab.
    const wasSelected = selectionSet.has(element.planItemId);
    const alsoMoving =
      wasSelected && selection.length > 1 && !additive ? selection : [element.planItemId];

    const point = toDiagram(event);
    setGesture({
      kind: "move",
      planItemId: element.planItemId,
      startX: point.x,
      startY: point.y,
      origin: element.bounds,
      alsoMoving,
    });
  };

  const startConnect = (event: React.PointerEvent, element: CmmnElement) => {
    if (disabled) return;
    event.stopPropagation();
    const point = toDiagram(event);
    setGesture({
      kind: "connect",
      sourceId: element.planItemId,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  };

  const startResize = (event: React.PointerEvent, planItemId: string | null, origin: Bounds) => {
    if (disabled) return;
    event.stopPropagation();
    const point = toDiagram(event);
    setGesture({ kind: "resize", planItemId, startX: point.x, startY: point.y, origin });
  };

  const plan = model.planModelBounds;
  const width = Math.max(plan.x + plan.width + 80, 900);
  const height = Math.max(plan.y + plan.height + 80, 560);

  // Stages render before their children so nesting reads correctly without z-index.
  const ordered = [...model.elements].sort((a, b) => depth(model, a) - depth(model, b));

  return (
    <svg
      ref={svgRef}
      className="tf-cmmn"
      width={width}
      height={height}
      viewBox={`${viewport.x} ${viewport.y} ${width / viewport.scale} ${height / viewport.scale}`}
      role="application"
      aria-label="Case diagram"
      onWheel={(event) => {
        if (!onViewportChange) return;
        // Ctrl/Cmd+wheel is the platform gesture for zoom; a plain wheel scrolls.
        event.preventDefault();
        const point = toDiagram(event);
        const factor = event.ctrlKey || event.metaKey ? 1.06 : 1.03;
        const next = clampScale(
          event.deltaY < 0 ? viewport.scale * factor : viewport.scale / factor,
        );
        // Keep the point under the cursor fixed, which is what makes zoom feel direct.
        onViewportChange({
          scale: next,
          x: point.x - (point.x - viewport.x) * (viewport.scale / next),
          y: point.y - (point.y - viewport.y) * (viewport.scale / next),
        });
      }}
      onPointerDown={(event) => {
        // Middle button, space-drag and Alt-drag all pan; a plain background drag
        // draws a marquee, and a plain background click clears the selection.
        const panning = event.button === 1 || event.altKey;
        const point = toDiagram(event);
        if (panning && onViewportChange) {
          setGesture({ kind: "pan", startX: point.x, startY: point.y, origin: viewport });
          return;
        }
        if (!disabled && onSelectMany) {
          setGesture({
            kind: "marquee",
            startX: point.x,
            startY: point.y,
            currentX: point.x,
            currentY: point.y,
          });
          return;
        }
        onSelect(null);
      }}
    >
      <defs>
        <pattern id="tf-grid" width={GRID * 4} height={GRID * 4} patternUnits="userSpaceOnUse">
          <path
            d={`M ${GRID * 4} 0 L 0 0 0 ${GRID * 4}`}
            fill="none"
            stroke="var(--tf-border)"
            strokeWidth="0.5"
          />
        </pattern>
        <marker
          id="tf-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--tf-text-muted)" />
        </marker>
      </defs>
      <rect
        x={viewport.x}
        y={viewport.y}
        width={width / viewport.scale}
        height={height / viewport.scale}
        fill="url(#tf-grid)"
      />

      {/* Case plan model: rectangle with angled top corners, per CMMN notation. */}
      <g
        className={selectedId === model.planModelId ? "tf-cmmn__shape is-selected" : "tf-cmmn__shape"}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(model.planModelId);
        }}
      >
        <path d={planModelPath(plan)} className="tf-cmmn__plan" />
        <text x={plan.x + 12} y={plan.y + 22} className="tf-cmmn__plan-label">
          {model.planModelName}
        </text>
      </g>
      {!disabled ? (
        <rect
          className="tf-cmmn__handle"
          x={plan.x + plan.width - 6}
          y={plan.y + plan.height - 6}
          width={12}
          height={12}
          onPointerDown={(event) => startResize(event, null, plan)}
        />
      ) : null}

      {/* Entry criteria, drawn under the shapes so they never obscure a label. */}
      {model.elements.flatMap((element) =>
        element.entrySentries
          .filter((sentry) => sentry.sourceRef)
          .map((sentry) => {
            const source = model.elements.find((e) => e.planItemId === sentry.sourceRef);
            if (!source) return null;
            return (
              <path
                key={`${element.planItemId}-${sentry.id}`}
                className="tf-cmmn__connection"
                d={connectionPath(source.bounds, element.bounds)}
                markerEnd="url(#tf-arrow)"
              />
            );
          }),
      )}

      {ordered.map((element) => (
        <ElementShape
          key={element.planItemId}
          element={element}
          selected={selectionSet.has(element.planItemId)}
          primary={selectedId === element.planItemId}
          disabled={disabled}
          onPointerDown={(event) => startMove(event, element)}
          onResize={(event) => startResize(event, element.planItemId, element.bounds)}
          onConnect={(event) => startConnect(event, element)}
        />
      ))}

      {gesture?.kind === "marquee" ? (
        <rect
          className="tf-cmmn__marquee"
          {...toRect(normalise(gesture.startX, gesture.startY, gesture.currentX, gesture.currentY))}
        />
      ) : null}

      {gesture?.kind === "connect" ? (
        <line
          className="tf-cmmn__connection tf-cmmn__connection--pending"
          x1={gesture.startX}
          y1={gesture.startY}
          x2={gesture.currentX}
          y2={gesture.currentY}
          markerEnd="url(#tf-arrow)"
        />
      ) : null}
    </svg>
  );
}

function ElementShape({
  element,
  selected,
  primary,
  disabled,
  onPointerDown,
  onConnect,
  onResize,
}: {
  element: CmmnElement;
  selected: boolean;
  /** The one whose properties are shown; only it gets the resize and connect handles. */
  primary: boolean;
  onConnect: (event: React.PointerEvent) => void;
  disabled: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onResize: (event: React.PointerEvent) => void;
}) {
  const { bounds: b, type } = element;
  const isContainer = CONTAINER_TYPES.has(type);
  const isListener = type.endsWith("EventListener");

  return (
    <g
      className={["tf-cmmn__shape", selected ? "is-selected" : ""].filter(Boolean).join(" ")}
      onPointerDown={onPointerDown}
      role="button"
      aria-label={`${element.name || type} (${type})`}
      tabIndex={0}
    >
      {isContainer ? (
        <path d={planModelPath(b)} className="tf-cmmn__stage" />
      ) : type === "milestone" ? (
        <rect
          x={b.x}
          y={b.y}
          width={b.width}
          height={b.height}
          rx={b.height / 2}
          className="tf-cmmn__milestone"
        />
      ) : isListener ? (
        <circle
          cx={b.x + b.width / 2}
          cy={b.y + b.height / 2}
          r={Math.min(b.width, b.height) / 2}
          className="tf-cmmn__listener"
        />
      ) : (
        <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={8} className="tf-cmmn__task" />
      )}

      {!isListener ? (
        <text
          x={b.x + b.width / 2}
          y={isContainer ? b.y + 22 : b.y + b.height / 2 + 4}
          className={isContainer ? "tf-cmmn__stage-label" : "tf-cmmn__label"}
        >
          {truncate(element.name || "", isContainer ? 28 : 18)}
        </text>
      ) : null}

      {/* Type icon in the top-left, mirroring how CMMN marks task kinds. */}
      {!isContainer && !isListener ? (
        <text x={b.x + 8} y={b.y + 18} className="tf-cmmn__icon">
          {ICONS[type]}
        </text>
      ) : null}
      {isListener ? (
        <text
          x={b.x + b.width / 2}
          y={b.y + b.height / 2 + 5}
          className="tf-cmmn__icon tf-cmmn__icon--centred"
        >
          {ICONS[type]}
        </text>
      ) : null}

      {/* Sentries sit on the border: hollow diamond = entry, filled = exit. */}
      {element.entrySentries.map((sentry, index) => (
        <path
          key={sentry.id}
          d={diamondPath(b.x, b.y + 20 + index * 18)}
          className="tf-cmmn__sentry"
        />
      ))}
      {element.exitSentries.map((sentry, index) => (
        <path
          key={sentry.id}
          d={diamondPath(b.x + b.width, b.y + 20 + index * 18)}
          className="tf-cmmn__sentry tf-cmmn__sentry--exit"
        />
      ))}

      {primary && !disabled ? (
        <circle
          className="tf-cmmn__connector"
          cx={element.bounds.x + element.bounds.width}
          cy={element.bounds.y + element.bounds.height / 2}
          r={5}
          onPointerDown={onConnect}
        >
          <title>Drag to another element to add an entry criterion</title>
        </circle>
      ) : null}

      {primary && !disabled ? (
        <rect
          className="tf-cmmn__handle"
          x={b.x + b.width - 5}
          y={b.y + b.height - 5}
          width={10}
          height={10}
          onPointerDown={onResize}
        />
      ) : null}
    </g>
  );
}

const ICONS: Record<CmmnElementType, string> = {
  humanTask: "👤",
  processTask: "⚙",
  caseTask: "▣",
  decisionTask: "▤",
  serviceTask: "⚙",
  milestone: "",
  stage: "",
  timerEventListener: "⏱",
  userEventListener: "◉",
};

/** CMMN draws the plan model and stages with the top corners cut. */
function planModelPath(b: Bounds): string {
  const cut = 14;
  return [
    `M ${b.x + cut} ${b.y}`,
    `L ${b.x + b.width - cut} ${b.y}`,
    `L ${b.x + b.width} ${b.y + cut}`,
    `L ${b.x + b.width} ${b.y + b.height}`,
    `L ${b.x} ${b.y + b.height}`,
    `L ${b.x} ${b.y + cut}`,
    "Z",
  ].join(" ");
}

function diamondPath(cx: number, cy: number): string {
  const r = 7;
  return `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
}

function depth(model: CmmnCase, element: CmmnElement): number {
  let depthCount = 0;
  let current: CmmnElement | undefined = element;
  while (current?.parentId && current.parentId !== model.planModelId) {
    const parentId: string = current.parentId;
    current = model.elements.find((el) => el.planItemId === parentId);
    depthCount += 1;
    if (depthCount > 20) break;
  }
  return depthCount;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

/** The gestures that change the model. Pan, marquee and connect are handled elsewhere. */
export type ModelGesture = Extract<Gesture, { kind: "move" } | { kind: "resize" }>;

export function applyGesture(
  model: CmmnCase,
  gesture: ModelGesture,
  dx: number,
  dy: number,
): CmmnCase {
  if (gesture.kind === "resize" && gesture.planItemId === null) {
    return {
      ...model,
      planModelBounds: {
        ...model.planModelBounds,
        width: Math.max(200, snap(gesture.origin.width + dx)),
        height: Math.max(160, snap(gesture.origin.height + dy)),
      },
    };
  }

  const targetId = gesture.planItemId;
  if (!targetId) return model;

  if (gesture.kind === "resize") {
    return {
      ...model,
      elements: model.elements.map((element) =>
        element.planItemId === targetId
          ? {
              ...element,
              bounds: {
                ...element.bounds,
                width: Math.max(MIN_SIZE.width, snap(gesture.origin.width + dx)),
                height: Math.max(MIN_SIZE.height, snap(gesture.origin.height + dy)),
              },
            }
          : element,
      ),
    };
  }

  // The primary element snaps to the grid; everything moving with it — the rest of the
  // selection, plus any stage's descendants — shifts by the same amount, so relative
  // positions are preserved exactly rather than each snapping independently.
  const offsetX = snap(gesture.origin.x + dx) - gesture.origin.x;
  const offsetY = snap(gesture.origin.y + dy) - gesture.origin.y;

  const carried = new Set<string>(gesture.alsoMoving);
  for (const id of gesture.alsoMoving) {
    for (const descendant of descendantsOf(model, id)) carried.add(descendant);
  }

  return {
    ...model,
    elements: model.elements.map((element) =>
      carried.has(element.planItemId)
        ? {
            ...element,
            bounds: {
              ...element.bounds,
              x: element.bounds.x + offsetX,
              y: element.bounds.y + offsetY,
            },
          }
        : element,
    ),
  };
}

function descendantsOf(model: CmmnCase, planItemId: string): Set<string> {
  const found = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const element of model.elements) {
      if (
        element.parentId &&
        (element.parentId === planItemId || found.has(element.parentId)) &&
        !found.has(element.planItemId)
      ) {
        found.add(element.planItemId);
        grew = true;
      }
    }
  }
  return found;
}

/* ── Geometry and connection helpers ─────────────────────────────────────── */

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function normalise(x1: number, y1: number, x2: number, y2: number): Bounds {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function toRect(bounds: Bounds) {
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

/** True when `inner` lies entirely inside `outer`. */
export function contains(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * The topmost element under a point, ignoring `exceptId`.
 *
 * Iterates from the end so the element drawn last — the one visually on top — wins,
 * which matters when a task sits inside a stage.
 */
export function elementAtPoint(
  model: CmmnCase,
  point: { x: number; y: number },
  exceptId?: string,
): string | undefined {
  for (let i = model.elements.length - 1; i >= 0; i -= 1) {
    const element = model.elements[i];
    if (element.planItemId === exceptId) continue;
    const b = element.bounds;
    if (point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height) {
      return element.planItemId;
    }
  }
  return undefined;
}

/**
 * Adds an entry criterion on `targetId` that fires when `sourceId` completes.
 *
 * This is what "drawing a connection" means in CMMN: unlike BPMN there is no sequence
 * flow, so a line on the diagram is really a sentry with a `planItemOnPart`. Drawing the
 * same connection twice is a no-op rather than stacking duplicate sentries.
 */
export function connectElements(model: CmmnCase, sourceId: string, targetId: string): CmmnCase {
  if (sourceId === targetId) return model;
  const target = model.elements.find((element) => element.planItemId === targetId);
  if (!target) return model;
  if (target.entrySentries.some((sentry) => sentry.sourceRef === sourceId)) return model;

  return {
    ...model,
    elements: model.elements.map((element) =>
      element.planItemId === targetId
        ? {
            ...element,
            entrySentries: [
              ...element.entrySentries,
              {
                id: `${targetId}_on_${sourceId}`,
                sourceRef: sourceId,
                standardEvent: "complete",
              },
            ],
          }
        : element,
    ),
  };
}

/** An orthogonal-ish path from the right edge of `from` to the left edge of `to`. */
export function connectionPath(from: Bounds, to: Bounds): string {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const midX = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}
