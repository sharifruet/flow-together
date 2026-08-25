# ADR 0011 — Case runtime, and scoping engine actions by audience

**Status**: Accepted
**Relates to**: REQUIREMENTS.md §7.1 (Case work), §7.2 (Case instances)

## Context

CMMN could be modelled and deployed, but after that it disappeared from the product:
no case list, no case detail, no plan items, no milestones, and no way to start a case.
Building the runtime raised two questions that the REST layer alone does not answer.

## Decision 1 — Work's inbox needs no second task query

Probing the running engine established that **the task table is shared across engines**:
`POST /query/tasks` on the process API already returns CMMN tasks, tagged
`scopeType: "cmmn"` with `scopeId` holding the case instance id.

So the plan's assumption — that case work needs a parallel query against the CMMN
servlet — was wrong. Work's inbox was already showing case tasks; what was missing was
the *context*: nothing marked a task as belonging to a case, and there was nowhere to see
the case itself.

What was built instead: a **Cases** view (list, plan items nested under their stage,
stage/milestone progress, case data, terminate), case start alongside process start, cases
in "My history", and a marker on a case task in the inbox.

## Decision 2 — the same engine action is offered to one audience and withheld from another

`PUT /cmmn-runtime/plan-item-instances/{id}` with `{"action":"trigger"}` on an **active
human task** returns 204 and completes that task — bypassing its form, its assignee and
its validation. Verified directly against a running engine.

That single capability is both:

- **the intended escape hatch** for an operator facing a case stuck on a task nobody can
  action, and
- **a way for an end user to skip the form they were asked to fill in**, sitting right
  next to the task in their own case view.

The decision is therefore not "is this allowed" but "who is this for":

| Surface | `trigger` on a human task | Label |
|---|---|---|
| Work (participant) | **Not offered.** The row points at Tasks instead. | — |
| Control (operator) | Offered, behind a confirmation naming what is skipped. | "Force complete" |

`availablePlanItemActions(state, options)` owns this. It answers two questions in one
place — what will the engine accept, and should this audience be offered it — and is
unit-tested against both. Everything else it encodes comes from the engine's own rules:
an item blocked on a sentry accepts nothing (the engine answers *"Can only enable a plan
item instance which is in state ENABLED"*), so no button appears for it.

## Consequences

- A capability being present in the REST API is not, by itself, a reason to surface it.
  The audience decides. This is the first place that distinction is encoded rather than
  assumed, and the pattern should be reused.
- Withholding an action means the UI must say where to go instead, or it reads as a bug.
  Work's plan-item rows carry "Open it from Tasks" for exactly this reason.
- Control's confirmation has to state the consequence specifically ("will be completed
  without anyone filling in its form"), not generically. A generic "Are you sure?" would
  hide the very thing that makes the action dangerous.

## Notes on what the engine does not offer

Recorded here because each shaped a screen:

- **No historic plan-item endpoint.** `/cmmn-history/historic-plan-item-instances` answers
  "No endpoint", so a finished case shows no plan items — the panel says so rather than
  rendering an empty table.
- **Case definitions cannot be suspended.** §7.2 already noted this; Control's Definitions
  screen shows case definitions but offers no suspend control, and explains why.
- **A case diagram needs CMMNDI.** Hand-written `.cmmn` files usually lack it and the
  engine answers 400, so `graphicalNotationDefined` is checked before rendering an image.
