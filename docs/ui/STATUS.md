# TogetherFlow UI — Status

**As of**: 2026-08-27. Working tree only — nothing here is committed.

Companion to [REQUIREMENTS.md](REQUIREMENTS.md) (what is required and why),
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (how Phases 1–7 were sequenced) and
[ENTERPRISE_PARITY_PLAN.md](ENTERPRISE_PARITY_PLAN.md) (how the parity work is chunked).
This document is the handover: what is built, what is verified, what is not, and what each
remaining item is waiting on.

It is written to be read by someone picking this up cold. Where something is unfinished or
unproven it says so plainly rather than rounding up.

---

## 1. Where the product stands

All four apps and the shared library are feature-complete against §7 apart from the items
in §4 below. The two dimensions §13 and §14 add — production readiness and finish quality —
are substantially built but **not verified end to end**; §5 is explicit about which.

| Module | Purpose | Tests |
|---|---|---|
| `togetherflow-common` | API clients, auth, design system, routing, i18n, shell, observability | 403 |
| `togetherflow-work` | Task and case inbox | 85 |
| `togetherflow-control` | Runtime operations | 80 |
| `togetherflow-identity` | Users, groups, privileges | 41 |
| `togetherflow-design` | Model authoring across six model types | 560 |
| `togetherflow-attachment-gateway` | Optional attachment storage (Java) | 38 |
| `togetherflow-event-recorder` | Optional inbound event log (Java) | 36 |

**1,169 frontend tests** (954 before Wave 1, 1,131 after it). Lint, typecheck, production build and
bundle budget pass for every module; the component gallery builds. On the Java side, the
model-validation resources add 9 REST tests against a real engine, and the attachment
gateway went from 13 tests to 38; the new event recorder adds 36.

**Visual regression is the one check that is not currently checking anything** — the suites
exist for all four apps and CI runs them, but no baseline images are committed. See §2's
Wave 1 note.

---

## 2. What changed in this pass

### Wave 1 of the enterprise-parity plan (2026-08-27)

[ENTERPRISE_PARITY_PLAN.md](ENTERPRISE_PARITY_PLAN.md)'s W1.1–W1.5 — the foundation chunk.
[UI_POLISH_BACKLOG.md §J](UI_POLISH_BACKLOG.md) is the item-by-item record; in summary:

- **A data-loss defect is fixed.** Six editors autosaved every four idle seconds against an
  unconditional PUT, so two people on one model overwrote each other with neither pressing
  Save. `ModelApi.saveSource` now compares the stored source against what this browser last
  read or wrote and refuses the write, with a reload-or-overwrite prompt. It narrows the
  window rather than closing it — the read and the write are still two requests — and a
  true fix needs the server-side locking in W3.1.
- **All four apps have URLs** ([ADR 0016](adr/0016-in-house-router.md), an in-house router).
  Tasks, cases, instances, deployments, users and models are linkable; filters, sort and
  page are in the query string; Back closes a detail pane instead of leaving the app.
- **The design system went from 8 primitives to 19**, with the typeface actually shipped,
  a complete token set enforced by a test that reads every stylesheet in every module, one
  modal that owns focus trap/restore/scroll-lock/inert, ~55 icons and six empty-state
  illustrations.
- **816 lines of duplicated shell CSS** — byte-identical across the four app stylesheets —
  became one file in `togetherflow-common`.
- **`DataTable` was rebuilt**: server-driven sortable headers, selection with a bulk bar,
  row action menus, column/density preferences, sticky header and first column, and
  virtualization above 60 rows. Control, Design and Identity gained a left rail with
  section counts; every list screen has a page header.

**What is not done in Wave 1, and is not hidden:** no visual-regression baselines are
committed for any app. The suites, the configs and the CI matrix are in place for all four,
light and dark; the images are not, because the machine this was built on is macOS 12 and
Playwright 1.62 refuses to install a browser for it. The stale Work baselines were deleted
rather than left to report false regressions against a UI they no longer resemble. One
`--update-snapshots` run in the pinned container finishes it — the procedure is in
`modules/togetherflow-work/src/main/frontend/e2e/visual/README.md`. Until then the `visual`
CI job stays `continue-on-error`, which means it cannot fail, which means it is not yet a
check.

### Wave 2 of the enterprise-parity plan (2026-08-27)

W2.1–W2.3, the product-depth chunk. [UI_POLISH_BACKLOG.md §K](UI_POLISH_BACKLOG.md) is the
item-by-item record and [WAVE2_DISCOVERY.md](WAVE2_DISCOVERY.md) holds the two discovery
steps' findings. In summary:

- **Control** gained instance migration with a mapping editor (validate-then-migrate,
  never collapsed), editable instance variables, execution moves, business-key/date-range/
  variable-value filters that reach the URL, transactional bulk delete, an overview screen,
  and read-only degradation for non-admins.
- **Work** gained a four-tab task detail, save-without-complete, a status ribbon, the two
  missing filters (which query the historic resource, since a finished task has no runtime
  row), an editable due date, ad-hoc task creation, a People tab, and user chips in place of
  raw ids.
- **Design** gained all 19 renderable field types in a grouped palette with every
  constraint the renderer honours, one shared editor menu bar across all six editors,
  model relations, templates, app ZIP export with clash handling, app editor depth, and a
  card-view library.

**Two things Wave 2 could not do, and did not fake:**

- **Flowable Work's three-level task sort.** `TaskBaseResource` exposes a single `sort`
  property with no secondary key. Sorting the fetched page in the browser was rejected —
  it reorders 25 rows and says nothing true about the other 4,000, and puts the wrong 25 on
  page one. Work ships the single-column server sort; closing this properly is engine work.
- **One-to-many and many-to-one migration mappings**, and the pre/post-upgrade script
  hooks. The first needs a diagram-level editor to be comprehensible; the second executes
  arbitrary code server-side and does not belong behind a free-text box in an operations
  console. Both are recorded in the discovery doc rather than left as silent omissions.

Two bundle budgets were raised (Work and Control, 114/112 → 120 kB gzipped), each with the
growth accounted for in its `bundle-budget.json`.

### The earlier cross-cutting pass

An audit against the requirements found the functional scope (§7) largely delivered but
the cross-cutting requirements (§8, §13, §14) treated as aspirational — which is exactly
the risk IMPLEMENTATION_PLAN.md ranked third ("treating §13/§14 as Phase-7-only work").

### Cross-cutting requirements that had not been built

- **i18n (§8).** There was no i18n layer at all; every string in five modules was inline,
  despite the requirement saying "from day one" and the plan warning that retrofitting
  would be expensive. An in-house layer now lives in `togetherflow-common`
  ([ADR 0013](adr/0013-in-house-i18n.md)) and **every module's strings are externalized**
  (~900), with dates and relative times following the active locale. Enforced: a
  per-app conformance test fails on a typo'd key, a dead key, or a locale that drifts.
  **Only `en` ships** — the machinery is complete, nothing is translated.
- **Resilience and crash handling (§13.2, §13.4).** The API client had no timeout and no
  retry, so a hung connection was an endless spinner; a single render throw unmounted the
  app and left a white page. Both fixed, with a React error boundary and a
  transport-agnostic error sink ([ADR 0014](adr/0014-resilience-and-error-reporting.md)).
  Retry is scoped to safe methods only — a rejected task completion is never replayed.
- **Core Web Vitals (§13.5).** LCP, CLS, INP and TTFB from real sessions, through the same
  sink as errors.
- **Keyboard shortcuts (§14.4).** Work had section navigation only; Control had nothing.
  Both now register bindings through a shared registry, so the `?` help dialog is generated
  from the handlers rather than maintained beside them.
- **Saved filters (§14.4).** Absent everywhere. Now in Work's inbox and Control's instance
  and job queries — both places the requirement names.
- **Component gallery (§14.2).** The design system had no documented state gallery. Built
  as a small in-house page (`npm run gallery` in `togetherflow-common`), with coverage
  enforced against the filesystem so a new shared component cannot ship undocumented.
- **Compliance (§13.7).** Retention is visible in Control; Identity can export what the
  identity store holds about a person; the delete confirmation states plainly that
  deleting a user is **not** an erasure.

### Functional gaps closed

- **§7.1 inbox filters** — process definition, due-date band and priority band were
  specified and missing.
- **§7.4.2 / §7.4.3 modeller coverage** — execution and task listeners, multi-instance
  configuration and boundary-event/timer settings were not editable, so a citizen
  developer had to leave and hand-edit XML. CMMN gained **exit criteria**, which the model
  layer had round-tripped all along with nothing able to author one.
- **§7.4.1 model version history** — Design wrote `version: 1` forever. Built on the
  engine's *native* model versioning (`version` / `latestVersion` on
  `ModelCollectionResource`) rather than a side table.

### Structural fixes

- **The shell was four copies.** `LoginScreen.tsx` was byte-identical across all four apps
  and `AppShell.tsx` near-identical — exactly what §7.5 forbids. Both now live in
  `togetherflow-common`, with `AppRoot` owning the provider stack each `main.tsx` had
  duplicated.
- **The IDM contract was unguarded.** `flowable-idm-rest` is not covered by the engine's
  spec generation, so a spec was hand-authored at
  `docs/public-api/references/openapi/idm/` and wired into the same codegen and
  contract-drift check as every other engine.

### Deployment and CI

- Kubernetes manifests for all five modules, with liveness/readiness probes and a
  read-only root filesystem. **This required moving `config.js` out of the docroot** —
  see the risk in §3.
- The release workflow built and signed **one of four** images; it now covers every app
  plus the attachment gateway, which had no Dockerfile at all.
- CI gained bundle budgets, axe-core accessibility tests, and e2e jobs for all four apps
  against a real engine service container.

### Two defects found by building something that checked

- **`axe-core` leaked into every production bundle.** Exporting the a11y test helper from
  the package index put ~500 kB in all four apps — Work went 94 kB → 251 kB gzipped. The
  bundle budget added minutes earlier caught it. Moved to a subpath export.
- **Versioning would have wiped the undo stack.** The first version-history design copied
  content forward into a new row, which changes the draft's id, which makes the editor
  re-import and discard undo history on every deploy. Redesigned to archive backward.

---

## 2b. The pass that had Docker

Everything in §3's old "not verified" table was blocked on there being no Docker daemon.
There is one now, so the four items that only needed it were done.

### The images had never built — and neither had CI

All five images were built, and all five run. Getting there needed a fix, and the fix is
the interesting part:

**Every one of the four SPA Dockerfiles failed on the first build**, identically. The app
build runs `tsc --noEmit`, which reaches `@togetherflow/common/testing/a11y` through the
app's own a11y test, which imports `axe-core`. npm installs `togetherflow-common` as a
`file:` dependency — a symlink — and TypeScript resolves a symlink to its real path, so
imports *inside* common resolve against **common's** `node_modules`, not the app's. The
Dockerfiles only ever installed the app's. `axe-core` was therefore unresolvable no matter
that it sits in all five `package.json` and all five lockfiles.

The same gap was in CI: `verify`, `e2e` and `visual` all install only the matrix module's
dependencies, so the four apps' typecheck and build steps had the same hole. All four
Dockerfiles and all three CI jobs now install common's dependencies first.

This also explains the local "5 suites, 0 tests" a11y failure, which had been written off
as a stale working tree. It was not the tree: `npm ci` in `togetherflow-common` fixes all
five at once, because it is the only `node_modules` that resolution can reach.

**What running them proved.** Each image was run with `--read-only`, `--cap-drop ALL` and
tmpfs at the three paths the k8s manifests mount, i.e. the deployment shape rather than a
convenient one. All four serve `/healthz`, generate `/config.js` from the environment into
`/tmp/togetherflow` outside the docroot, serve it with `Cache-Control: no-store`, return
`index.html` for an unknown deep link, and set the CSP and frame/sniff/referrer headers.
The attachment gateway starts as its non-root `togetherflow` user, reports its provider on
`/attachments/health`, and completes a real upload/download round trip into its mounted
volume. The `config.js`-outside-the-docroot change — §3's "highest risk" item — is proven.

### Server-side model validation (§7.4.2, §7.4.3)

The last piece of §7.4.2 that needed backend surface. `POST /repository/model-validation`
(`flowable-rest`) and `POST /cmmn-repository/model-validation` (`flowable-cmmn-rest`) run
the engine's own `ProcessValidator` and `CaseValidator` over submitted XML, deploying
nothing and storing nothing. Nine REST tests against a real engine, including an assertion
that a rejected model creates no deployment.

Design uses them: the BPMN editor merges the engine's verdict with its browser checks and
labels which side reported what, so the panel no longer has to say "passing here doesn't
guarantee the engine will accept the model" — when the engine answered, it does. The CMMN
editor does the same, over browser checks written to be **disjoint** from the engine's:
`CaseValidator` reports four problems in total, so the browser side covers what it does not
look at — a process or case task naming nothing to start, a timer with no expression, an
HTTP task missing `requestUrl`, a criterion that waits for nothing. Two checkers reporting
the same problem in two wordings is how a validation panel stops being read.

New REST surface in a fork is divergence, so it was kept to what it has to be: one resource
class per engine over a capability the engine already has, no schema change, no new
deployable. The specs under `docs/public-api` are generated from annotations by a separate
tool and were **not** regenerated — the two endpoints are missing from the published spec,
which is the one loose end here.

### Helm chart (§13.3)

`k8s/flowable/togetherflow` — the `charts_dir` that `helm-release.yml` already points at,
and which did not exist on `main`. Covers the four apps (one template over a map, not four
near-identical files), the optional gateway with its own storage, ingress, service account,
and an off-by-default NetworkPolicy. `k8s/resources/*.yaml` stays as the plain-manifest path.

A new CI job lints the chart and schema-validates both the chart and the plain manifests
with `kubeconform`, rendering the chart twice — defaults, and every option enabled, since a
conditional template that only breaks when its feature is on is exactly what a
defaults-only render misses. 31 resources validate clean.

Note the chart still will not publish: `helm-release.yml` triggers only on the
`flowable-helm` branch. Releasing it needs that branch to carry this chart, or a trigger
change — a decision, not an oversight.

### SharePoint (§7.6, Open Questions 11 and 12)

Both questions are now answered in REQUIREMENTS.md rather than left open. App-only auth is
ratified, with the consequence stated where someone will read it: SharePoint's audit log
attributes every upload to the service identity, so "SharePoint must record which person
uploaded this" is a requirement app-only does not meet. Site scope resolved as one
library per gateway, because a per-tenant library implies per-tenant credentials and one
gateway holding all of them is a much larger blast radius than a config change.

Still unverifiable without an Azure tenant, so it got the next best thing: a contract-level
suite against a stubbed Graph pinning the token grant, upload URL, headers and body, plus
token caching, expiry, and a new retry on a rejected token. **Writing it found a real
defect**: the upload path was expanded as a single URI variable, so Graph's
`root:/folder/file:` addressing went out with `%2F` instead of literal separators — the
integration would have failed on its first real upload. Also hardened: a
`max-file-size-bytes` above Graph's 250 MB simple-upload ceiling is refused at startup
rather than mid-upload. The gateway went from 13 tests to 38.

### One thing this pass did not fix

`kind` is not installed and no cluster was stood up, so the manifests and chart are
schema-valid and unapplied. That is the largest remaining gap in §13.3.

## 2c. The inbound event log (§7.2)

§7.2 asked Control for "inbound event instances received on a channel
(`EventInstanceCollectionResource`)", and §12 listed it as an outstanding Control-side
view. **It was never frontend work.** That resource is `POST`-only — it *sends* an event —
and the event registry engine persists repository state only, so no record of what arrived
has ever existed to query. The requirement had been unbuildable for as long as it had been
written down, and every document except IMPLEMENTATION_PLAN.md and OPERATIONS.md described
it as pending UI.

Corrected in REQUIREMENTS.md (§5, §7.2, §12), then **built** as
`togetherflow-event-recorder` — an optional module rather than a change to the engine's
versioned schema, which would have meant DDL for six dialects, an upgrade step each, a
`FlowableVersions` entry, and permanent divergence from upstream for a feature upstream
does not have. See [ADR 0015](adr/0015-inbound-event-log.md).

**The obvious seam does not work, which is the part worth knowing.**
`EventRegistryEventConsumer` is what the registry advertises for observers and is what
Open Question 13 originally proposed. A consumer is handed an `EventInstance`, which
carries the event key, tenant and payload but **no channel** — the channel is known to
`DefaultInboundEventProcessor` and dropped before consumers are called. Since the
requirement is events received *on a channel*, that rules it out. The recorder installs
itself as the `InboundEventProcessor` instead, which sees the channel, the raw payload and
the outcome — including the two cases a consumer never observes: a payload that resolved
to no event (`UNRESOLVED`) and one the pipeline rejected (`FAILED`). `UNRESOLVED` is the
row that justifies the module: "nothing happened" otherwise has two indistinguishable
causes.

Control gained a **Received** tab that appears only where the recorder is deployed. An
absent feed and an empty feed mean different things, and a permanently empty table would
tell an operator no events arrived when in truth nothing was watching.

Off by default at three gates, own table outside the engine's schema, retention of seven
days, and `store-payload: false` for deployments that want arrivals without contents
(§13.7). 21 Java tests, 14 new frontend tests.

### Also fixed here: checkstyle had never run on any TogetherFlow Java module

`import-control.xml`'s root covers all of `org`, and only the `flowable` and `activiti`
subpackages grant imports — so **every import in every `org.togetherflow` class was a
violation**. Nobody saw it because checkstyle binds to `verify` and this reactor had only
ever been run to `validate`. Both Java modules now pass `verify` clean.

---

## 2d. CMMN: checks that can fail

The case modeller had a validation panel fed by one source — `POST /cmmn-repository/model-validation`,
which runs the engine's `CaseValidator`. That validator reports **four** problems in total, so
"no problems found" meant very little, and it cost a round trip so it could not run while
someone was typing.

**Browser checks, deliberately disjoint from the engine's** (`validateCmmn.ts`). None of the
engine's four are repeated — two checkers reporting the same problem in two wordings is how a
validation panel stops being read. What is covered instead is what the engine does not look
at, most of it learned by watching cases deploy cleanly and then fail at runtime: duplicate
ids (which make the document unparseable, reported by the schema in terms of neither element),
a process or case task naming nothing to start, a timer with no expression, a service task
with no implementation, an HTTP task missing `requestUrl`/`requestMethod`, an empty stage, a
criterion that waits for nothing, a trigger with no source. These run on every edit, debounced,
and the panel badges each problem with which side reported it.

**Markers on the canvas.** A list of problems the reader has to match back to the diagram by
name is a much weaker thing than the diagram showing them. Engine problems name the definition
id while the canvas keys shapes by plan-item id, so both are resolved; an element carrying an
error and a warning is drawn as an error. Colour is not the only signal — stroke width carries
it too (§13.6).

**A source view**, matching BPMN's. This editor deliberately preserves things it cannot itself
author — case file items, unknown extension elements, `flowable:` attributes with no field in
the panel — so a round trip loses nothing. Being able to read the output is how that claim gets
checked without deploying. Opening it also stops the editor's keyboard shortcuts, because
Backspace behind an open dialog was deleting the selected element where nobody could see it.

**A schema-validity test** (`schemaValidity.test.ts`). The most useful thing built here. It
runs the repository's own `CMMN11.xsd` over documents this serialiser produced, because the
schema gate is stricter than both the parser and `CaseValidator`, and this editor had already
shipped four documents that parsed fine and could not be deployed: `<serviceTask>` (the schema
defines `<task>`), `<completionNeutralRule>` (in no schema at all), an `eventType` attribute in
the CMMN namespace (`anyAttribute` there is `##other`), and item-control rules in the wrong
order. Both of the two reproducible ones were reintroduced to confirm the test fails on them.
There is no skip-if-missing path — it fails when `xmllint` is absent, and CI installs
`libxml2-utils`, because a check that quietly does not run is how all four reached a deploy.

Design is at 296 tests.

---

## 2e. The event recorder, reviewed

The module was flagged in §2b's security review as **entirely unreviewed** — a new module
persisting inbound event payloads behind a new HTTP endpoint, with one authorization gap
already known. It has now been read end to end, all 947 lines. Five findings; four were real.

**1 — no tenant boundary, and no authorization anywhere in the module (high).** `tenantId`
was a filter the *caller* chose. Omitting it returned every tenant's rows, payloads and all,
to anyone the host application had authenticated — so the leak was the request that supplied
nothing, which is also the request a curious browser makes. Control always sent the active
tenant, but that value came from a client-side setting, and the UI is not a boundary.

Fixed by making the module ask rather than guess. `EventRecorderTenantResolver` is a
one-method interface the host implements over whatever principal it already has; under the
default `tenant-scope=strict` every query is filtered to what it returns, a disagreeing
`tenantId` is refused with `403` rather than quietly narrowed, and a resolver that returns
`null` refuses the request instead of widening it. **Enabling the recorder without a resolver
now fails startup**, with a message naming the two ways out. A single-tenant deployment
writes `tenant-scope=single-tenant` and keeps the old behaviour.

The shape of that decision is the point. This module has no Spring Security dependency and
cannot know how the host authenticates, so the options were to guess, to document and hope,
or to refuse to start until told. Documenting and hoping is what was already in place, and it
is what left the gap open.

**2 — `store-payload: false` did not stop payload content being stored (medium).** On a
rejected event the exception message went into `ERROR_`, and the stock pipeline throws
`"No event model found for event key " + eventKey` — where on a JSON channel that key is read
straight out of the body. The one control offered for "record the arrival, not the contents"
was bypassed on exactly the rows most likely to hold malformed personal data. Payload
suppression now covers the message too, keeping the exception's class name only.

**3 — a misconfiguration silently disabled the whole feature (low).** `max-payload-length`
defaults to 4000, which is also the width of `PAYLOAD_`. Set it higher and every insert
overflowed the column, the best-effort `catch` swallowed the failure, and the recorder looked
enabled while the table stayed empty. Refused at construction now, as the table name already
was. Same shape as §6's lesson, arrived at from the other direction: not a check that never
ran, but a feature that never ran and reported nothing.

**4 — was wrong.** Negative `start`/`size` were reported as reaching SQL. They do not:
`EventRecordQuery`'s compact constructor already clamps both. The review missed it; the guard
added for it was removed again rather than left in to look like a second defence.

**5 — a null guard contradicted two lines later (low).** `channelModel` was null-checked for
its key, then dereferenced unconditionally for its pipeline. Removed, with a note saying why.

21 tests to 36. Each of the tenant tests was run against the previous controller first and
each failed, including the one that matters — a resolver that cannot identify the caller
answered `200` with every tenant's rows where it now answers `403`. Findings 2 and 3 were
verified the same way.

**Still not reviewed:** the Control event-registry screens.

---

## 2f. CMMN: everything the engine reads

An audit of `flowable-cmmn-converter` against the case panel, because "you can draw it but
you cannot configure it" was still true of most of the palette. The panel bound 18
attributes; the engine reads about 40 more, and the palette had 10 kinds where the engine
has 21.

Nothing was being **lost** — the model round-trips whatever it does not understand — so this
was purely an authoring gap. A milestone, for one, had none of its four attributes reachable.

**P0 — the missing attributes.** `documentation` on every element; the five execution
attributes on every task (`isBlockingExpression`, `async`, `exclusive`, `asyncLeave`,
`asyncLeaveExclusive`); business-key and deployment behaviour on process and case tasks; the
human task's own variables; all four milestone attributes; the stage's overview attributes;
`availableCondition`; `exitEventType`; and all six repetition variables, which had
round-tripped since repetition was added without a repeating item ever being able to name the
collection it repeats over.

These come from a declarative table, not 25 hand-written boxes, because a misspelt attribute
is invisible: it is written, it round-trips, the schema accepts it — unknown
foreign-namespace attributes are legal — the case deploys, and the setting silently does
nothing. `attributeCoverage.test.ts` checks every name against `CmmnXmlConstants.java`. The
names are not guessable: the blocking override is `isBlockingExpression`, and CMMN's service
task result is `resultVariableName` where BPMN's is `resultVariable`, a difference that
already shipped once as a bug.

**P1 and P2 — eleven kinds.** Script, HTTP, mail, external worker, case page and send event
tasks; the signal, variable, intent and reactivate event listeners; and the plan fragment.
None of the first ten is its own element — Flowable's specialised tasks are all `<task>` with
a `flowable:type`, its typed listeners all `<eventListener>` with a `flowable:eventType` — so
the discriminator is derived from the element's type on the way out and stripped on the way
in, and the two cannot drift into a task that draws as one kind and deploys as another.

Their configuration is mostly field injections rather than attributes, and the engine does
not tell you the names: a misspelt `requestMethods` is ignored and the case fails when an
instance reaches it. Each typed task now names its own fields, taken from the engine's
delegates.

Also: `<defaultControl>` (the item control on the definition rather than the plan item) and
`<planItemStartTrigger>` (what starts a timer, as opposed to when it fires — "three days
after the review completes" rather than "three days after the case begins").

**Two things deliberately not built.**

*Text annotations and associations.* Both are declared in the CMMN 1.1 schema and appear in
**no content model** — not `tCase`, not `tStage`. Verified by putting one in each and running
`xmllint`; both fail. `CmmnDeployer.validateXml()` schema-validates every new deployment
unless `disableCmmnXmlValidation` is set, so an annotated case could not be deployed. Flowable
has converters for them, which is the fifth instance of its parser being more permissive than
the gate in front of it.

*The case file model.* Schema-valid — `tCase` does allow `caseFileModel` — but `caseFileItem`
appears nowhere in Flowable outside the XSD itself: no converter, no model class, no engine
support. An editor for it would produce configuration that looks meaningful and does nothing.
It is preserved on round trip and left alone. `caseFileItemOnPart` in sentries is unbuildable
for the same reason.

**Three bugs found by writing the tests.**

- `firstByLocalName` searches *descendants*, so a case took the first task's
  `<documentation>` as its own, and a stage absorbed its first child task's
  `extensionElements` and `timerExpression` — then serialised them onto itself, duplicating
  every field injection in the case onto the stage containing it. Additive rather than
  lossy, which is why "keeps everything it had" passed.
- Plan fragments do not declare their own definitions: `tPlanFragment` has `planItem` and
  `sentry` and no `planItemDefinition`, so a task inside a fragment is defined by the
  enclosing stage. Resolving against the immediate container only dropped the task from the
  diagram entirely.
- `xsi:schemaLocation`, `exporter` and `exporterVersion` on `<definitions>` were dropped on
  every save. Found by running the round-trip suite against the engine's own converter
  fixtures rather than only the four repository files, which happen to carry none of them.

**And it deploys.** The schema check above is the gate a deployment runs *first*, and it is
a real one — four earlier versions of this serialiser produced documents it rejected. But the
parser and `CaseValidator` run after it, and neither is exercised by validating XML in a
browser toolchain. So the kitchen-sink case is checked in at
`modules/flowable-cmmn-engine/src/test/resources/org/flowable/cmmn/test/togetherflow/design-kitchen-sink.cmmn`
and `TogetherFlowGeneratedCaseTest` deploys it into a real engine — in the default build, not
behind a profile, because a check that does not run reports nothing.

It asserts more than "it deployed". A plan item definition the parser does not recognise is
*skipped* rather than refused, so a wrong `flowable:` discriminator gives a case that
validates, deploys, and quietly contains a plain `Task` doing nothing. The test therefore
checks the class the parser actually built for each of the twenty-one kinds, and that the
settings were read onto it — the script's body and language, the worker's topic, the page's
form and icon, the signal's ref, the variable listener's change type, the timer's start
trigger. `schemaValidity.test.ts` fails if the checked-in file drifts from what the
serialiser now writes, so the two sides cannot start testing different cases; regenerate with
`TF_WRITE_FIXTURE=1` and commit, so a change to the output is reviewed rather than absorbed.

296 tests to 493 in Design, plus 4 in `flowable-cmmn-engine`. `assets/index` budget 72 → 78 kB: the
new labels are user-facing copy in the catalogue every app loads at startup.

---

## 2g. CMMN: the canvas

The authoring layer was finished in §2f; what was left was diagram ergonomics, and the gap
is structural rather than oversight. The BPMN editor gets its editing behaviour free from
`bpmn-js`'s Modeler — context pad, direct label editing, copy/paste, bendpoints,
align/distribute, keyboard move, search. The CMMN canvas is hand-written SVG, because no
maintained equivalent exists: `cmmn-js` was never finished. REQUIREMENTS §7.4.3 has called
that the largest unknown in the document since it was written, and it still is.

Four things closed here, chosen as the ones a person hits in the first minute:

**Auto-layout for a case with no CMMNDI.** Diagram interchange is optional and hand-written
`.cmmn` files routinely have none; every element then landed on the same coordinate — one
visible shape with the rest underneath, which reads as an empty case rather than an undrawn
one. OPERATIONS listed it as a known non-fault, which it was, and a dead end, which it should
not have been. There is no flow to lay out — a plan model is a bag of plan items and its
sentry graph is frequently cyclic — so this packs rows inside each container, sizing
containers bottom-up to hold what is in them. Only when the document has **no** shapes at
all: a partially drawn file keeps what its author placed.

**Renaming in place.** Double-click a shape. Renaming was panel-only, which meant selecting
a shape, crossing the screen, and coming back, for the most common edit there is.

**Copy, cut, paste and duplicate.** The risk here is not the shape failing to appear, it is
the copy being subtly wrong: `id` is `xsd:ID`, so a repeat makes the document unparseable; a
sentry copied with a reference to the *original* turns the copy into a remote control for
what it was copied from, which deploys perfectly and behaves absurdly; and a criterion left
with no on-parts guards something unreachable. Ids are regenerated throughout, references
inside the copied set are rewired to the copies, and references leaving it are dropped rather
than left aimed at the original. A copied stage brings its contents, since a stage without
them is a different shape.

**Arrow-key nudge**, by the grid the canvas snaps to — Shift for five steps, Alt for one
pixel, for the case where the grid is the problem.

**A bug the tests found:** a click that moved nothing still committed, so every click on a
shape pushed an identical model onto the undo stack. Looking at ten elements cost ten presses
of Cmd-Z before undoing anything real — the exact opposite of what the code comment beside it
claimed to protect.

**Still open on the canvas**, in rough order of what a person notices: a context pad (hover a
shape, add a connected element — the single biggest speed difference against bpmn-js),
align/distribute for multi-selection, changing an element's type without deleting and
redrawing it, a minimap (BPMN has one), CMMNEdge output for connections drawn here (they
carry no DI, so another tool will not draw the line), and bendpoints.

**Also missing, and wider than CMMN:** Design registers nothing with the shared shortcut
system — both editors use raw `keydown` handlers — so it has no shortcut help anywhere, and
the bindings above are only discoverable by convention. That is a Design-wide item, not a
CMMN one.

493 tests to 524. `assets/CmmnEditor` budget 12 → 14 kB, which is code rather than copy and
sits in the lazily loaded chunk where it belongs.

---

## 3. Verification status — read this before trusting anything

**Verified locally**: lint, typecheck, unit and component tests, production builds, bundle
budgets, gallery build, and `./mvnw -Ptogetherflow validate` for the reactor.

**Since verified, with Docker** (see §2b): all five container images build and run, and the
model-validation endpoints run against a real engine.

**Since verified, against a real CMMN engine** (see §2d and §2f): the XML Design's CMMN
serialiser produces passes `xmllint --schema CMMN11.xsd` — for a case using every element
type and every authorable feature, and for each of the four repository CMMN files
re-serialised — and that same case **deploys**, in `flowable-cmmn-engine`'s own test harness,
with each of its twenty-one kinds parsed into the model class the engine's behaviour uses.
Schema, parser and `CaseValidator`, all three.

**Still not verified, and the reason:**

| Not verified | Why | Risk |
|---|---|---|
| The k8s manifests and the Helm chart on a cluster | No cluster here | Both are schema-validated with `kubeconform`, and the read-only-root-filesystem behaviour they depend on is now proven by running the images. Scheduling, volume binding and probe timing are still unproven |
| e2e for Identity, Control, Design | No engine wired to them | They parse and collect but have never executed, and two Design selectors were already wrong (§6). Design's CMMN path additionally needs an engine with **CMMN REST** and this fork's validation resources — stock `flowable/flowable-rest` has neither, so it cannot be run against the image the README names. Treat the first real run as their acceptance test |
| Work's extended e2e | Same | The two new keyboard tests are unrun; the five pre-existing ones passed before this pass |
| Visual regression | Baselines are darwin-generated | Cannot gate on linux — see §4 |
| SharePoint attachment provider | Needs an Azure tenant | Unchanged as an end-to-end gap, but no longer untested — see §2b |
| The event recorder against a live engine | No running engine with a broker-backed channel | Its tests drive the `InboundEventProcessor` directly. That **replacing the processor on a running engine records real traffic** is unproven — as is the startup window, where events arriving before the swap go unrecorded. Exercise it against a real JMS/Kafka/RabbitMQ channel before relying on it |

---

## 4. What remains

### Blocked on something this environment lacks

| Item | Blocked on |
|---|---|
| **Visual-regression gating** (§14.5) | Linux baselines regenerated in the Playwright container. The CI job already runs in that container and names the exact command; deleting one `continue-on-error` line finishes it. Docker is available now, so this is unblocked and simply not yet done. |
| ~~**Server-side model validation** (§7.4.2)~~ | **Built** — see §2b. Both engines have a `model-validation` resource and Design uses them. |
| ~~**Helm chart entries** (§13.3)~~ | **Built** — `k8s/flowable/togetherflow`, see §2b. What remains is a *publishing* decision: `helm-release.yml` only fires on the `flowable-helm` branch, so the chart on `main` is never released. |
| **Applying the manifests or chart to a cluster** (§13.3) | A cluster. `kind` is not installed here. Both are schema-valid; nothing has been scheduled. |
| **SharePoint end-to-end verification** (§7.6) | An Azure AD tenant, app registration and SharePoint site. The auth model and site scope are no longer open questions, and the provider is now covered against a stubbed Graph — see §2b. |
| **The two validation endpoints in the published OpenAPI specs** | The specs under `docs/public-api` are generated from annotations by `tools/flowable-oas-generator`, which was not run. Regenerating produces a whole-spec diff, so it wants doing deliberately rather than folded into this. |

### Needs a product decision before building

- **Instance migration and change-state (§7.2).** The last large specified-but-absent
  surface. The client wrappers exist; no screen does. The decision to settle first is
  whether migration is a guided per-activity mapping or a bulk "move everything to the
  latest version" with a validation report — building it without settling that probably
  means building it twice.

### Smaller, unblocked

- **Visual regression coverage** beyond Work (§14.5) — the gallery now gives the component
  library real screens to shoot.
- **Form properties in the BPMN panel.** A model carrying them keeps them, but this editor
  cannot author one. Low priority: forms are authored in the form builder and bound by form
  key.
- **Boundary events other than timers** get the interrupting toggle but no expression
  editor; error/signal/message reference a process-level definition, which is separate
  scope.
- **CMMN canvas**: context pad, align/distribute, type morphing, minimap, CMMNEdge output
  and bendpoints — see §2g, which also records what was closed and why the gap exists.
- **CMMN text annotations, associations and the case file model** — *not* a backlog item.
  The first two are in no content model in the CMMN 1.1 schema and cannot be deployed; the
  third is schema-valid but Flowable implements none of it. Both are recorded in §2f so
  nobody re-derives them.
- **Version diffing** — deliberately absent. A real BPMN diff is a graph comparison; a text
  diff of serialised XML would mostly report attribute reordering.

### Phase 7 verification

Three of the five are now addressed as far as they can be without people or a production
environment. The other two need humans and are named as such rather than quietly dropped.

| Item | State |
|---|---|
| **Load testing** | **Harness built**, `qa/load/` — a seeder that populates an engine over its public REST API, plus k6 scenarios for Work's inbox and Control's operational screens, with thresholds that fail the run. Verified end to end at a smoke profile against a real engine. **No full-volume baseline has been produced**, so nothing here is yet known to be fast or slow at realistic volume. Run it on Postgres at your own volume — that is the remaining work, and it is a run, not a build |
| **Security review** | **Partial.** No findings across the model-validation resources, the attachment gateway and the frontend client. The event recorder has since been reviewed separately (§2e) and its cross-tenant read is fixed. The Control event-registry screens remain unreviewed. Detail and scope below |
| **DR drill** | **Runbook written**, [OPERATIONS.md §8b](OPERATIONS.md) — what holds state, RPO/RTO targets, and a step-by-step drill whose verification order is designed to catch a database-only backup. **Never executed.** Treat the first run as a test of the runbook as much as of the system |
| **Manual accessibility audit** | **Not done, and not automatable.** Automated axe is in CI and covers roughly the machine-checkable third of WCAG; §13.6 is explicit that this is half the requirement. Needs a screen reader and a keyboard-only pass by a person |
| **Usability testing with the real personas** | **Not done.** A per-phase requirement no phase ever met. Needs actual business users, process owners, operators and citizen developers |

On load testing, one thing worth knowing before reading any number it produces: the default
harness run uses H2, which is in-process and does not share a query planner with any
database you would deploy on. It answers "does the harness work"; it does not answer "will
this be fast". `--postgres` exists for that reason.

#### Security review — what was examined

**Scope, stated precisely, because it is narrower than "this pass".** The review covered the
two model-validation resources, the attachment gateway, and the frontend API client changes.
It did **not** cover `togetherflow-event-recorder` or the Control event-registry screens —
those were written in parallel and were never in the reviewed set.

**The recorder has since been reviewed on its own** (§2e). Five findings, four real; the
authorization gap recorded at the end of this section is closed. The Control event-registry
screens remain unreviewed.

Within that scope: **no findings**, with each claim traced into the engine source rather than
taken from a comment. What was checked, so the next reviewer knows what has already been
ruled out:

- **XXE, entity expansion, external DTD and schema fetch** on the two new validation
  endpoints, which accept arbitrary XML from any authenticated caller. `BpmnXMLConverter`
  and `CmmnXmlConverter` disable external entities, DTD support and external DTD/schema
  access *unconditionally*, on the same `XMLInputFactory` they then parse with. Safe.
- **SSRF** through BPMN `<import location="...">`. `ImportParser` stores the location as a
  string; resolution happens at deployment, which these endpoints never reach.
- **Authorization.** Both endpoints sit behind the servlet's normal chain
  (`hasAuthority(PRIVILEGE_ACCESS_REST_API)`, or `authenticated()` where that is disabled) —
  not reachable anonymously. They read no stored row and create nothing, so they expose no
  data a caller could not obtain by running the validator locally.
- **Error-response leakage.** `ErrorInfo` serialises `getLocalizedMessage()` only — no stack
  trace, no cause chain, no class name.
- **Path traversal and URL-structure injection** in the SharePoint upload path, with both
  `taskId` and `fileName` treated as fully attacker-controlled. `safeSegment` and
  `URLEncoder` compose so that only `[A-Za-z0-9._-]` survives unencoded — in particular the
  `:` that delimits Graph's `root:<path>:` addressing cannot be reached, so the path cannot
  be terminated early to target a different Graph action.
- **The new 401 retry**: same URI, same operator-configured host, same bytes — no token
  reaches anywhere the first request did not.
- **Client-secret handling**: present only as a form field in the token POST; never in a URI,
  an exception message or a log.
- **`retry: true` on the validation POST.** Confirmed the client really can replay it, and
  confirmed both endpoints are side-effect-free, so replay is harmless.
- **XSS**: no `dangerouslySetInnerHTML` or `innerHTML` in Design or common, so engine-supplied
  validation text is rendered as text.

One change came out of it. The two resources pass `enableSafeXml` as **true** even though it
is unreachable while `validateSchema` is `false`: the false/false combination is the single
branch that reads the document through a reader the converter has not hardened, so anyone
who later turns schema validation on inherits the safe path rather than that one.

Three issues were noted here as outside the reviewed diff. All three had the same shape —
an endpoint trusting a caller-supplied identifier. The first is now **fixed** (§2e); the
other two stand:

- ~~**`togetherflow-event-recorder` reads across tenants.**~~ **Fixed.** `GET
  /event-recorder/events` no longer takes the caller's word for `tenantId`. See §2e.
- `AttachmentController.upload` performs no check tying the caller to the `taskId` they
  upload against. Anyone who can reach the gateway can write into any task's folder.
  Pre-existing. The gateway's README already states it does not authenticate callers and
  must sit behind the same ingress and auth as the apps — this is what that sentence means
  in practice.
- `sharepoint.folder-path` is not run through the segment sanitiser. It is operator
  configuration rather than user input, so it is config-injects-config, but a folder path
  containing `..` would traverse within the drive.

Both remaining ones are in the attachment gateway, whose README already says it authenticates
nobody and must sit behind the same ingress and auth as the apps. That sentence is what these
two look like in practice; neither is closed by writing it down.

### Translation

The i18n machinery is complete and every string is externalized, but **only `en` exists**.
Adding a locale is additive — a sibling catalogue with the same keys — and the shell's
language picker appears by itself once more than one is present.

---

## 5. Open decisions (§11)

| # | Question | Note |
|---|---|---|
| 5 | Priority order across Work / Control / Identity | Retrospective now; everything is built |
| 8 | Model library IA — one unified library, or per-type nav | Still one library |
| ~~11~~ | ~~Ratify SharePoint app-only auth~~ | **Ratified: app-only.** The consequence is now written down rather than left implicit — SharePoint's audit log attributes every upload to the service identity, so a "which person uploaded this" audit requirement is not met and needs delegated auth, which is not built |
| ~~12~~ | ~~SharePoint target scope — one site, or per tenant~~ | **Resolved: one library per gateway.** A per-tenant library implies per-tenant credentials; one gateway holding all of them is a much larger blast radius than running a gateway per tenant |
| ~~13~~ | ~~Inbound event log — decline, add to the engine, or an optional recorder module~~ | **Resolved: optional module, and built.** `togetherflow-event-recorder` ([ADR 0015](adr/0015-inbound-event-log.md)). REQUIREMENTS.md §7.2 and §12 used to read as though Control still owed a "received events" feed; it never did, because `EventInstanceCollectionResource` is POST-only and the engine records nothing. Both now say so |

---

## 6. If you are picking this up

Run `npm ci` in `modules/togetherflow-common/src/main/frontend` first, whatever else you do.
Nothing else resolves `axe-core`, so without it five a11y suites collect zero tests and four
typechecks fail — see §2b.

1. Run the e2e suites against a real engine (`docker run -p 8080:8080 flowable/flowable-rest`
   and `npm run e2e` per module). Expect more selector fixes. This is the largest thing still
   unexercised. **Design's CMMN spec needs a different engine**: stock `flowable/flowable-rest`
   serves no `cmmn-repository/*` at all and does not carry this fork's two validation
   resources, so that path needs `flowable-app-rest` built from this branch. That build is the
   real cost of item 1, and it is why the spec was fixed by reading rather than by running.
2. Regenerate visual baselines in the Playwright container and delete the
   `continue-on-error` in `.github/workflows/togetherflow-ui.yml`. Docker makes this
   possible now; it is the one-line change that turns a check which cannot fail into one
   that can.
3. Stand up a `kind` cluster and apply either `k8s/resources/` or the chart. Both are
   schema-valid and neither has been scheduled.
4. Decide how the Helm chart gets published — `helm-release.yml` fires only on the
   `flowable-helm` branch, so the chart on `main` is currently released by nothing.
5. Read [OPERATIONS.md](OPERATIONS.md) before configuring a deployment — particularly the
   failure-modes table, which encodes several things that cost real time to discover.

One lesson from this pass, found five separate times. **A check that never runs reports
nothing:**

- the four app images had never been built;
- `org.togetherflow` had no `import-control.xml` entry, so both Java modules had never been
  checkstyled;
- neither Java module's tests ran in CI at all — the frontend matrix is frontend-only and
  the release workflow only ever ran `package -DskipTests`, so 58 tests executed on nobody's
  machine but their authors';
- the load harness's own `run.sh` reported success when a run had failed;
- Design's e2e spec has never been run, and two of its selectors never matched anything —
  `/^create$/` against a button reading "Create and open", `/^xml$/` against one reading
  "BPMN XML". Both are fixed by reading, which is not the same as fixed by running. Item 1
  below is still open.

Every one of them found real defects the first time it actually ran, and the fifth found
them without running at all. When something here is recorded as "verified", check which
command proved it.
