# TogetherFlow — Enterprise Parity Plan

Status: Draft v1 · Written 2026-08-27
Companion to [REQUIREMENTS.md](REQUIREMENTS.md) (scope), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
(how Phases 1–7 were sequenced), [STATUS.md](STATUS.md) (what is built) and
[UI_POLISH_BACKLOG.md](UI_POLISH_BACKLOG.md) (the finish-quality and Enterprise-Design gap
analyses this plan sequences).

**Scope decisions taken before writing** — recorded here because they change the plan's
shape and should not have to be re-derived:

- **All four apps** — Work, Control, Identity and Design — against Flowable Work, Control,
  Design and IDM-within-Hub. Not Design alone.
- **Backend work is in scope.** Workspaces, design-time permissions, model locking and Git
  connectivity cannot be built against this repo's REST surface as it stands, and they are
  the largest structural differences from the Enterprise product.

## 1. What "like the Enterprise version" has to mean

Left undefined, this is unfalsifiable — Flowable Design alone lists twenty-one model types,
most of which no engine in this fork can execute. So the target is stated on three axes,
and the plan closes them in that order:

1. **Finish quality** — does each screen read as a finished product? Routing, a real
   component set, dense-data tables, icons, information architecture. This is
   [UI_POLISH_BACKLOG.md §A–G](UI_POLISH_BACKLOG.md), and it is what makes all four apps
   feel enterprise-grade at once. **Nothing else in this plan is worth doing first.**
2. **Product depth** — do the apps do what Flowable's apps do, for the models this fork's
   engines actually execute? Task details as tabs, save-without-complete, ad-hoc tasks,
   instance migration with a mapping editor, form-builder parity, model relations,
   templates.
3. **Structural model** — workspaces, design-time permissions, Git connectivity, a data
   model behind form bindings. These are product decisions with engine-side cost, and they
   are what separate "a good BPM UI" from "the Enterprise product's shape".

**What this plan does not promise.** Axis 3 in full is a multi-quarter effort with backend
work in every phase. Axis 1 and 2 are achievable on ordinary engineering timescales and
deliver most of the perceived difference. If only part of this gets built, build it in the
order below rather than picking the most visible items from the bottom.

## 2. Sources

The Enterprise behaviour targeted below is read from Flowable's own documentation, not
inferred: [React Modeler introduction](https://documentation.flowable.com/latest/reactmodel/react-modeler-introduction),
[General Concepts](https://documentation.flowable.com/latest/reactmodel/general-design-concepts),
[Form Editor](https://documentation.flowable.com/latest/reactmodel/user/design/form-editor),
[App Editor](https://documentation.flowable.com/latest/reactmodel/user/design/app-editor),
[Git Panel](https://documentation.flowable.com/latest/reactmodel/git-connectivity/reference/git-panel),
[Model Templates](https://documentation.flowable.com/latest/reactmodel/model-templates),
[Work user guide](https://documentation.flowable.com/latest/user/work/),
[Work — Tasks](https://documentation.flowable.com/latest/user/work/work-tasks),
[Control user guide](https://documentation.flowable.com/latest/user/control/).

Two caveats on that reading: several editor pages 404 (`process-editor`,
`model-versioning`), so BPMN/CMMN editor chrome is inferred from the Form Editor page's
description of the *shared* menu bar; and the Work and Control introductions are thin, so
those phases carry an explicit discovery step rather than pretending to a full inventory.

---

## Phase E0 — Decisions and one bug

Nothing below starts cleanly until these are settled. Unlike the rest of the plan, E0 is
short and mostly not code.

**E0.1 — Fix concurrent-edit data loss first.** *(This is a defect, not parity work, and it
is the only item in this plan that should jump every queue.)* `ModelApi.saveSource` PUTs
unconditionally while the editors autosave every four idle seconds, so two people on one
model overwrite each other repeatedly without either pressing Save. Ship the client-side
guard now — re-read `lastUpdateTime` before each autosave, refuse on a change, offer
reload-or-overwrite — and treat real server-side locking as part of E5.
**Size: S. Blocks: nothing. Do it this week.**

**E0.2 — Decide the routing library** (blocks E1, and therefore everything).

**E0.3 — Decide whether workspaces are a `metaInfo` convention or new engine surface.**
This is the single most expensive decision in the plan; E5 cannot be estimated until it
lands. Do not start E5 work on the assumption it will be cheap.

**E0.4 — Confirm the Control and Work discovery steps' findings** (E2.0, E3.0) before
committing their phase scope.

---

## Phase E1 — Foundations (all four apps)

**Objective**: the four apps stop reading as prototypes. This is the phase that changes the
most for the least, and every later phase is cheaper afterwards.

**In scope** — [UI_POLISH_BACKLOG.md §A–C](UI_POLISH_BACKLOG.md), in its stated order:

- **F1 routing** — URLs for every screen and entity, so tasks, instances, jobs and models
  can be linked, bookmarked and reopened. Enterprise's whole navigation model assumes this.
- **F5 shell CSS de-duplication**, **F3 tokens**, **F4 the typeface that was never shipped**.
- **F2 component set** — first tranche: `Badge`, `Card`, `PageHeader`, `Modal` (with the
  focus trap F6 needs), `Tabs`, `Avatar`, `DropdownMenu`, `Breadcrumb`.
- **C1 `DataTable` rebuild** — sortable headers, selection with a bulk-action bar, row
  overflow menus, column visibility and density, sticky header and first column,
  virtualization. Control and Work both live in this component.
- **C2 pagination**, **C3 badges everywhere**, **C4 the icon set and empty-state
  illustrations**.
- **B1 sidebar navigation** for Control, Design and Identity — Flowable Control's own
  navigation is a left sidebar with tabbed sections, and ours is a row of text buttons.
- **B2 page headers**, **B3 nav counts**, **B5 full-height layout**.

**Dependencies**: E0.2.
**Exit criteria**: every screen in all four apps has a URL that survives a refresh; no app
stylesheet defines a component class; the gallery documents every new primitive; visual
baselines regenerated for all four apps (G1) rather than Work alone.
**Size: XL.** This is the largest phase in the plan and the one most likely to be
under-estimated — it touches every screen in four apps.

---

## Phase E2 — Control parity

**Objective**: an operator can do in TogetherFlow Control what they can do in Flowable
Control, for the engines this fork ships.

**E2.0 — Discovery (do first).** The Control introduction names capabilities without
detailing them, and this repo's Control app has not been read closely against them. Before
scoping, confirm which of these this fork's REST surface supports: instance migration with
a mapping definition, editing a running instance's variables, moving execution state,
rich filtering by variable value and business key. Each that is supported becomes scope;
each that is not becomes a documented gap. **Size: S.**

**In scope, subject to E2.0:**

- **Left-sidebar tabbed navigation** (delivered by B1 in E1; Control is where it matters
  most, at ~15 destinations).
- **Process instance migration with a mapping editor**, not just the batch list that
  results from one. Batches and batch parts already exist.
- **Editing a running instance's variables**, and changing execution state where the REST
  layer allows it.
- **Read-only mode for non-admin users** — Flowable Control degrades to read-only rather
  than showing actions that will be rejected. Ours gates the app, not the actions. Pairs
  with §13.1's requirement that the server enforce what the UI hides.
- **Rich filters**: date ranges, variable values, business key, across instance and job
  queries; saved as views (§14.4 machinery already exists).
- **Bulk actions beyond dead-letter jobs** — E1's `DataTable` selection makes this a
  per-screen wiring job rather than a rebuild.
- **Dashboard tiles** built from `total` on existing paged queries — REQUIREMENTS §9 rules
  out an aggregation API, so keep these modest and say what they are.

**Explicitly out**: multi-engine cluster management and search-index pages. One engine, one
datasource, no Elasticsearch — the same reasoning §9 applies to Hub.

**Dependencies**: E1 (tables, sidebar, badges).
**Exit criteria**: an operator can migrate an instance, retry a job in bulk, edit a
variable and filter by it, all from Control, with e2e coverage per §8.
**Size: L.**

---

## Phase E3 — Work parity

**Objective**: the daily-use app matches Flowable Work's task experience.

**E3.0 — Discovery (do first).** The Work user guide is thin; read the Tasks, Documents and
Details Panel pages properly and inventory against our screens before scoping. **Size: S.**

**In scope:**

- **Task detail as tabs, not one long panel.** Flowable Work uses Task (the form), People,
  Subtasks and Documents. Ours stacks every section vertically. Uses E1's `Tabs`.
- **Save without completing.** Flowable Work's default outcomes are Complete *and* Save —
  Save persists form data and leaves the task open. We have no equivalent, so a
  half-finished form is lost on navigation. This is the most-missed everyday affordance in
  the list.
- **Status ribbon** on the task detail — grey assigned/no due date, yellow future or
  unassigned, red overdue. We tone the due-date cell only.
- **Filter set parity**: For me / Unassigned / Open / **Completed** / **All**. We have
  three of five; Completed and All are missing.
- **Their sort order**: due date ascending, then priority descending, then created
  descending; completed tasks by completion date descending. Ours is a fixed due-date sort.
- **Editable due date** with a picker on the detail — ours is read-only in the facts list.
- **Ad-hoc task creation** ("New → Task": name, assignee, due date, description). This
  fork's `TaskCollectionResource` supports it; nothing in our UI does.
- **People tab**: add and remove involved users and candidates by search — pairs with
  **D1 user chips**, which this phase should deliver (avatars and display names instead of
  raw ids, everywhere in Work and Control).
- **Documents tab**: metadata and content types on upload. Folder hierarchy is *out* —
  it needs a content engine this distribution does not ship, and saying so beats a
  half-folder view.
- **A Reports/overview screen**, built from paged-query counts, matching §9's constraint.

**Dependencies**: E1. D1 (user chips) is delivered here and consumed by E2.
**Exit criteria**: golden path plus save-without-complete, ad-hoc task creation and the two
new filters, all e2e-covered; no screen in Work renders a raw user id.
**Size: L.**

---

## Phase E4 — Design parity, part 1 (no new backend)

**Objective**: close every Enterprise-Design gap that this fork's existing REST surface can
already support. [UI_POLISH_BACKLOG.md §I.1](UI_POLISH_BACKLOG.md) is the item list; this
is its sequencing.

**In scope, in this order:**

1. **I2 + I3 — form builder parity.** Cheapest real distance, because the runtime half
   already exists: the renderer handles 19 field types and the palette offers 11; the
   renderer reads nine `params` constraints plus `layout.colspan` and the properties panel
   sets none of them. Add the missing eight types, a Data Entry / Selection / Display /
   Container palette grouping, drag-and-drop onto the canvas, the twelve-slot row grid, and
   properties for every constraint the renderer already honours.
2. **I8 — shared editor menu bar** across BPMN, CMMN, DMN, Form, Event and App editors:
   save, validate, undo/redo, export, gridlines/snap toggle, revisions. Absorbs **E2** and
   **E3** from the polish backlog (editor toolbar, sectioned properties panel).
3. **I4 — model relations.** "Uses" and "Used by", derived by parsing stored sources; a
   delete that would break a reference says so.
4. **I5 — model templates.** A flag in `metaInfo`, a picker in the create dialog.
5. **I6 — app export/import as ZIP**, with clash handling (warn/stop, update existing,
   create new keys). The `fflate` zipping already exists for deployment.
6. **I7 — app editor depth**: tags, display order, theme, revisions that can be reverted,
   copied, published and downloaded independently.
7. **E4/I9 — model library IA**: card view with the thumbnails the engine already stores,
   tags, sorting, grouping.

**Dependencies**: E1. E0.1 must already be in.
**Exit criteria**: a citizen developer can author, from the UI alone, every form the
renderer can render; no editor has a bespoke toolbar; deleting a referenced model warns.
**Size: L.**

---

## Phase E5 — Workspaces and design-time permissions *(backend)*

**Objective**: adopt Enterprise's structural model — Workspaces → Apps → Models — and the
permission model that goes with it.

**This phase is a product decision before it is an engineering one.** Flowable Design gives
each user a default workspace, supports a shared workspace of reusable models, public and
private visibility, workspace/app-scoped roles (owner, modeler, reader), tenant-wide global
roles, and additive custom roles. This fork has one flat model repository; `category` is
already spent on model kind and `tenantId` on tenancy.

**In scope:**

- **Backend**: a workspace concept with real server-side enforcement, and per-model /
  per-app authorization on `/repository/models` — today anyone who can open Design can
  delete anything in it, which §13.1 explicitly forbids relying on the UI to prevent.
- **Server-side model locking**, superseding E0.1's client-side guard, plus the "Unlock
  Models" escape hatch Enterprise provides for when a lock outlives its holder.
- **Frontend**: workspace switcher in the shell, workspace and app membership screens,
  move-app-between-workspaces, shared-workspace linking.
- **Identity**: the roles UI lands here, since design-time roles are the first thing that
  needs it. This is where TogetherFlow Identity grows past IDM CRUD.

**Dependencies**: E0.3 decided. E1 for the shell work.
**Exit criteria**: a model cannot be edited or deleted by someone without the role, proven
by a test that calls the REST resource directly rather than through the UI.
**Size: XL, with roughly half of it Java.** Estimate only after E0.3.

---

## Phase E6 — Git connectivity *(backend)*

**Objective**: apps can live in source control, the way Enterprise's do.

**In scope**: connection setup (provider, repository URL, branch, monorepo sub-path); a Git
panel in the app view showing branch, sync status and last sync; commit, pull, revert,
create/switch branch, create PR, stash and restore; a changed-model list with per-model
diffs and add/modify/remove classification; disconnect that leaves local models intact.

**Note on diffs**: [REQUIREMENTS §7.4.1](REQUIREMENTS.md) deliberately excluded model
diffing on the grounds that a text diff of serialised BPMN mostly reports attribute
reordering. That reasoning still holds for the *editor*; a Git panel needs at minimum a
source diff, and should be honest that it is a text diff rather than a graph comparison.

**Dependencies**: E5 (apps must be a real container before they can be a repository unit).
**Size: XL, mostly Java.**

---

## Phase E7 — Data model, bindings and runtime preview

**Objective**: the remaining depth gaps from [§I.2](UI_POLISH_BACKLOG.md).

- **App-level variables and a data model** — Enterprise binds form fields to a data model
  with `{{expression}}` bindings and scope prefixes, and defines app variables in
  value/default-value modes. Ours names variables as free text and hopes they match. This
  is what makes the form builder feel authored rather than typed.
- **Runtime preview** — start a process or case from Design against a scratch tenant and
  watch it run. §H's form preview is the only preview that exists today.
- **Per-model translations** — ADR 0013's layer translates the UI; nothing translates model
  content, and Enterprise translates labels inside component settings with per-app
  export/import.

**Dependencies**: E4 (builder), E5 (apps as containers).
**Size: L.**

---

## Phase E8 — Verification gate

Not a feature phase. The things that only make sense once the above is built, mirroring
IMPLEMENTATION_PLAN.md's Phase 7 rather than replacing it:

- **G1** — visual regression across all four apps, light and dark, desktop and tablet.
  Today it is Work only, three screens, and the baselines predate features already shipped.
- **G2** — keyboard-only and screen-reader passes per app; automated axe coverage is not
  the same thing.
- **G3** — a usability pass per persona (§14.5), which has no evidence of ever running.
- Load testing Control's tables and Design's save/deploy path against realistic volumes
  (§13.5).

**Size: M.**

---

## Sequencing summary

| Phase | Title | Depends on | Size | Backend? |
|---|---|---|---|---|
| **E0.1** | Concurrent-edit guard *(defect)* | — | S | no |
| E0 | Remaining decisions | — | S | — |
| **E1** | Foundations, all four apps | E0.2 | XL | no |
| E2 | Control parity | E1 | L | no |
| E3 | Work parity | E1 | L | no |
| E4 | Design parity, part 1 | E1 | L | no |
| E5 | Workspaces + permissions | E0.3, E1 | XL | **yes** |
| E6 | Git connectivity | E5 | XL | **yes** |
| E7 | Data model, preview, translations | E4, E5 | L | some |
| E8 | Verification gate | all | M | no |

E2, E3 and E4 are independent of each other and can run in parallel once E1 lands. E5 and
E6 are strictly sequential and strictly after a decision.

## Explicitly not building

Extends [REQUIREMENTS §9](REQUIREMENTS.md) and [§I.3](UI_POLISH_BACKLOG.md). No engine in
this fork executes these, so a UI for them would be a UI over nothing: **AI Agent**,
**Knowledge Base**, **Service Registry**, **Master Data**, **SLA**, **Security Policy**,
**Sequences**, **Queries**, **Action**, **Content models**, **Data Objects**, **Variable
Extractors**, **Dashboard components**, **Plugins**, **Pages / FlowApps**, **Palette
definitions**, the **model generator / connectors** (OpenAPI3, Swagger, Salesforce),
**multi-engine cluster management**, **search-index administration**, and **Hub**,
**Engage** and **Inspect**.

Document rather than silently omit: a reader comparing the two products' navigation should
be able to tell absence-by-decision from absence-by-oversight.

## Risks, ranked

1. **E1 is under-estimated.** Retrofitting routing and rebuilding the table component
   touches every screen in four apps. It is the phase most likely to be quietly descoped
   into "routing for Work only", which would leave the product in a worse, half-converted
   state than either end.
2. **E0.3 is treated as a formality.** If workspaces are adopted as a `metaInfo` convention
   to avoid engine work, the permission model in E5 has nothing to enforce against and
   §13.1 stays unmet — a UI that hides what the server still allows.
3. **Parity is pursued by feature count.** Flowable Design lists twenty-one model types;
   copying the *list* rather than the *shape* produces empty editors over absent engines.
   The "not building" section exists to keep this decision made.
4. **E5/E6 start before E1–E4 finish.** They are the most interesting work and the least
   valuable per unit effort until the apps they sit in feel finished.
5. **The visual baselines stay stale** (G1), so E1's gains erode silently across E2–E7.
