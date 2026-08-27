# ADR 0016 — An in-house router rather than React Router

**Status**: Accepted
**Relates to**: [UI_POLISH_BACKLOG.md](../UI_POLISH_BACKLOG.md) F1,
[ENTERPRISE_PARITY_PLAN.md](../ENTERPRISE_PARITY_PLAN.md) W1.2 (this ADR *is* W1.2),
REQUIREMENTS.md §13.5 (bundle budgets)

## Context

There is no router in any of the four apps. Each holds its screen in `useState` —
`useState<WorkView>("inbox")` in Work, `useState<ControlView>` in Control, and so on —
and its selected entity in a second piece of state. The consequences are all user-visible
and all listed in F1: a task, instance, job or model cannot be linked to or bookmarked;
browser Back exits the app instead of closing a detail pane; a refresh drops the user at
the default view with filters cleared; "open in new tab" on a row is impossible.

W1.3 fixes that across all four apps, and cannot start until this is settled.

What the four apps actually need from a router:

- a URL per screen, and per selected entity within a screen;
- filters and page offset in the query string, so a filtered list is linkable;
- `<a href>` navigation, so middle-click, copy-link-address and open-in-new-tab work —
  F1 calls this out specifically for the nav items;
- Back and Forward that mean what the user expects, including closing a detail pane;
- a guard for the Design editors, which autosave and must not silently drop
  unsaved work on a navigation.

What React Router 7 also brings: nested route trees with layout routes, data loaders and
actions, `defer`/streaming, `fetcher`s, error boundaries per route, route-level code
splitting, a framework mode with its own build step, and server-side rendering.

## Decision

An in-house router in `togetherflow-common/src/routing`, following the reasoning already
recorded in [ADR 0001](0001-in-house-design-system.md) for the design system and
[ADR 0013](0013-in-house-i18n.md) for i18n: adopt the dependency when the hard part is
genuinely hard, build it when the platform already provides the hard part.

Here the platform provides all three hard parts. `history.pushState`/`replaceState` and
the `popstate` event are the navigation model; `URLSearchParams` is the query-string
model; `URL` is the parser. What remains is pattern matching a path against
`/tasks/:taskId`, a React context holding the current location, and a `<Link>` that
calls `preventDefault` on a plain left-click and pushes instead — about 200 lines.

Two things tipped it beyond the precedent:

**Bundle budgets (§13.5) are already tight.** Identity's total budget is 100 kB gzipped
against a 96 kB entry; Work's is 115 against 110. `react-router-dom` is ~12–15 kB
gzipped, which does not fit in either without raising the budget in all four apps —
and §13.5's whole point is that a budget raised to accommodate whatever arrives is not a
budget. The in-house router is ~2 kB.

**None of the surface that justifies React Router is wanted here.** These are four flat
apps: Work has 4 destinations, Control 7, Identity 3, Design 1 plus an editor. There are
no nested layout routes. Data loading is already solved by `useAsync` and the typed API
clients, and moving it into route loaders would be a rewrite of the data layer, not a
routing change. There is no SSR and (ADR 0002) never will be — each app is a static SPA
in a jar.

### Shape

```
RouterProvider          reads window.location, subscribes to popstate
useLocation()           { path, query }
useNavigate()           navigate(to, { replace })
useRouteParams(pattern) matches the current path, returns typed params or null
<Link to=…>             renders <a href>, intercepts plain left-click only
useNavigationBlock(fn)  registers an "are you sure" guard; also wires beforeunload
```

Modifier-clicks, middle-clicks and `target=_blank` are deliberately *not* intercepted, so
the browser's own behaviour applies — which is what makes copy-link and open-in-new-tab
work, and is the half of F1 a naive `onClick` router silently breaks.

Route patterns are plain strings with `:param` segments, matched by splitting on `/`.
No wildcards, no optional segments, no regex constraints: the four apps' URL schemes are
listed in W1.3 and none of them needs one.

## Alternatives considered

**React Router 7 (declarative mode).** The default choice, and the one to revisit if the
trigger below fires. Rejected for the budget and for carrying a data-loading model that
would either sit unused or force a rewrite of the API layer.

**Wouter** (~2 kB). Close to the right size and genuinely small. Rejected because at this
size the dependency costs about as much to *evaluate and track* as to write — and the
navigation-block hook that the Design editors need is not in it, so it would have needed
an in-house layer on top regardless.

**TanStack Router.** Strong type inference over route params, which is real value. But it
is heavier than React Router, and its file-based route generation assumes a build
convention these four Vite apps do not use.

**No router; encode state in the hash by hand.** What "just make refresh work" would
produce. Rejected: it is the same code without the seam, so every app writes its own
parsing and the drift F5 documents for the shell CSS repeats itself for URLs.

## Consequences

- Four apps get linkable, bookmarkable, refresh-surviving URLs at ~2 kB, so no budget
  moves for routing.
- The router is ours to maintain, including the accessibility details a library would
  have settled: focus moves to the main region on navigation, and the route change is
  announced. These are tested rather than assumed.
- Nothing gets nested layout routes, route-level data loading, or pending/optimistic UI
  from the router. Where a screen wants those it writes them, as it does today.
- Anyone joining knows React Router and does not know this. The API above is deliberately
  named after React Router's so that knowledge mostly transfers, and the module is small
  enough to read in one sitting.

## Revisit when

Any one of these is enough to switch to React Router, and the API above is shaped so that
the swap is mechanical:

- a third level of nesting appears in any app's URL scheme, or two screens need to share
  a layout route;
- route-level data loading is wanted — which is likely if W3.1's workspaces make every
  screen depend on a workspace fetched from its URL segment;
- the in-house module passes ~400 lines, at which point it is no longer obviously cheaper
  to own than to import.
