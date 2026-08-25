# ADR 0001 — Minimal in-house design system, not a component library

Status: Accepted (Phase 0, ratified retroactively — see [README](README.md))
Relates to: REQUIREMENTS.md §11.1, §14.2

## Context

`togetherflow-common` needs a component layer that four apps will share. The options were
adopting an established library (MUI, Ant Design, Mantine) or building a small set of
primitives in-house.

The brand palette is fixed by an existing logo (REQUIREMENTS.md §14.2), the screens are
data-dense forms and tables rather than novel interactions, and §14.1 sets a per-screen
state contract (loading / empty / zero-results / error / permission-denied) that has to be
uniform across every app.

## Decision

Build a minimal in-house design system: design tokens in CSS custom properties, plus a
small set of primitives (`Button`, `Field`, `DataTable`, `Toast`, `ConfirmDialog`,
`AsyncBoundary` and the state components).

## Alternatives considered

- **MUI / Ant Design** — much more out of the box, but each ships an opinionated visual
  language that would have to be overridden to match the brand palette, and adds a large
  dependency plus its own upgrade treadmill to a codebase whose UI needs are modest.
- **Headless library (Radix, Ark)** — a reasonable middle ground; rejected for Phase 1 only
  to keep the dependency surface at zero while the component set is this small. This is the
  most likely thing to revisit.

## Consequences

- No third-party UI dependency; bundle stays small (~59 KB gzipped for Work).
- `AsyncBoundary` makes §14.1's state contract the default shape of rendering a request,
  so a screen cannot silently ship happy-path-only.
- We own accessibility ourselves. Focus management, ARIA roles and keyboard behaviour are
  hand-written and hand-tested — this is the real cost of the decision, and it grows with
  every new primitive.
- Complex widgets not yet built (date pickers, comboboxes, virtualised grids) will each be
  a build-or-adopt decision. Control (Phase 3) needs dense grids and is the likely trigger.

## Revisit when

Control's grid requirements land, or the first genuinely complex widget is needed. At that
point adopting a headless library for those specific components — while keeping these
tokens — is preferable to hand-rolling a combobox.
