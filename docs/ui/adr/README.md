# Architecture Decision Records — TogetherFlow UI

Short records of decisions that shaped the TogetherFlow frontend, so a later engineer
doesn't have to reconstruct *why* from git archaeology (REQUIREMENTS.md §13.8).

One file per decision. Each records the context, the decision, the alternatives that were
weighed, the consequences, and — where relevant — the trigger that should cause it to be
revisited. A superseded ADR is not deleted; it's marked superseded and links to its
replacement.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-in-house-design-system.md) | Build a minimal in-house design system rather than adopt a component library | Accepted |
| [0002](0002-spa-packaged-as-jar.md) | Package each app as a static SPA inside a Maven jar | Accepted |
| [0003](0003-http-basic-auth-for-v1.md) | HTTP Basic for v1, behind a swappable auth seam | **Superseded by 0006** |
| [0004](0004-tenant-context-from-day-one.md) | Thread tenant context through every query from Phase 1 | Accepted |
| [0005](0005-curated-types-with-generated-contract-check.md) | Hand-curated API types, guarded by generated-spec conformance assertions | Accepted |
| [0006](0006-oidc-authentication.md) | OIDC Authorization Code + PKCE via a public client; Basic fenced to local dev | Accepted |
| [0007](0007-flowable-native-form-renderer.md) | Flowable-schema-native form renderer rather than a form-js adapter | Accepted |
| [0008](0008-bpmn-dmn-modelers.md) | bpmn-js + dmn-js with a hand-written Flowable moddle extension | Accepted |
| [0009](0009-cmmn-canvas.md) | Hand-built SVG canvas for CMMN (no maintained library exists) | Accepted |
| [0010](0010-form-and-event-authoring.md) | Client-side authoring for forms and events, drafts in the generic model repository | Accepted |
| [0011](0011-case-runtime-and-audience-scoped-actions.md) | Case runtime on the shared task table; the same engine action scoped by audience | Accepted |
| [0012](0012-conditional-field-visibility.md) | Conditional field visibility as a `params` convention, not an engine change | Accepted |
| [0013](0013-in-house-i18n.md) | An in-house i18n layer rather than react-i18next | Accepted |
| [0014](0014-resilience-and-error-reporting.md) | Retry only safe requests; report crashes through a transport-agnostic sink | Accepted |

**ADRs 0001–0007 were made by default during Phase 1 and ratified retroactively in Phase 0.**
That ordering was a process mistake — they should have been settled before code was written
(IMPLEMENTATION_PLAN.md, Phase 0). They are recorded here as-built, with their revisit
triggers, rather than presented as if they had been deliberated up front. ADR 0003's
deadline has since been met by ADR 0006.

ADRs 0008–0012 were decided before the work they govern, each after probing the actual
option — the canvas libraries in 0008 and 0009, a running engine in 0010 and 0011, the
engine's own form model in 0012 — rather than inferring from source.
