# ADR 0009 — A hand-built CMMN canvas

Status: Accepted
Relates to: REQUIREMENTS.md §7.4.3, §11.6; IMPLEMENTATION_PLAN.md Phase 5

## Context

Phase 5 was gated on an open question (§11.6): CMMN has no canvas library equivalent to
bpmn-js/dmn-js, so does the case modeller get a real drawing surface or a structured
non-graphical editor first?

`cmmn-js` **does** exist on npm — which contradicted the assumption recorded in
REQUIREMENTS.md — so it was checked rather than dismissed:

- Latest version **0.20.0, published 2020-05-26**. The recent "modified" timestamp on the
  registry is metadata churn, not a release.
- Six years without a release, still 0.x.
- It pins a `diagram-js` generation incompatible with the bpmn-js 18 / dmn-js 17 already in
  this repo, so adopting it would mean two conflicting copies of the same substrate.

So the assumption held, for a reason now verified rather than assumed.

## Decision

Build the canvas by hand as **inline SVG in React**, and pair it with a hand-written
CMMN 1.1 model layer (parse + serialise, including CMMNDI diagram interchange).

The format was taken from the engine's own `examples/employee-onboarding.cmmn` rather than
from the spec in the abstract, which fixed the detail most likely to be got wrong: a
`<planItem>` references a definition declared as its sibling, and **diagram shapes reference
the plan item id, not the definition id**. Getting that backwards yields a file that deploys
cleanly and then renders with no layout.

Undo history is a stack of whole-model snapshots held in React state. The models are small,
snapshots cannot drift out of sync with what is on screen the way incremental command
objects can, and keeping the stacks in state (not refs) means `canUndo`/`canRedo` derive
safely during render.

## Alternatives considered

- **cmmn-js** — rejected on the evidence above.
- **A structured, non-graphical editor** — would have shipped sooner and been genuinely
  usable, but was declined in favour of a real drawing surface.
- **A generic diagramming library** (React Flow, JointJS) — would give dragging and
  connections, but CMMN's notation (cut-corner plan model, sentries on borders, nested
  stages that carry their children) is specific enough that the shape layer would be
  hand-written anyway, on top of a dependency whose model does not match CMMN's.

## Consequences

Delivered and verified end to end in a browser against the engine's real example file:
palette, selection, drag with snapping, resize, nesting with reparent-on-drop, stage moves
carrying descendants, delete (cascading to children, and pruning sentries that pointed at
them), undo/redo, entry criteria, properties, autosave, unsaved-changes guard, save and
deploy to `/cmmn-repository/deployments`. `flowable:` attributes survive the round trip.

**Deliberately not yet built**, and the reason this is a foundation rather than a finished
modeller:

- **No connection drawing.** Entry criteria are configured in the properties panel by
  picking a source element, not by dragging a line between shapes.
- **Sentries render at fixed positions** on the element border rather than being placed and
  dragged.
- **No exit criteria in the panel** (the model layer and renderer support them).
- **No multi-select, alignment, copy/paste, or keyboard nudging.**
- **No zoom or pan** — the canvas scrolls.
- **No auto-layout** for a model that arrives without diagram information; elements fall
  back to a default position and will overlap.

These are increments on a working data layer, not rewrites.

## What deploying to a real engine corrected

The model layer's unit tests round-trip through **its own parser**, which is order-agnostic.
The engine validates against the CMMN XSD, which is not. Deploying to a running engine found
two defects that every test had passed over:

1. **Element order is significant.** The schema requires `planItem*`, then `sentry*`, then
   the plan-item definitions. The original serialiser interleaved each plan item with its
   definition — which reads more naturally and parses fine locally — and was rejected with
   *"Invalid content was found starting with element planItem"*.
2. **`<cmmndi:CMMNLabel/>` is mandatory** on every `CMMNShape`. Omitting it fails with
   *"The content of element cmmndi:CMMNShape is not complete"*.

Both are fixed, and both now have regression tests asserting the constraint directly rather
than via a round trip.

**Related finding, worth fixing separately:** the repository's own
`examples/employee-onboarding.cmmn` — which this serialiser was modelled on — has the same
missing `CMMNLabel` and **does not deploy** to a current engine. That is where the defect was
inherited from.
