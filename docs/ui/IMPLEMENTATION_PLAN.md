# TogetherFlow — Implementation Roadmap

Status: Draft v1
Companion to: [REQUIREMENTS.md](./REQUIREMENTS.md) — this document sequences that scope into phases; it does not restate the requirements. Section references (§) below point into REQUIREMENTS.md unless marked otherwise.

Roadmap-level only: each phase lists objective, scope, dependencies, and exit criteria — not task-by-task engineering breakdown or calendar estimates (this repo's velocity/team size is unknown, so relative sizing is used instead of dates).

**On "production grade"**: Phases 1–6 alone get feature parity with Flowable's own apps, not production-grade software, on two separate axes. REQUIREMENTS.md §13 covers whether the system is safe/reliable/operable (security, observability, release engineering, resilience, verified performance, compliance). REQUIREMENTS.md §14 covers whether it actually *feels* finished and professional to use — per-screen state completeness, design-system consistency, interaction polish, power-user usability, verified accessibility/visual quality. Both are woven into every phase below as "Production readiness" and "UX quality" lines — not deferred to the end, because hardening and polish that get bolted on after six phases of feature work are far more expensive than the same discipline built in from Phase 1. **Phase 7** is a real gate at the end regardless — the things that only make sense to verify once the system is feature-complete (full security review, load test, accessibility audit, usability study, DR drill) — but it is a verification gate, not where either axis *starts*.

## Phase 0 — Decisions & Bootstrap

Nothing in Phase 1 should start until these are resolved; all are already logged as REQUIREMENTS.md §11 Open Questions, repeated here because they're blocking rather than informational.

**Must decide before Phase 1:**
- Component library vs. in-house design system (§11.1) — blocks `togetherflow-common`'s scope.
- Deployment shape: static SPA vs. thin Spring Boot jar per app (§11.2) — blocks the `pom.xml`/`frontend-maven-plugin` setup.
- Auth target for v1: HTTP Basic vs. OIDC/JWT from day one (§11.3) — blocks the API client's auth layer design.
- Tenant model: single-tenant-per-login vs. switcher (§11.9) — blocks Shell's session/state shape; expensive to retrofit.

**Can decide during Phase 1, before it ends:**
- Form rendering fidelity for v1 (§11.4).
- Priority confirmation that Work ships before Control/Identity (§11.5) — already assumed throughout this roadmap.

**Bootstrap tasks (once the above are decided):**
- Scaffold `togetherflow-common` as an npm workspace root; add `togetherflow-work` as the first consuming module.
- Wire `frontend-maven-plugin` into each module's `pom.xml` per the deployment-shape decision, confirm `./mvnw install -Pdistro` builds it end-to-end.
- Stand up TypeScript client generation from `docs/public-api/references/openapi/process` (and the CMMN/DMN Swagger specs) as a repeatable script, not a one-off — every later phase depends on this working cleanly for its engine.
- Baseline CI: lint, typecheck, unit tests, build, added to whatever job already runs `./mvnw verify` for this repo.

**Production readiness (§13) started here, not later** — *status: done.* OIDC (Authorization Code + PKCE) is implemented against a public `togetherflow-ui` client added to the checked-in Keycloak realm, with Basic fenced to local development (ADR 0006); wire dependency vulnerability scanning and container image signing (matching `docker/cosign.pub`'s existing practice) into the CI baseline above, so every module is covered from its first commit rather than retrofitted; decide the versioning/compatibility-matrix approach (§13.3) before the first module ships a `0.x`.

**UX quality (§14) started here too**: the component-library decision (Open Question 1) is also where the design tokens and per-component state set (§14.2) get defined — every module built after Phase 0 inherits whatever precedent gets set here, so this is the one place a shortcut here is genuinely expensive later. Add visual regression tooling (§14.5) to the CI baseline alongside lint/typecheck/test, so it's exercising real screens from Phase 1 onward instead of being introduced after four apps already have unmonitored visual drift. The brand palette isn't a blank-slate decision here — §14.2's color tokens are seeded from the actual `logo.png` brand asset; get the vector-source/favicon-crop gap noted in §7.5 closed during this phase too, since the app switcher and login screen (both Phase 1 scope) are the first places the logo actually needs to render.

## Phase 1 — TogetherFlow Work MVP

**Objective**: a business user can log in, see their tasks, complete one, and start a new process or case instance.

**In scope** (§7.1, subset): task inbox, task detail (variables, comments, attachments via the default `db` provider — §7.6, claim/complete actions, start process/case with initial variables. Shell (§7.5) ships alongside it: login, single-app shell (no switcher needed yet since Work is the only app), tenant context per the Phase 0 decision.

**Explicitly deferred to later phases**: case work beyond the basics (milestones, sub-tasks), "my history," real form rendering (generic variable grid stands in — §7.1's Forms bullet), attachment providers other than `db`.

**Dependencies**: Phase 0 complete. Nothing else — this is the first thing built.

**Exit criteria**: a user can complete the golden path (log in → see inbox → open a task → edit variables → complete it → start a new instance) against a real running instance of this repo's `flowable-rest`/`flowable-cmmn-rest`, with an e2e test (§8 Testing NFR) covering it.

**Production readiness**: session storage and CSP set up correctly from the start (§13.1 — httpOnly session storage, not `localStorage`, since retrofitting token storage after other modules copy the pattern is exactly the kind of thing that's expensive to undo); frontend error tracking wired in for Work specifically, since it's the daily-use app (§13.2); k8s health/readiness probes added alongside the first deployable artifact, matching `flowable-rest`'s existing manifest shape (§13.2); Core Web Vitals baseline captured for Work before it's considered done (§13.5).

**UX quality**: every Work screen meets the §14.1 per-screen Definition of Done (loading/empty/zero-results/error/permission-denied/pagination-edge states) before the phase is called done — this is the template every later phase's screens are held to, so get it right here rather than discovering the checklist was aspirational once four more apps have shipped without it. Keyboard support and claim/complete shortcuts (§14.4) ship in this phase, not as a later add-on, since Work is exactly the high-volume daily-use app power-user features matter most for. A real usability pass with an actual business-user persona (§14.5) happens before this phase closes, not just an internal design review.

**Relative size**: L — this phase also carries all the foundational `togetherflow-common` work (API client, auth, base component set, table/list primitives) plus the production-readiness and UX-quality foundations above, so it's disproportionately larger than its own feature list suggests.

## Phase 2 — TogetherFlow Identity + Form Rendering

**Objective**: administrators can manage who exists in the system; task forms render as real forms instead of a raw variable grid.

**In scope** — *status: delivered.* `togetherflow-identity` in full (§7.3) — users, groups, membership, privileges, and read-only (directory-backed) awareness. Real form rendering in Work and in Start work, built natively against Flowable's own `SimpleFormModel` schema rather than adapting `form-js` — see [ADR 0007](adr/0007-flowable-native-form-renderer.md), which resolves Open Question 4 and the rendering half of 7.

**Dependencies**: Phase 1's Shell exists (Identity becomes the second app in the switcher — first time the switcher itself gets built, since Phase 1 only needed one app). The form-schema decision (§11.4/§11.7) should land before this phase's form-rendering work starts, even though the *builder* half of that decision is Phase 6 — rendering needs the schema question answered first, authoring can follow later.

**Exit criteria** — met: an admin can create a user, add them to a group, and grant a privilege; a business user sees a properly rendered form (not a key/value grid) on a task that declares one, with the grid retained as a documented fallback when no form model can be loaded.

**Production readiness / UX quality**: LDAP-awareness (§13.7-adjacent — read-only affordances, §7.3) must fail safely and communicate clearly rather than silently error; the app switcher built here for the first time (§7.5) gets the same Definition of Done (§14.1) as Phase 1's screens; destructive-action confirmation (§14.3) is non-negotiable for user/group deletion given this app can lock people out of the system.

**Relative size**: M.

## Phase 3 — TogetherFlow Control

**Objective**: operations/admin can monitor and act on runtime state across every engine.

**In scope** — *status: core delivered.* `togetherflow-control` covering process instances (query, suspend/activate, delete, diagram + activities + variables), all five job queues with stack traces and bulk actions, deployments (upload, resources, cascade delete), and a System section with engine info/properties, the read-only database browser, event subscriptions, batches, DMN decision executions and external worker jobs. **Deferred within this phase**: case (CMMN) instance screens, instance migration/change-state, and a signal-broadcast screen — see the module README.

**Dependencies**: Phase 1's diagram-rendering groundwork (read-only `bpmn-js`/`dmn-js` viewers, first needed for process instance detail) is reusable here; if that wasn't built as a shared `togetherflow-common` piece in Phase 1, do that refactor before starting Control rather than duplicating it.

**Exit criteria** — met: an admin can find a stuck process instance, see where it's stuck (diagram plus activity instances), inspect a failed job's stack trace, run it again, and confirm resolution, without touching a database client. The table explorer shipped in the same phase rather than trailing.

**Production readiness / UX quality**: this phase's actions are the most destructively powerful in the whole product (deleting process instances, suspending definitions, retrying/deleting jobs at scale) — §13.1's defense-in-depth and §14.3's confirmation-dialog requirement apply hardest here. Bulk actions (§14.4 — bulk job retry in particular) are real scope for this phase, not a nice-to-have, since Control's whole reason for existing is operating at volume an admin can't handle one row at a time. Given the data density of this app, table/grid performance (§13.5) needs load testing against realistic history volume before this phase is called done, not assumed from Work's lighter-weight lists.

**Relative size**: L — this is the single largest surface area of any phase (§7.2 has the longest bullet list in the requirements doc).

## Phase 4 — TogetherFlow Design: Model Library, BPMN, DMN

**Objective**: a citizen developer can author, validate, and deploy process and decision models visually.

**In scope** — *status: delivered.* `togetherflow-design`: model library (§7.4.1), BPMN modeler (§7.4.2) on bpmn-js with a hand-written Flowable moddle extension and a Flowable-native properties panel, DMN modeler (§7.4.4, DRD + decision table) on dmn-js, and deploy for both. Drafts store native XML. See [ADR 0008](adr/0008-bpmn-dmn-modelers.md).

**Dependencies**: none blocking beyond Phases 1–3 existing (Control's read-only diagram viewers and the Shell's app-switcher pattern are directly reused here, now in editable mode). This phase is picked first among the four Design sub-scopes specifically because BPMN and DMN are the only two with mature OSS canvas libraries — see the CMMN risk called out in Phase 5.

**Exit criteria** — mostly met: a model authored here can be saved as a draft and deployed, and the deployment is visible in Control and startable from Work. **Validation before deploy was not delivered**: the engine's `flowable-process-validation` has no REST endpoint, so an invalid model fails at deploy time rather than in the editor. Closing that gap needs new backend surface — scope it separately.

**Production readiness / UX quality**: autosave and unsaved-changes guards (§14.3) are close to a hard requirement here, not a nice-to-have — losing an hour of BPMN modeling to a browser crash is the single fastest way for this product to feel unprofessional to its target citizen-developer persona. Undo/redo (`bpmn-js`/`dmn-js` support it natively — §14.3) should ship with the initial canvas, not as a follow-up. CSP (§13.1) needs particular attention here since the canvas renders model content that ultimately came from a deployment — treat authored XML/JSON as untrusted input when rendering it back.

**Relative size**: XL — building two real graphical canvas editors (even on top of existing libraries) with properties panels, XML round-tripping, and validation wiring is a large effort; consider splitting BPMN and DMN into separate milestones within this phase rather than treating it as one atomic deliverable.

## Phase 5 — TogetherFlow Design: CMMN, App Builder

**Objective**: case models and multi-model "apps" become authorable, closing out the deployable-unit types this repo's engines support (short of forms/events).

**In scope** — *status: delivered.* The case modeller (§7.4.3) ships as a hand-built SVG canvas with a fully unit-tested CMMN 1.1 model layer — see [ADR 0009](adr/0009-cmmn-canvas.md). The app definition builder (§7.4.5) composes an app from existing models and publishes it as a zip bundle to the app engine; verified against a running engine, publishing also deploys every bundled resource to its own engine.

**Dependencies — this is the phase most likely to blow its own estimate**: CMMN has no equivalent to `bpmn-js`/`dmn-js` (§7.4.3's "known gap," Open Question 6). **Before this phase is scheduled, Open Question 6 must be answered**: commit to a custom graphical canvas (large, open-ended effort — needs its own design pass against `flowable-cmmn-model`) or a non-graphical stage/task-and-properties editor first (much smaller, but a real product-scope compromise that needs sign-off, not just an engineering shortcut). Treat this as a go/no-go gate on the phase, not a detail to resolve mid-build. The app builder half has no such risk — it's a straightforward composition UI over Phase 4's model library.

**Exit criteria**: same full-loop test as Phase 4 (author → deploy → start in Work → observe in Control), run for a case model and for a composed app.

**Production readiness / UX quality**: same autosave/undo bar as Phase 4 applies to whichever CMMN editor gets built (§14.3) — if the fallback list-based editor (Open Question 6) is chosen, its Definition of Done (§14.1) still applies in full even though it isn't a graphical canvas; don't let the reduced-scope option quietly become a reduced-quality-bar option too.

**Relative size**: unknown until Open Question 6 is answered — ranges from M (list-based editor) to XL (custom canvas). Flag this explicitly when this phase is actually scheduled; don't let it inherit Phase 4's estimate by assumption.

## Phase 6 — TogetherFlow Design: Forms, Event Registry; Attachment Gateway (conditional)

**Objective**: the last two model types (forms, channels/events) become authorable, and non-default attachment storage (§7.6) ships if it's actually needed by then.

**In scope**: form builder + Event Registry channel/event modeler (§7.4.6), their Control-side runtime views (already scoped in §7.2, but realistically only worth building once there's something to monitor). `togetherflow-attachment-gateway` (§7.6) — SharePoint and/or filesystem providers — is built here **only if** a non-`db` provider is still wanted; if `db` has been sufficient through Phases 1–5, this can be dropped from the phase entirely with no cost, since it was never load-bearing for anything else.

**Dependencies — resolved.** Open Question 7's fork was settled by probing a running engine rather than by reading source: there is no form REST module and the stock image does not initialise a form engine at all, while the event registry REST surface is mounted and accepts one `.event`/`.channel` file per call (no archive). Authoring is therefore client-side, with the existing generic model repository serving as the draft store for both model types — so this phase carried **no engine-side work**. See [ADR 0010](adr/0010-form-and-event-authoring.md). If SharePoint is still in play, Open Questions 10–12 (auth model, target scope) need answers before the attachment gateway half of this phase.

**Exit criteria**: forms authored here render correctly via Phase 2's renderer (schema consistency is the real test); an event/channel definition authored here successfully starts a process when the event fires, observable in Control.

**Production readiness / UX quality**: the form builder's drag-and-drop interactions (§7.4.6) need the same autosave/undo bar as Phases 4–5's canvases (§14.3); if the attachment gateway is in scope this phase, it inherits the resilience requirements from §13.4 (graceful degradation — Work must stay usable if the gateway is down) from day one of its existence, not as a follow-up hardening pass.

**Relative size**: M–L depending on which side of Open Question 7's fork gets picked; add L if the attachment gateway is in scope for this phase too.

**Outcome (built)**: form builder (palette / field list / properties, authoring Flowable's own `SimpleFormModel` JSON so Phase 2's renderer consumes it untranslated) and Event Registry editor (event payload with correlation parameter, plus inbound/outbound channel), both with autosave, unsaved-change guards and per-screen states per §14. Verified against a live engine end to end: an event and a channel authored in the UI deploy to the registry and the draft reopens intact. Doing so surfaced a defect in shared code — the API client sniffed response bodies, so a JSON draft came back parsed rather than as text and **every app, form and event draft reopened blank**; `ModelApi.getSource` now reads with an explicit `responseType: "text"`, pinned by a regression test. The attachment gateway was **not** built: `db` storage has been sufficient, and the phase explicitly allows dropping it at no cost.

## Phase 7 — Production Readiness & Quality Gate

**Objective**: verify, end to end and under realistic conditions, that everything built in Phases 1–6 actually meets §13 and §14 — not just that each phase's own callouts were addressed locally. This phase exists because some things genuinely can't be verified until the system is feature-complete (a security review of how apps interact, a load test against the full surface, a usability study spanning a full persona's real workflow across apps) — it is a gate, not where hardening or polish begin.

**In scope**:
- Full security review (§13.1) across all deployed apps and `togetherflow-attachment-gateway` if it exists, using this repo's own `/security-review` process or equivalent — not just the per-phase spot checks already done.
- Load/performance testing (§13.5) against realistic multi-tenant, multi-year-of-history data volumes, not per-phase synthetic data.
- Full accessibility audit (§13.6/§14.6): screen reader pass and keyboard-only navigation across every app, not just automated linting.
- Cross-app usability study (§14.5): a persona completing a realistic multi-app workflow (e.g. an admin who models a process in Design, watches it run in Control, and a business user who works it in Work) — surfaces friction at the seams between apps that no single phase's isolated testing would catch.
- Disaster-recovery drill: confirm the rollback path (§13.3) and attachment-provider failure modes (§13.4) actually work under a simulated failure, not just on paper.
- Documentation completeness check (§13.8): operator runbooks and ADRs exist for every Open Question that was actually decided along the way.

**Dependencies**: Phases 1–6 functionally complete (or as complete as scoped — Phase 7 can run against a subset if some Design sub-scopes are intentionally deferred past this roadmap).

**Exit criteria**: no open Sev1/Sev2 finding from the security review; load test meets the performance NFRs in §8/§13.5 at target scale; accessibility audit has no WCAG 2.1 AA blocker; usability study's cross-app workflow completes without a facilitator intervention.

**Relative size**: M — mostly verification and fixing what verification finds, not new feature work, assuming the per-phase callouts above were actually followed rather than skipped and deferred here.

## Cross-Cutting Workstreams (span every phase, not owned by one)

- **i18n**: string externalization discipline starts in Phase 1 and is enforced in every phase after — retrofitting is expensive, don't defer it.
- **Accessibility**: WCAG 2.1 AA baseline (§8, §13.6) applies hardest to Work (Phase 1) since it's the daily-use app for non-technical users; Control/Design can follow a slightly more relaxed cadence but shouldn't be exempted outright.
- **Testing**: the Vitest/RTL/Playwright-against-a-real-backend approach (§8) needs to exist starting Phase 1, not bolted on later — every subsequent phase's exit criteria above assumes this harness already works.
- **Multi-tenancy**: the tenant-filter plumbing (§8) needs to be in every list/query component from the moment it's written, per Phase 0's decision — this is the other "expensive to retrofit" item alongside i18n.
- **Design system & UX consistency** (§14.2): tokens and shared components defined in Phase 0/1 are a contract every later phase must honor — a phase introducing its own one-off styling instead of extending `togetherflow-common` is technical (and visual) debt from day one.
- **Security & observability discipline** (§13.1–13.2): dependency scanning, image signing, and error tracking wired in during Phase 0/1 must stay wired in for every module added afterward — it's a baseline, not a one-time setup task.

## Risk Summary (ranked by how much they can blow up a phase's scope)

1. **CMMN canvas** (Phase 5) — the largest single unknown in this whole roadmap; unresolved, this phase's size estimate is meaningless.
2. **Forms/Event Registry backend gap** (Phase 6) — could silently turn a "frontend roadmap" phase into one with real engine-side scope.
3. **Treating §13/§14 as Phase-7-only work** — the single biggest way this roadmap could quietly stop being production-grade: if the per-phase "Production readiness / UX quality" callouts above get skipped under schedule pressure with a mental note of "Phase 7 will catch it," Phase 7 stops being a verification gate and becomes an unbounded remediation project. Treat every per-phase callout as part of that phase's actual Definition of Done.
4. **Form schema choice** (Phases 2 and 6) — picked once in Phase 2 for rendering, must hold for Phase 6's builder; a later reversal means redoing both.
5. **SharePoint delegated auth** (Phase 6, conditional) — if app-only auth turns out to be insufficient, the Shell (Phase 1) would need retroactive changes to broker a second identity provider — worth confirming Open Question 11 well before Phase 6, not during it.
