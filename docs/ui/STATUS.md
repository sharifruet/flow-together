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
| `togetherflow-common` | API clients, auth, design system, i18n, shell, observability | 224 |
| `togetherflow-work` | Task and case inbox | 84 |
| `togetherflow-control` | Runtime operations | 62 |
| `togetherflow-identity` | Users, groups, privileges | 41 |
| `togetherflow-design` | Model authoring across six model types | 147 |
| `togetherflow-attachment-gateway` | Optional attachment storage (Java) | (pre-existing) |

**558 frontend tests across 57 files.** Lint, typecheck, production build and bundle
budget pass for every module; the component gallery builds.

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

## 3. Verification status — read this before trusting anything

**Verified locally**: lint, typecheck, unit and component tests, production builds, bundle
budgets, gallery build, and `./mvnw -Ptogetherflow validate` for the reactor.

**Not verified, and the reason:**

| Not verified | Why | Risk |
|---|---|---|
| **The four app container images** | No Docker daemon in this environment | **Highest.** All four Dockerfiles, entrypoints and nginx configs were changed to move `config.js` to `/tmp/togetherflow` so the root filesystem can be read-only. That path is exercised by nothing but a real container start. **Build and run one image before merging.** |
| The attachment gateway image | Same | New Dockerfile, never built |
| The new k8s manifests | No cluster | Never applied; the volume mounts in particular assume the image change above works |
| e2e for Identity, Control, Design | No engine to run against | They parse and collect (12 tests) but have never executed. Treat the first CI run as their acceptance test |
| Work's extended e2e | Same | The two new keyboard tests are unrun; the five pre-existing ones passed before this pass |
| Visual regression | Baselines are darwin-generated | Cannot gate on linux — see §4 |
| SharePoint attachment provider | Needs an Azure tenant | Pre-existing gap, unchanged |

Nothing in this pass has been exercised against a running Flowable engine.

---

## 4. What remains

### Blocked on something this environment lacks

| Item | Blocked on |
|---|---|
| **Visual-regression gating** (§14.5) | Linux baselines regenerated in the Playwright container. The CI job already runs in that container and names the exact command; deleting one `continue-on-error` line finishes it. Needs Docker. |
| **Server-side model validation** (§7.4.2) | `flowable-process-validation` has no REST endpoint. Needs new backend surface — scope it as engine work, not frontend. |
| **Helm chart entries** (§13.3) | `k8s/flowable` lives on the `flowable-helm` branch and does not exist on `main`. |
| **SharePoint verification** (§7.6) | An Azure AD tenant, app registration and SharePoint site. |

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

### Verification work never done (Phase 7)

Load testing at realistic history volume; a manual accessibility audit (screen reader and
keyboard-only — automated axe is in CI, which §13.6 treats as only half); usability testing
with the real personas, which no phase ever did despite being a per-phase requirement; the
full security review; and the DR drill.

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
| 11 | Ratify SharePoint app-only auth | Built app-only; SharePoint sees the gateway, not the end user. May not satisfy an audit requirement |
| 12 | SharePoint target scope — one site, or per tenant | Affects the config schema |

---

## 6. If you are picking this up

1. **Build and run one app image first.** It is the largest unverified change and the one
   most likely to be broken.
2. Run the e2e suites against a real engine (`docker run -p 8080:8080 flowable/flowable-rest`
   and `npm run e2e` per module). Expect selector fixes in the three new suites.
3. Regenerate visual baselines in the Playwright container and delete the
   `continue-on-error` in `.github/workflows/togetherflow-ui.yml`.
4. Read [OPERATIONS.md](OPERATIONS.md) before configuring a deployment — particularly the
   failure-modes table, which encodes several things that cost real time to discover.
