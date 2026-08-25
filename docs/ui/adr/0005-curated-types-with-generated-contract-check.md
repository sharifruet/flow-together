# ADR 0005 — Curated API types, guarded by generated-spec conformance assertions

Status: Accepted
Relates to: REQUIREMENTS.md §8 (typed API client); IMPLEMENTATION_PLAN.md Phase 0

## Context

Phase 0 called for generating a typed client from the OpenAPI specs published under
`docs/public-api`, instead of hand-rolling fetch calls. Generating directly produces very
large modules (~9,700 lines for the process spec alone) covering an API surface far wider
than this UI uses.

## Decision

Do both, with a clear split:

- `npm run codegen` generates types from all five published specs into
  `src/api/generated/`, which is checked in.
- `src/api/types.ts` holds a small curated view of the shapes the UI actually uses.
- `src/api/contract.test-d.ts` asserts at compile time that the curated types remain
  compatible with the generated ones. A breaking engine change fails `tsc`, not runtime.
- CI regenerates and fails if the committed output differs from the specs.

## Alternatives considered

- **Import generated types directly** — no drift risk, but call sites become
  `components["schemas"]["TaskResponse"]`, every field is optional because the specs are
  permissive, and the UI is coupled to spec quirks.
- **Hand-written types only** (what Phase 1 shipped) — readable, but nothing detects drift.

## Consequences

- Call sites stay readable while drift is still caught mechanically.
- Two representations exist and can disagree; the conformance file is what keeps them
  honest, so it must be extended whenever the UI starts depending on a new field.
- **Finding: the published specs are stale.** The conformance check immediately caught that
  `HistoricProcessInstanceResponse` declares `name`, `businessStatus` and `state` in the
  Java source but not in the checked-in OpenAPI spec. The curated type follows the Java
  source (what the engine actually returns) and the assertion excludes those fields, with a
  note to restore them once the spec is regenerated. Worth fixing upstream in
  `docs/public-api`.
- **Finding: three of five specs are Swagger 2.0**, which `openapi-typescript` rejects; the
  codegen script converts them to OpenAPI 3 on the fly. The converted CMMN output contains
  duplicate operation ids, so `src/api/generated/` is excluded from the project typecheck
  and only the specific generated modules that are imported get checked.
