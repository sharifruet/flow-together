# ADR 0002 — Package each app as a static SPA inside a Maven jar

Status: Accepted
Relates to: REQUIREMENTS.md §11.2, §10; IMPLEMENTATION_PLAN.md Phase 0

## Context

This repo is a Maven reactor. The UI has to build alongside the engines via `./mvnw`
without forcing engine-only builds to pay for a Node toolchain download.

## Decision

Each app is a Vite/TypeScript project under `src/main/frontend`, built by
`frontend-maven-plugin` during `prepare-package`, with the output packaged into the module's
jar under `static/`. The modules live behind an opt-in `-Ptogetherflow` Maven profile.

The REST base URL is read at runtime from `window.__TOGETHERFLOW_API_BASE__` (falling back to
`/process-api`) rather than baked in at build time, so one artifact can be promoted across
environments (REQUIREMENTS.md §13.3).

## Alternatives considered

- **Plain static output, no jar** — simpler, but gives operators nothing to deploy through
  the same channel as the rest of the platform.
- **Thin Spring Boot app per UI** — would let each app self-host and expose health
  endpoints directly. Rejected for now as more moving parts than Phase 1 needs; the jar can
  be wrapped by one later without changing the frontend.
- **Adding the modules to the default reactor** — rejected: every engine build would then
  download Node and run a JS build.

## Consequences

- `./mvnw install -Ptogetherflow` produces a deployable jar; verified end to end.
- Engine-only builds are untouched.
- Because the modules are outside the default reactor, a CI job that doesn't pass
  `-Ptogetherflow` will not build or test them — hence the dedicated GitHub Actions
  workflow rather than relying on the main Maven build.
- Health/readiness endpoints (§13.2) are the hosting layer's responsibility, not the jar's.
  This is unresolved for a standalone deployment and needs settling before production.
