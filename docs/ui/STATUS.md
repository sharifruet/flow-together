# TogetherFlow UI — Status

**As of**: 2026-08-25. Working tree only — nothing here is committed.

Companion to [REQUIREMENTS.md](REQUIREMENTS.md) (what is required and why) and
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (how it was sequenced). This document is
the handover: what is built, what is verified, what is not, and what each remaining item
is waiting on.

It is written to be read by someone picking this up cold. Where something is unfinished or
unproven it says so plainly rather than rounding up.

---

## 1. Where the product stands

All four apps and the shared library are feature-complete against §7 apart from the items
in §4 below. The two dimensions §13 and §14 add — production readiness and finish quality —
are substantially built but **not verified end to end**; §5 is explicit about which.

| Module | Purpose | Tests |
|---|---|---|
| `togetherflow-common` | API clients, auth, design system, i18n, shell, observability | 234 |
| `togetherflow-work` | Task and case inbox | 84 |
| `togetherflow-control` | Runtime operations | 71 |
| `togetherflow-identity` | Users, groups, privileges | 41 |
| `togetherflow-design` | Model authoring across six model types | 147 |
| `togetherflow-attachment-gateway` | Optional attachment storage (Java) | 38 |
| `togetherflow-event-recorder` | Optional inbound event log (Java) | 21 |

**577 frontend tests across 59 files.** Lint, typecheck, production build and bundle
budget pass for every module; the component gallery builds. On the Java side, the
model-validation resources add 9 REST tests against a real engine, and the attachment
gateway went from 13 tests to 38; the new event recorder adds 21.

---

## 2. What changed in this pass

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
editor gains validation it never had; with no browser checks to fall back on, an
unreachable validator says the case has not been checked rather than implying it passed.

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

## 3. Verification status — read this before trusting anything

**Verified locally**: lint, typecheck, unit and component tests, production builds, bundle
budgets, gallery build, and `./mvnw -Ptogetherflow validate` for the reactor.

**Since verified, with Docker** (see §2b): all five container images build and run, and the
model-validation endpoints run against a real engine.

**Still not verified, and the reason:**

| Not verified | Why | Risk |
|---|---|---|
| The k8s manifests and the Helm chart on a cluster | No cluster here | Both are schema-validated with `kubeconform`, and the read-only-root-filesystem behaviour they depend on is now proven by running the images. Scheduling, volume binding and probe timing are still unproven |
| e2e for Identity, Control, Design | No engine wired to them | They parse and collect (12 tests) but have never executed. Treat the first CI run as their acceptance test |
| Work's extended e2e | Same | The two new keyboard tests are unrun; the five pre-existing ones passed before this pass |
| Visual regression | Baselines are darwin-generated | Cannot gate on linux — see §4 |
| SharePoint attachment provider | Needs an Azure tenant | Unchanged as an end-to-end gap, but no longer untested — see §2b |
| The event recorder against a live engine | No running engine with a broker-backed channel | Its 20 tests drive the `InboundEventProcessor` directly. That **replacing the processor on a running engine records real traffic** is unproven — as is the startup window, where events arriving before the swap go unrecorded. Exercise it against a real JMS/Kafka/RabbitMQ channel before relying on it |

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
- **CMMN**: draggable sentry placement, align, copy-paste, and auto-layout for models
  arriving without CMMNDI.
- **Version diffing** — deliberately absent. A real BPMN diff is a graph comparison; a text
  diff of serialised XML would mostly report attribute reordering.

### Phase 7 verification

Three of the five are now addressed as far as they can be without people or a production
environment. The other two need humans and are named as such rather than quietly dropped.

| Item | State |
|---|---|
| **Load testing** | **Harness built**, `qa/load/` — a seeder that populates an engine over its public REST API, plus k6 scenarios for Work's inbox and Control's operational screens, with thresholds that fail the run. Verified end to end at a smoke profile against a real engine. **No full-volume baseline has been produced**, so nothing here is yet known to be fast or slow at realistic volume. Run it on Postgres at your own volume — that is the remaining work, and it is a run, not a build |
| **Security review** | **Partial.** No findings across the model-validation resources, the attachment gateway and the frontend client. `togetherflow-event-recorder` and the Control event-registry screens were **not** reviewed, and the recorder has a known cross-tenant read issue. Detail and scope below |
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
those were written in parallel and were never in the reviewed set. To be exact rather than
merely careful: **the event recorder has had no security review at all**, not just none from
this one. It is a new module that persists inbound event payloads and serves them over a new
HTTP endpoint, and one authorization gap in it is already known (recorded at the end of this
section). Reviewing it is outstanding work, not a formality.

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

Three issues are noted here and are **not** cleared, because they sit outside the reviewed
diff. All three have the same shape — an endpoint trusting a caller-supplied identifier:

- **`togetherflow-event-recorder` reads across tenants.** `GET /event-recorder/events` takes
  `tenantId` as a query parameter and filters on it with no server-side enforcement, and the
  filter is skipped when the parameter is absent — so an authenticated caller who simply
  omits it receives **every tenant's** recorded payloads. Control sends the active tenant;
  nothing requires a caller to. §13.1 is explicit that server-side enforcement must sit
  behind UI-side hiding, and here there is none. Single-tenant deployments are unaffected.
  Enforcing it properly needs the host application's interceptor, which is outside the
  module; until then the mitigations are `store-payload: false`, or not deploying the
  recorder. Documented in the module README and ADR 0015. **Decide this before enabling the
  recorder on a multi-tenant deployment.** (Query parameters are properly bound, so there is
  no injection issue — only an authorization one.)
- `AttachmentController.upload` performs no check tying the caller to the `taskId` they
  upload against. Anyone who can reach the gateway can write into any task's folder.
  Pre-existing. The gateway's README already states it does not authenticate callers and
  must sit behind the same ingress and auth as the apps — this is what that sentence means
  in practice.
- `sharepoint.folder-path` is not run through the segment sanitiser. It is operator
  configuration rather than user input, so it is config-injects-config, but a folder path
  containing `..` would traverse within the drive.

The first of those is the argument for reviewing the recorder properly rather than assuming
this section covers it.

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
   and `npm run e2e` per module). Expect selector fixes in the three new suites. This is the
   largest thing still unexercised.
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

One lesson from this pass, found four separate times. **A check that never runs reports
nothing:**

- the four app images had never been built;
- `org.togetherflow` had no `import-control.xml` entry, so both Java modules had never been
  checkstyled;
- neither Java module's tests ran in CI at all — the frontend matrix is frontend-only and
  the release workflow only ever ran `package -DskipTests`, so 58 tests executed on nobody's
  machine but their authors';
- the load harness's own `run.sh` reported success when a run had failed.

Every one of them found real defects the first time it actually ran. All four are now
closed. When something here is recorded as "verified", check which command proved it.
