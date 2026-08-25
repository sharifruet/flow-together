# ADR 0013 — An in-house i18n layer rather than react-i18next

**Status**: Accepted
**Relates to**: REQUIREMENTS.md §8 (i18n NFR), §14.3 (UX writing consistency)

## Context

§8 requires that "all user-facing strings [are] externalized from day one", and the
cross-cutting workstream in IMPLEMENTATION_PLAN.md repeats it: "retrofitting is
expensive, don't defer it." It was deferred anyway. Phases 1–6 shipped four apps with
every string written inline, so the retrofit the requirement warned about is the one
that has now been paid for — roughly 900 strings across five modules.

Having to do it at all made the library question worth asking properly rather than
reaching for the default.

What the product actually needs from i18n:

- look a message up by key, with a fallback chain (`de-AT` → `de` → `en`);
- interpolate named parameters;
- select a plural form;
- let a user switch language and have the choice stick;
- keep dates, times and relative dates in the same language as the copy around them.

What `react-i18next` also brings: pluggable backends, language detectors, namespaces and
lazy namespace loading, a translation-key type generator, `Trans` for embedded markup,
context and ordinal variants, and an ecosystem of plugins.

## Decision

An in-house layer in `togetherflow-common/src/i18n`, matching the reasoning already
recorded in [ADR 0001](0001-in-house-design-system.md) for the design system.

`Intl.PluralRules` selects plural forms and `Intl.RelativeTimeFormat`/`Intl.DateTimeFormat`
handle dates, so the platform already provides the three hard parts. What remains is a
`Map` lookup, a regex substitution and a React context — about 200 lines, against a
dependency whose surface is an order of magnitude larger than the need.

Catalogues are flat `Record<string, string>`, one per module, merged at the root by
`AppRoot`. Each app owns its own; `togetherflow-common` owns the copy for the shared
shell, the screen states and the API client's error messages, so those cannot drift
between apps — which is the same discipline §14.3 asks for in UX writing.

## Alternatives weighed

- **react-i18next.** The obvious choice, and not a bad one. Rejected because its value is
  concentrated in features this product does not use: there is one catalogue per app,
  loaded with the app, so namespaces and backends buy nothing; the detector is four lines
  of `navigator.languages`; and `Trans` matters only for embedded markup, which this
  product's copy avoids anyway. The catalogue discipline — the actual work — is identical
  either way.
- **FormatJS / react-intl.** ICU MessageFormat is genuinely more capable than `{name}`
  substitution, and if the product needed select/ordinal/nested plurals it would win. It
  does not, and ICU parsing is most of the bundle.
- **Do nothing and keep strings inline.** What was happening. Not an option: §8 states the
  requirement, and every phase that shipped inline strings made the eventual retrofit
  larger.

## Consequences

- **The message format is deliberately small**: `{name}` interpolation and `.one`/`.other`
  plural suffixes. A message needing more than that is a signal to restructure the message,
  not to grow the format. If a real case arrives that genuinely needs ICU — a language with
  four plural categories interacting with a select — that is the trigger to revisit this.
- **A missing key renders as the key and warns in development.** Ugly on purpose: falling
  back to something plausible is how untranslated copy ships unnoticed.
- **Components work without a provider**, resolving the shared English catalogue. That
  keeps a component from this package usable standalone and lets component tests assert on
  real copy rather than on keys, via `registerFallbackMessages`. It also means a missing
  provider degrades rather than crashes — which is the right direction, though it does mean
  a forgotten provider shows up as English rather than as an error.
- **Only `en` ships.** The layer is built and every string is externalized, but there is
  one catalogue. Adding a language is now additive — a sibling file of the same keys, and
  the shell's language picker appears on its own once more than one locale is present —
  but nobody should read "i18n is done" as "the product is translated".
- **Dates follow the active locale**, because `formatDate`/`formatDateTime`/`dueState` all
  take it. A screen that formats a date without passing `locale` is a bug that renders in
  the browser's language while the copy around it is in the user's — the reason those
  helpers take an explicit parameter instead of reading the default.

## Revisit if

A second and third locale land and the catalogues become large enough that per-screen lazy
loading matters, or a target language needs plural or select behaviour beyond
`one`/`other`. Either would make a real ICU implementation worth its weight; neither is
true today.
