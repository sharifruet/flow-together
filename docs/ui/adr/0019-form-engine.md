# ADR 0019 — Reinstate a form engine, ported from the removed open-source one

**Status**: Accepted (2026-09-16)
**Resolves**: [FORM_REQUIREMENTS.md](../FORM_REQUIREMENTS.md) §5. **Amends**: [ADR 0010](0010-form-and-event-authoring.md), whose
"forms deploy inside an app and take effect wherever a form engine is configured" deferral is
now closed by configuring one.

## Context

Every task and start form in Work falls back to the variable grid, because the engine has no
form engine: Flowable removed it from open source in 7.0, and this fork carries that removal
as commit `270e5e77f8` ("Remove Form Engine", 2022-12-13). The API (`flowable-form-api`), the
model (`flowable-form-model`), the engine-side hooks (`KEY_FORM_ENGINE_CONFIG`,
`completeTaskWithForm`, `startProcessInstanceWithForm`, `startWithForm()`), the REST
endpoints and request fields, and the frontend renderer and builder are all still present.
FORM_REQUIREMENTS.md §2 has the verified inventory.

Three options were weighed (FORM_REQUIREMENTS.md §5):

- **A** — Work renders the Design *draft* when the engine has no form. Fast, but a preview
  dressed as a feature: unversioned, unvalidated, unrecorded, and thrown away later.
- **B** — a form engine implementing `flowable-form-api`, registered through a configurator.
- **C** — Flowable Enterprise's engine. Not open source; ruled out.

## Decision

**Option B.** Restore the six form modules from `270e5e77f8~1` (`flowable-form-engine`,
`-engine-configurator`, `-json-converter`, `-rest`, `-spring`, `-spring-configurator`, plus
the Spring Boot autoconfigure classes), port them to the 8.x codebase, and close the gaps that
engine never filled. Specifically:

1. **Keep upstream's names.** Packages stay `org.flowable.form.*` and artifacts
   `flowable-form-*`: the other engines already import `org.flowable.form.api`, and a rename
   would buy nothing but a diff against history. Product naming lives in the UI.
2. **Persistence follows this repo's convention,** not the 6.x one: hand-written
   `create/drop/upgrade` SQL per dialect under `org/flowable/form/db/`, a `FlowableVersions`
   entry and upgrade steps, no Liquibase.
3. **`java.time`, not Joda.** Dates are ISO `yyyy-MM-dd` on the wire and `LocalDate` in
   variables.
4. **JSON through the engine-common abstraction** (`FlowableJsonNode`), never
   `com.fasterxml` directly outside a `*Jackson2*` class — checkstyle's import-control
   enforces it.
5. **Server-side validation is new work.** The 6.x `validateFormFields` was an empty method;
   FR-S.3 specifies what it must now reject, with every failing field reported.
6. **The deployer is registered on the app engine too**, not only on the process and CMMN
   engines, so a `.form` bundled by Design's app builder becomes a real deployment.
7. **No client-side bridge.** Until the engine lands, Work keeps today's fallback; Design's
   preview is the way to look at a form.

## Consequences

- A sixth engine in the reactor, shaped like the DMN family: engine and configurator in the
  root modules, spring/REST/starters under `distro`. `flowable-app-rest` mounts `/form-api`.
- Four new tables (`ACT_FO_FORM_DEPLOYMENT`, `ACT_FO_FORM_RESOURCE`, `ACT_FO_FORM_DEFINITION`,
  `ACT_FO_FORM_INSTANCE`) and a schema version bump; existing databases upgrade in place.
- The CI database matrix grows by the form engine's tests.
- Work gains `completeWithForm`, outcomes as actions, start-with-form and server-error
  mapping; Design gains **Deploy** on the form builder; Control gains a Forms section.
- The Resignation example deploys its fourteen forms and becomes the acceptance suite
  (FORM_REQUIREMENTS.md §12).

## Revisit when

- Flowable reintroduces an open-source form engine upstream — compare and consider
  re-aligning.
- A task needs to keep the form version it was created against while newer versions deploy
  (FORM_REQUIREMENTS.md §13 Q2); that is a runtime-binding change, not a reason to reopen
  the engine decision.
