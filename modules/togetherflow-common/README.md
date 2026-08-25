# TogetherFlow Common

Shared foundations for the four TogetherFlow apps: the typed REST client, auth and tenant
context, the design system, i18n, the shell, and the cross-cutting production concerns.

Not deployable. Every app consumes it through an npm `file:` dependency, so a change here
reaches all four — which is the point (REQUIREMENTS.md §7.5, §14.2), and also the reason
to be careful.

## What lives here

| Area | Covers |
|---|---|
| `api/` | Typed clients per engine, with retry, timeouts and correlation ids ([ADR 0014](../../docs/ui/adr/0014-resilience-and-error-reporting.md)) |
| `auth/` | OIDC (Authorization Code + PKCE) and Basic, behind one seam ([ADR 0006](../../docs/ui/adr/0006-oidc-authentication.md)) |
| `components/` | The design system ([ADR 0001](../../docs/ui/adr/0001-in-house-design-system.md)) |
| `forms/` | The Flowable-native form renderer ([ADR 0007](../../docs/ui/adr/0007-flowable-native-form-renderer.md)) |
| `i18n/` | Message catalogues and the translation layer ([ADR 0013](../../docs/ui/adr/0013-in-house-i18n.md)) |
| `observability/` | Error reporting and Core Web Vitals |
| `shell/` | `AppRoot`, `AppFrame`, `LoginScreen` — the chrome all four apps share |
| `shortcuts/` | Keyboard shortcut registry and help dialog (§14.4) |
| `theme/` | Design tokens and component styles |
| `views/` | Saved filter sets (§14.4) |

## The component gallery

§14.2 requires a documented component library where "every component documents its own
default/hover/focus/active/disabled/loading/error visual states".

```bash
npm run gallery        # http://localhost:5280
```

It is a small in-house page rather than Storybook — the same reasoning as ADR 0001 and
ADR 0013. What this product needs is a page that renders every component in every state,
which is a list of nodes; Storybook brings a build, an addon system and a configuration
surface for features nothing here uses.

Two things it does deliberately:

- **Token values are read from the live stylesheet**, never copied. A token page carrying
  its own values drifts from the CSS and then documents something the product no longer
  does. Switch the theme control to inspect the dark palette.
- **`hover`, `active` and `focus` are marked "interactive" rather than faked.** They are
  CSS pseudo-classes; rendering them statically would mean duplicating the stylesheet's
  rules onto gallery-only classes, which would then drift from the real ones. Every state
  a *prop* controls — disabled, loading, error — is rendered as its own instance.

Coverage is enforced, not remembered: `registry.test.tsx` reads `src/components/` off the
filesystem and fails when a component has no entry, or an entry has no component. CI also
builds the gallery, so documentation that stops compiling fails the build.

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Unit and component tests, including the a11y and gallery-coverage suites |
| `npm run typecheck` | `tsc --noEmit`, including the generated-spec contract assertions |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run codegen` | Regenerates `src/api/generated/` from the specs in `docs/public-api` |
| `npm run gallery` | Serves the component gallery |
| `npm run gallery:build` | Builds it, which is what CI does |

## Adding a component

1. Write it in `src/components/`, using the tokens — never a hard-coded colour or spacing.
2. Export it from `src/index.ts`. **Do not export anything that imports `node:fs` or a
   heavy test-only dependency** from there: the index is what every app bundles, and
   exporting the axe helper from it once put half a megabyte of `axe-core` into all four
   production bundles. Use a subpath export (see `./testing/a11y`) instead.
3. Add it to `src/gallery/registry.tsx` with every state it can be put into. The coverage
   test fails until you do.
4. Add it to `src/components/a11y.test.tsx` if it renders interactive markup.
