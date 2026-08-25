/**
 * CMMN drawing surface (REQUIREMENTS.md §7.4.3).
 *
 * Hand-built SVG rather than a canvas library — see docs/ui/adr/0009-cmmn-canvas.md.
 * Handles selection, dragging, resizing and drop-target reparenting; the editor screen
 * owns the model and undo history.
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
  selectedId: string | null;
  disabled?: boolean;
  onSelect: (planItemId: string | null) => void;
  /** Emitted once per gesture, not per pointer move, so undo steps stay meaningful. */
  onCommit: (model: CmmnCase) => void;
  /** Live preview during a drag; not pushed onto the undo stack. */
  onPreview: (model: CmmnCase) => void;
}

type Gesture =
  | { kind: "move"; planItemId: string; startX: number; startY: number; origin: Bounds }
  | { kind: "resize"; planItemId: string | null; startX: number; startY: number; origin: Bounds };

export function CmmnCanvas({
  model,
  selectedId,
  disabled = false,
  onSelect,
  onCommit,
  onPreview,
}: CmmnCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const toDiagram = useCallback((event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  // Pointer move/up live on the window so a fast drag that leaves the SVG still tracks.
  useEffect(() => {
    if (!gesture) return;

    const onMove = (event: PointerEvent) => {
      const point = toDiagram(event);
      const dx = point.x - gesture.startX;
      const dy = point.y - gesture.startY;
      onPreview(applyGesture(modelRef.current, gesture, dx, dy));
    };

    const onUp = (event: PointerEvent) => {
      const point = toDiagram(event);
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
  }, [gesture, toDiagram, onPreview, onCommit]);

  const startMove = (event: React.PointerEvent, element: CmmnElement) => {
    if (disabled) return;
    event.stopPropagation();
    onSelect(element.planItemId);
    const point = toDiagram(event);
    setGesture({
      kind: "move",
      planItemId: element.planItemId,
      startX: point.x,
      startY: point.y,
      origin: element.bounds,
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
      viewBox={`0 0 ${width} ${height}`}
      role="application"
      aria-label="Case diagram"
      onPointerDown={() => onSelect(null)}
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
      </defs>
      <rect width={width} height={height} fill="url(#tf-grid)" />

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

      {ordered.map((element) => (
        <ElementShape
          key={element.planItemId}
          element={element}
          selected={selectedId === element.planItemId}
          disabled={disabled}
          onPointerDown={(event) => startMove(event, element)}
          onResize={(event) => startResize(event, element.planItemId, element.bounds)}
        />
      ))}
    </svg>
  );
}

function ElementShape({
  element,
  selected,
  disabled,
  onPointerDown,
  onResize,
}: {
  element: CmmnElement;
  selected: boolean;
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

      {selected && !disabled ? (
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

export function applyGesture(model: CmmnCase, gesture: Gesture, dx: number, dy: number): CmmnCase {
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

  // Moving a stage carries its descendants, otherwise children are left behind.
  const carried =
    gesture.kind === "move" ? descendantsOf(model, targetId) : new Set<string>();

  return {
    ...model,
    elements: model.elements.map((element) => {
      if (element.planItemId === targetId) {
        if (gesture.kind === "move") {
          return {
            ...element,
            bounds: {
              ...element.bounds,
              x: snap(gesture.origin.x + dx),
              y: snap(gesture.origin.y + dy),
            },
          };
        }
        return {
          ...element,
          bounds: {
            ...element.bounds,
            width: Math.max(MIN_SIZE.width, snap(gesture.origin.width + dx)),
            height: Math.max(MIN_SIZE.height, snap(gesture.origin.height + dy)),
          },
        };
      }

      if (carried.has(element.planItemId)) {
        return {
          ...element,
          bounds: {
            ...element.bounds,
            x: snap(element.bounds.x + (snap(gesture.origin.x + dx) - gesture.origin.x)),
            y: snap(element.bounds.y + (snap(gesture.origin.y + dy) - gesture.origin.y)),
          },
        };
      }

      return element;
    }),
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
