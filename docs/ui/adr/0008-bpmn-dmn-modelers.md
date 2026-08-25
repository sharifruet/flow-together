# ADR 0008 — bpmn-js and dmn-js, with a hand-written Flowable moddle extension

Status: Accepted
Relates to: REQUIREMENTS.md §7.4.1–7.4.4; IMPLEMENTATION_PLAN.md Phase 4

## Context

Phase 4 needed real BPMN and DMN authoring. Three things were verified against this
repo before deciding:

1. **Model source is opaque bytes.** `PUT /repository/models/{id}/source` stores whatever
   is uploaded; the engine never parses it. So the draft can hold native XML rather than
   an invented editor format.
2. **There is no "deploy this model" endpoint**, and no editor-JSON→BPMN converter over
   REST. Deployment means re-uploading the XML to `/repository/deployments`.
3. **Neither library was present** in the repo.

## Decision

- **bpmn-js (Modeler)** and **dmn-js (Modeler)** for the canvases. Both are maintained by
  bpmn.io, target the OMG standards this engine implements, and give palette, context pad,
  undo/redo and (for dmn-js) both the DRD view and the decision-table editor for free.
- **Store native XML as the draft source.** No intermediate format, so the round trip is
  lossless and a model authored elsewhere opens without conversion.
- **A hand-written Flowable moddle descriptor** (`flowableModdle.ts`) rather than Camunda's.
- **A purpose-built properties panel** rather than `bpmn-js-properties-panel`.
- **Lazy-load both editors.** dmn-js alone is ~830 kB; the library screen must not pay for
  a canvas it does not render.

## Why not the off-the-shelf properties panel

`bpmn-js-properties-panel` models Camunda's extension namespace. The namespace URI differs
from Flowable's, and so do several attribute names. Using it would have written properties
this engine silently ignores — the worst kind of bug, because the diagram looks correct and
the process behaves wrongly at runtime.

## Two findings that shaped the implementation

**Without a moddle extension, bpmn-js silently drops every `flowable:` attribute on save.**
A diagram would round-trip through the editor and come back stripped of its assignees, form
keys and service-task classes, with no error. The descriptor is what prevents this, and the
round trip is verified end to end in a browser rather than assumed.

**Declared extension properties are stored under their *local* name.** Verified directly
against bpmn-moddle: `flowable:assignee` in the XML becomes `businessObject.assignee`, and
serialises back with the prefix. Reading the prefixed key returns `undefined`, and *writing*
it lands in `$attrs` — which still produces valid-looking XML, so the mistake is invisible
in the output while the panel shows blank fields and the value exists in two places. The
panel therefore uses local names throughout.

## Consequences

- Authoring, saving, deploying and re-opening all work for BPMN and DMN.
- The moddle descriptor covers the attributes the panel edits plus common ones found in
  existing models. **It is not a complete model of every Flowable extension** — an attribute
  outside it still survives via `$attrs`, but is not typed or editable in the panel. Extend
  the descriptor when the panel grows.
- The properties panel is deliberately small: id, name, sequence-flow condition, the common
  user/service-task attributes, and async. Listeners, form properties, multi-instance and
  boundary-event configuration are not yet exposed.
- **No validation before deploy.** The engine has `flowable-process-validation`, but no REST
  endpoint exposes it, so an invalid model fails at deploy time with the engine's error
  rather than being caught in the editor. Surfacing validation would need new backend
  surface — worth scoping separately.
- **No CMMN.** That is Phase 5, and remains the open risk recorded in REQUIREMENTS.md §7.4.3:
  there is no maintained OSS CMMN canvas equivalent to bpmn-js.
