/**
 * Positions for a case that arrived without a diagram.
 *
 * CMMN files are routinely hand-written, and CMMNDI is optional — the engine deploys a
 * case with no diagram interchange at all quite happily. Before this, such a file opened as
 * every element stacked at the same coordinate: a single visible shape with nineteen hidden
 * underneath it, which reads as "this case is empty" rather than "this case has no
 * drawing". OPERATIONS.md listed it as a known non-fault, which it was, and also a dead end,
 * which it should not have been.
 *
 * **What this is not.** There is no flow to follow. A CMMN plan model is a bag of plan items
 * whose ordering comes from sentries, and a sentry graph is frequently cyclic — an exit
 * criterion pointing back at something that entered earlier is ordinary. So no layered or
 * force-directed algorithm applies. What produces a readable result is packing: rows inside
 * each container, containers sized to hold what is in them, laid out bottom-up so a stage
 * knows how big it has to be before it is placed.
 *
 * The result is a starting point a person then rearranges, and it is saved like any other
 * edit — so a case only goes through this once.
 */

import { CONTAINER_TYPES, DEFAULT_SIZES, type Bounds, type CmmnCase, type CmmnElement } from "./cmmnModel";

/** Room inside a container: more at the top, because that is where its name is drawn. */
const PADDING = { left: 24, right: 24, top: 44, bottom: 24 };

/** Space between siblings. */
const GAP = 28;

/** Rows wrap at this many siblings. Three keeps a stage roughly as wide as it is tall. */
const COLUMNS = 3;

/** Where the case plan model sits on the canvas. */
const ORIGIN = { x: 60, y: 60 };

/**
 * The same case with every element positioned.
 *
 * Returns the model unchanged when there is nothing to lay out, so a caller can apply it
 * unconditionally.
 */
export function autoLayout(model: CmmnCase): CmmnCase {
  if (model.elements.length === 0) return model;

  const childrenOf = new Map<string, CmmnElement[]>();
  for (const element of model.elements) {
    const parent = element.parentId ?? model.planModelId;
    const siblings = childrenOf.get(parent);
    if (siblings) siblings.push(element);
    else childrenOf.set(parent, [element]);
  }

  const sizes = new Map<string, { width: number; height: number }>();
  measure(model.planModelId, childrenOf, sizes);

  const bounds = new Map<string, Bounds>();
  place(model.planModelId, ORIGIN.x, ORIGIN.y, childrenOf, sizes, bounds);

  return {
    ...model,
    planModelBounds: bounds.get(model.planModelId) ?? model.planModelBounds,
    elements: model.elements.map((element) => ({
      ...element,
      bounds: bounds.get(element.planItemId) ?? element.bounds,
    })),
  };
}

/**
 * How big each element has to be, deepest first.
 *
 * A container's size depends on its contents, so children are measured before their parent
 * — the whole reason this is a separate pass from placing.
 */
function measure(
  id: string,
  childrenOf: Map<string, CmmnElement[]>,
  sizes: Map<string, { width: number; height: number }>,
): { width: number; height: number } {
  const children = childrenOf.get(id) ?? [];
  for (const child of children) {
    const size = CONTAINER_TYPES.has(child.type)
      ? measure(child.planItemId, childrenOf, sizes)
      : DEFAULT_SIZES[child.type];
    sizes.set(child.planItemId, size);
  }

  const size = children.length === 0 ? emptyContainer() : packedSize(children, sizes);
  sizes.set(id, size);
  return size;
}

/** A stage with nothing in it still needs to look like somewhere things go. */
function emptyContainer(): { width: number; height: number } {
  return { width: 240, height: 120 };
}

/** The box that holds these children once they are packed into rows. */
function packedSize(
  children: CmmnElement[],
  sizes: Map<string, { width: number; height: number }>,
): { width: number; height: number } {
  let widest = 0;
  let total = 0;

  for (const row of rows(children)) {
    const rowWidth = row.reduce((sum, child) => sum + sizeOf(child, sizes).width, 0)
      + GAP * (row.length - 1);
    const rowHeight = Math.max(...row.map((child) => sizeOf(child, sizes).height));
    widest = Math.max(widest, rowWidth);
    total += rowHeight + GAP;
  }

  return {
    width: widest + PADDING.left + PADDING.right,
    height: total - GAP + PADDING.top + PADDING.bottom,
  };
}

/**
 * Assigns coordinates, outermost first — the opposite order from measuring, because a
 * child's position is relative to a parent that must already have one.
 */
function place(
  id: string,
  x: number,
  y: number,
  childrenOf: Map<string, CmmnElement[]>,
  sizes: Map<string, { width: number; height: number }>,
  bounds: Map<string, Bounds>,
): void {
  const size = sizes.get(id) ?? emptyContainer();
  bounds.set(id, { x, y, ...size });

  let rowTop = y + PADDING.top;
  for (const row of rows(childrenOf.get(id) ?? [])) {
    let left = x + PADDING.left;
    for (const child of row) {
      const childSize = sizeOf(child, sizes);
      if (CONTAINER_TYPES.has(child.type)) {
        place(child.planItemId, left, rowTop, childrenOf, sizes, bounds);
      } else {
        bounds.set(child.planItemId, { x: left, y: rowTop, ...childSize });
      }
      left += childSize.width + GAP;
    }
    rowTop += Math.max(...row.map((child) => sizeOf(child, sizes).height)) + GAP;
  }
}

/**
 * Children in rows, with containers on rows of their own.
 *
 * A stage packed beside two tasks makes both hard to read, and a stage is usually the thing
 * the reader is looking for.
 */
function rows(children: CmmnElement[]): CmmnElement[][] {
  const result: CmmnElement[][] = [];
  let current: CmmnElement[] = [];

  for (const child of children) {
    if (CONTAINER_TYPES.has(child.type)) {
      if (current.length > 0) result.push(current);
      result.push([child]);
      current = [];
      continue;
    }
    current.push(child);
    if (current.length === COLUMNS) {
      result.push(current);
      current = [];
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

function sizeOf(
  element: CmmnElement,
  sizes: Map<string, { width: number; height: number }>,
): { width: number; height: number } {
  return sizes.get(element.planItemId) ?? DEFAULT_SIZES[element.type];
}
