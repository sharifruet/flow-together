# TogetherFlow UI — Finish-Quality Gap Analysis and Backlog

**As of**: 2026-08-27. Companion to [REQUIREMENTS.md](REQUIREMENTS.md) §14 (UI/UX Quality &
Completion Standard) and [STATUS.md](STATUS.md).

## Method

Read, not assumed: `togetherflow-common`'s tokens/primitives (`theme/tokens.css`,
`theme/components.css`, `components/*.tsx`), the shell (`shell/AppFrame.tsx`), each app's
`App.tsx` and per-app stylesheet, representative screens (Work's `TaskInbox`/`TaskDetail`,
Control's `Jobs`, Design's `BpmnEditor`), package manifests, and the checked-in Playwright
visual baselines under `togetherflow-work/src/main/frontend/e2e/visual/`.

## Progress

**Forms — done (2026-08-27).** The form stack has been through this pass end to end: see
[§H](#h-forms--completed) for what changed and which items below it closes.

**Wave 1 — done (2026-08-27).** [ENTERPRISE_PARITY_PLAN.md](ENTERPRISE_PARITY_PLAN.md)'s
W1.1–W1.5. This closes **F1, F2, F3, F4, F5, F6, B1, B2, B3, B5, C1, C2, C3, C4** and
**I1**, and delivers the `UserChip` primitive **D1** asks for (Work's inbox and Identity's
user list use it; the remaining screens are W2.1/W2.2). What is still open in §A–C is
**B4** (⌘K palette) and **F7–F10**, which were never in Wave 1's scope. See
[§J](#j-wave-1--completed) for what changed and how each item was closed.

## Verdict

*Written before Wave 1; kept as the record of what the pass was answering. §J says what
changed.*

The apps are **functionally deep and visually shallow**. §7's feature scope is largely
there; §13's hardening is largely there. What reads as "basic" is a presentation layer
built from eight primitives, no icon system, no routing, and four copies of the shell
stylesheet. The two highest-leverage items — **routing (F1)** and **design-system depth
(F2)** — are not polish; everything else in this document is cheaper once they land.

Evidence, from the checked-in `inbox-desktop` baseline: a 1440×900 viewport where content
occupies the top 340px and the rest is empty grey; priority rendered as the bare words
"High"/"Normal"; assignee rendered as the raw id `alice`; column headers with no sort
affordance; a comment box in monospace; and no icon anywhere on the screen except the
brand mark.

---

## A. Foundations

### F1 — Introduce real routing. *(highest leverage, blocks A/B/C polish)*
**Gap.** No router in any app. `togetherflow-work/src/main/frontend/src/App.tsx` holds
`useState<WorkView>("inbox")` and `useState<TaskResponse>()`; Control, Identity and Design
do the same. No `react-router` (or equivalent) in any `package.json`.

**Consequences, all user-visible.** A task, instance, job, deployment or model cannot be
linked to or bookmarked. Browser Back exits the app instead of closing a detail pane. A
refresh drops the user at the default view with filters cleared. "Open in new tab" on a
row is impossible. Support and ops cannot paste "look at this instance" into a ticket.

**Do.** Adopt a router in `togetherflow-common` and export a thin routing shell.
URL-encode: view, selected entity id, active filters, page offset, and the tenant. Keep
`AppFrame`'s nav items as links (`<a href>`) so middle-click and copy-link work.
**Accept when**: every screen in all four apps has a distinct URL; a deep link to a task,
instance and model restores the same screen after a hard refresh; Back closes a detail
pane rather than leaving the app.

### F2 — Grow the shared component library from 8 primitives to a real set.
**Gap.** `togetherflow-common/src/components` ships `Brand, Button, ConfirmDialog,
DataTable, Field, SavedViews, ShellMenu, ShortcutHelp, States, Toast` — plus
`ErrorBoundary`. Everything else is re-invented per app in CSS: `.tf-panel` in
`control.css` and `identity.css`, `.tf-chip` in `work.css`, `.tf-toolbar`, `.tf-detail`,
`.tf-badge`. §14.2 requires one documented system, not a grab-bag.

**Missing primitives** (each currently hand-rolled or absent): `Badge`/`StatusPill`,
`Card`/`Panel`, `PageHeader` (title + description + primary action), `Tabs`, `Modal`
(generic — see F6), `Drawer`/`Sheet`, `DropdownMenu`, `Tooltip`, `Breadcrumb`, `Avatar`,
`UserChip` (see D1), `Select`, `Checkbox`/`Radio`/`Switch`, `DateInput`, `Alert`/`Banner`,
`CodeBlock`/`JsonViewer` (Control shows raw payloads and stack traces), `SplitPane`,
`DescriptionList` (the created/due metadata block), `Timeline` (task audit log, plan-item
history), `Spinner`, `ProgressBar`.
**Accept when**: no app stylesheet defines a component class; the gallery documents each
new primitive's default/hover/focus/active/disabled/loading/error states, enforced by the
existing filesystem coverage check.

### F3 — Complete the token set.
**Gap.** `tokens.css` covers color, spacing, type sizes, radius and three shadows. Absent:
motion (durations/easings — `components.css` hardcodes `0.12s ease`), a z-index scale
(`20/30/60/70/100` are literals scattered across five files), breakpoints (media queries
use `520/620/640/700/860/900/1024/1100`, inconsistently between apps), line-height,
font-weight, and border-width. The type ramp tops out at 26px, which is why no screen has
a real headline.
**Accept when**: no raw z-index, duration or breakpoint literal remains outside
`tokens.css`; every app's media queries reference the same named breakpoints.

### F4 — Ship the typeface, or stop naming it.
**Gap.** `--tf-font` leads with `"Inter"`, but no `@font-face`, no font file in any
`public/`, no stylesheet link in any `index.html`. Every user sees the system fallback, so
the type the design was tuned for has never rendered.
**Do.** Either self-host Inter (subset, `woff2`, `font-display: swap`, preloaded — matters
for the CLS metric already being collected) or drop it from the stack and tune the scale
for the system font. Self-hosting is preferred: it also removes a third-party origin from
the CSP in §13.1.
**Accept when**: the rendered font matches the token, offline, with no layout shift on
load.

### F5 — De-duplicate the shell stylesheet. *(regression against §7.5)*
**Gap.** `AppShell.tsx`/`LoginScreen.tsx` were centralised into `togetherflow-common`, but
their **CSS was not**. Lines 1–204 of `work.css`, `control.css`, `identity.css` and
`design.css` are byte-identical: `.tf-skip-link`, `.tf-shell*`, `.tf-menu*`, `.tf-login*`.
This is exactly the drift §7.5 says must have one implementation — a shell restyle today
is a four-file edit that will silently diverge on the first one that gets missed.
**Do.** Move that block into `togetherflow-common/src/theme/`, imported by
`AppRoot`. **Accept when**: `grep -l "tf-shell__header" **/styles/*.css` returns nothing.

### F6 — One real modal, with a focus trap.
**Gap.** `ConfirmDialog` focuses the confirm button and closes on Escape, but has **no
focus trap** (Tab walks straight into the page behind), no focus restore on close, no body
scroll lock, and leaves the background exposed to assistive tech (no `inert`/
`aria-hidden`). Other dialogs — e.g. Work's delegate dialog at `TaskDetail.tsx:606` — hand-
roll `.tf-dialog` markup rather than reusing it, so the behaviour differs per dialog.
**Accept when**: one `Modal` primitive owns trap/restore/scroll-lock/`inert`;
`ConfirmDialog` is built on it; no screen writes `.tf-dialog` markup directly; an axe +
keyboard test covers the trap.

---

## B. Shell and information architecture

### B1 — The header is the whole IA.
**Gap.** `AppFrame` renders brand · app name · a row of unstyled text buttons · tenant
select · avatar menu. There is no sidebar, no grouping, no section iconography, and for
Control (7 top-level areas, each with sub-tables) a flat button row is the wrong control.
**Do.** A collapsible left rail for the desktop-first apps (Control, Design, Identity) with
icons + labels and grouped sections; keep the top bar for Work, which has four
destinations. Persist the collapsed state per user.

### B2 — No page headers.
**Gap.** Screens open straight into a toolbar. `MyHistory.tsx:45` renders its `<h1>` with
the class `tf-start__title` — a copy-paste from the Start screen, and a fair summary of the
pattern's maturity. There is no consistent title / description / primary-action / breadcrumb
region, so no screen tells the user where they are or what the main action is.
**Do.** `PageHeader` from F2, applied to every screen.

### B3 — No counts, no badges, no at-a-glance state.
**Gap.** Nav items carry no counts. An operator cannot see "12 dead-letter jobs" without
opening Jobs; a business user cannot see their inbox depth without opening the inbox. §9
rules out an analytics API, but every list resource returns `total` — the counts are one
`size=0` query away.
**Do.** Badges on Work's inbox and Control's job/dead-letter/failed-instance nav, from
cheap count queries with a shared refresh interval.

### B4 — No global search or command palette.
**Gap.** A shortcut registry and a `?` help dialog already exist; there is no ⌘K. Control
in particular has ~15 destinations and no way to jump.
**Do.** ⌘K over destinations, saved views, and id lookup ("paste a process instance id,
go to it").

### B5 — Layout does not use the viewport.
**Gap.** Visible in the baseline: the inbox card is content-height inside a 900px viewport,
leaving ~560px of empty grey; the detail pane is a short floating card beside it. Nothing
is full-height, the table does not scroll within a fixed frame, and the toolbar and the
detail pane's action bar are not sticky — on a long task the Complete button scrolls away.
**Do.** Full-height app frame; list scrolls in its own region under a sticky toolbar and
above a sticky pagination bar; detail-pane actions pinned to its footer.

---

## C. Data-dense screens

### C1 — `DataTable` is a styled `<table>`.
**Gap** (`components/DataTable.tsx`, 93 lines). No sortable headers (no `aria-sort`
anywhere in the repo) even though every backing resource takes `sort`/`order` — `TaskInbox`
hardcodes `sort: "dueDate"`. No multi-select in the shared component, so `Jobs.tsx` hand-
rolls `useState<Set<string>>` plus checkboxes, and no other screen gets bulk actions (§14.4
asks for them beyond jobs). No row-level action menu — actions live only in the detail
pane. No column chooser, no density toggle, no column resize, no sticky first column, no
row virtualization (§8 forbids unbounded client loads, which is satisfied, but a 200-row
page still renders 200 rows). Responsive behaviour is one blunt rule: hide every
`secondary` column below 768px.
**Do.** Rebuild `DataTable` with: sortable headers wired to the query, optional selection
column with a shared bulk-action bar, per-row overflow menu, column visibility + density
persisted per user, sticky header **and** first column, virtualized body above a row
threshold.

### C2 — Pagination is Previous / Next.
**Gap.** No page numbers, no jump-to-first/last, no page-size control — `PAGE_SIZE` is a
module constant in 48 places. An operator paging to the end of a job queue clicks Next
repeatedly.
**Accept when**: `Pagination` offers page-size selection (25/50/100), first/last, and a
page indicator; the choice is remembered per list and encoded in the URL (F1).

### C3 — Status is prose, not a badge.
**Gap.** Priority renders as the words "High"/"Normal"; job state, instance state,
deployment state, definition suspended-state and validation severity are all bare text or a
one-off colour class (`.tf-due--tone`). Nothing scans.
**Do.** One `Badge` with the semantic tones already in the tokens (success/warning/danger/
info/neutral), applied to every status column across all four apps, with a documented
mapping from engine state → tone. Never colour alone — keep the word (WCAG 1.4.1).

### C4 — No icon system at all.
**Gap.** Two `<svg>` elements exist in the entire frontend: `Brand.tsx` and
`CmmnCanvas.tsx`. `EmptyState` accepts an `icon` prop that **no caller passes**. §14.2 also
asks for empty-state illustrations; there are none.
**Do.** Adopt one licence-clean icon set (or draw ~40 in-house), exported from
`togetherflow-common` as tree-shakeable components — nav, row actions, file types, model
types, status, toolbar. Add 5–6 empty-state illustrations built from the brand glyph
(inbox clear, no results, nothing deployed, no models yet, permission denied, error).
Watch the bundle budget — the axe-core incident in STATUS.md §2 is the precedent.

---

## D. Content and identity

### D1 — People are shown as raw ids.
**Gap.** Assignee, candidate, owner, commenter, attachment author, instance starter and
identity-link rows all render the login id (`alice`). No `firstName`/`lastName`/
`displayName` lookup exists anywhere in Work or Control; avatars appear only on Identity's
own profile page, though `UserPictureResource` is available to every app.
**Do.** A `UserChip` (avatar + display name + id on hover) in `togetherflow-common`, backed
by a batched, request-collapsing, cached IDM lookup. Fall back to the id when the directory
does not resolve it (LDAP deployments, deleted users).

### D2 — Untranslated strings survive in Identity. *(partly closed — see [§H](#h-forms--completed))*
**Gap.** Contradicts STATUS.md's "every module's strings are externalized":
`UserProfile.tsx:96` "No picture uploaded.", `:100` "Upload a picture", `:92` the `alt`
text, `Groups.tsx:346` "Members of this group", and the `main.tsx` configuration-error
screen in all four apps. The conformance test checks keys, not inline literals.
**Do.** Fix these, then add a lint rule (`react/jsx-no-literals` with an allowlist, or a
custom check) so the class of defect cannot recur.

### D3 — Monospace is applied where prose belongs. *(partly closed — see [§H](#h-forms--completed))*
**Gap.** `.tf-textarea` forces `--tf-font-mono` globally — correct for script bodies and
expressions in Design's properties panel, wrong for the task comment box, task description
and group description, where it is visibly odd in the baseline screenshot.
**Do.** Make monospace opt-in (`.tf-textarea--code`) and apply it only in the editors.
Form textareas are already handled; the comment box and the description fields are not.

### D4 — Write the content style guide §14.3 asks for.
**Gap.** Not present in `docs/ui/`. Terminology drifts ("instance" vs "case" vs "process"),
as does error-message voice.
**Do.** A one-page guide (sentence case, terminology table keyed to the engine's own
vocabulary, error-message shape "what happened + what to do", button verbs), plus a review
pass over the ~900 externalized strings.

---

## E. Design app (authoring surfaces)

### E1 — Dark mode stops at the canvas edge.
**Gap.** `design.css` patches roughly six bpmn-js/dmn-js selectors (`.djs-container`,
`.djs-direct-editing-content`, `.djs-context-pad .entry`, the decision-table container).
The palette, context pad chrome, overlays, minimap, popup menu, DMN literal-expression and
DRD surfaces keep their stock light styling — a bright slab inside a dark app.
**Do.** A full dark override sheet for both libraries, plus dark visual baselines for each
editor (see G1).

### E2 — Editor chrome is a button row.
**Gap.** `BpmnEditor` has the right capabilities (autosave, undo/redo, zoom in/out/fit,
minimap, live validation) but presents them as text buttons. There is no grouped toolbar
with icons and tooltips, no zoom-percentage readout, no alignment/distribute tools, no
element search on canvas, no visible "saved 12s ago / unsaved changes" indicator tied to
`lastSavedAt`, and no keyboard-shortcut sheet scoped to the editor.
**Do.** A proper editor toolbar primitive shared by the BPMN, CMMN and DMN editors.

### E3 — The properties panel is a 2,254-line wall of fields.
**Gap.** `PropertiesPanel.tsx` renders every property for the selected element in one
column. No collapsible groups, no "general / assignment / listeners / multi-instance /
documentation" sections, no per-element field search, no inline docs, no jump-to-error from
the validation list.
**Do.** Section the panel with remembered open/closed state, add a filter box, and link
each validation issue to the field that fixes it.

### E4 — Model library is a table, not a library.
**Gap.** `ModelLibrary.tsx` lists drafts in the generic `DataTable`. §7.4.1 calls for
thumbnail previews; the engine stores a thumbnail on the model and it is not shown.
**Do.** A card/grid view with thumbnails (table view retained as a toggle), model-type
icons, last-modified-by via `UserChip` (D1), and a filter rail.

---

## F. Theming, responsiveness, motion

### F7 — Responsiveness is "does not break", not designed.
**Gap.** Work collapses its two-pane grid at 1024px, at which point the detail pane stacks
below a full list rather than becoming a drawer/sheet — on tablet the user scrolls past the
whole inbox to reach the task they opened. Control, Identity and Design have two or three
ad-hoc breakpoints each, none shared. Touch sizing is one rule (`pointer: coarse` → 44px)
applied to the filter bar and saved views only, not to table rows, tabs, chips or menu
items.
**Do.** Detail-as-drawer below the tablet breakpoint; shared breakpoints from F3; the 44px
minimum extended to every interactive target under `pointer: coarse`.

### F8 — No motion design.
**Gap.** Two animations exist (button spinner, skeleton shimmer), both correctly
reduced-motion-guarded. Nothing else moves: panels appear, dialogs pop, toasts jump. Absence
of motion is a large part of why the UI reads as unfinished.
**Do.** A small, tokenized motion set — dialog/drawer enter-exit, toast slide, row selection,
skeleton→content crossfade, expander — every one behind `prefers-reduced-motion`.

### F9 — Toast affordances.
**Gap.** Errors persist and successes auto-dismiss, which is right. Missing: an action slot
(Undo on delete/unclaim, "View" on deploy), pause-on-hover, and de-duplication when the same
failure fires repeatedly.

### F10 — No print or export path.
**Gap.** No print stylesheet anywhere. "Print this case summary" and "export this instance's
history" are routine compliance asks (§13.7) and today produce the app chrome on paper.

---

## G. Verification

### G1 — Visual regression covers one app, three screens, and is stale. *(suites built in W1.5 — baselines still outstanding, see [§J](#j-wave-1--completed))*
**Gap.** Only `togetherflow-work` has `playwright.visual.config.ts`; baselines exist for
login, inbox and task-detail at three widths plus one dark variant. Control, Identity and
Design have none. The inbox baseline shows neither the definition/due/priority filter bar
nor the saved-views control that `TaskInbox.tsx` renders today, so the baselines appear to
predate those features — a suite that has not been re-approved is not protecting anything.
**Do.** Re-approve Work's baselines; extend the suite to Control (jobs, instances), Identity
(users, groups) and Design (library, BPMN editor, DMN editor), each in light and dark at
desktop and tablet; run it in CI.

### G2 — Accessibility verification is automated-only.
**Gap.** axe-core runs in CI (good, and required by §13.6), but §14.5's manual pass — screen
reader, keyboard-only — is not recorded as having happened. Automated tools do not catch the
F6 focus trap, the C1 sort semantics, or announcement of async list updates.
**Do.** A keyboard-only and NVDA/VoiceOver pass per app, findings tracked here.

### G3 — Usability loop (§14.5) has no evidence of running.
**Gap.** Nothing in `docs/ui/` records a persona actually using any app. Everything above is
an internal review — the same kind §14.5 says is not sufficient.

---

## H. Forms — completed

Built 2026-08-27. The renderer in `togetherflow-common` is the form surface for both the
Work app (task and start forms, §7.1) and Design's builder (§7.4.6), so all of this landed
in one place.

**Defects found while building, not in the audit above:**

- **The submit button was disabled while the errors were invisible.** Errors surfaced only
  once a field had been visited, so a user who never touched a required field saw a form
  with no visible problems and a Complete button that would not respond. Submitting is now
  always accepted; an invalid form answers by revealing every problem, listing them in a
  summary that takes focus, with a link per problem that moves focus to its field.
- **Radio groups had no accessible name.** The `<label htmlFor>` pointed at an id no
  element carried, and `aria-labelledby={undefined}` was passed explicitly — a screen
  reader read the options without the question. They are `<fieldset>`/`<legend>` now.
- **Validation messages were hardcoded English** ("Enter a whole number.") despite §8, and
  the checkbox label was a hardcoded `"Yes"`. Both are in the catalogue.
- **The renderer's styles lived in `work.css`** — a shared component whose CSS shipped
  with one of its two consumers, so Design's builder had none of it. Now in the theme.
- **The date round trip lost a day** for anyone whose offset crosses midnight:
  `toISOString()` on a value like `2026-03-05T01:00:00+03:00` reports 4 March, and the
  date walked backwards one step per save. It reads the calendar date literally now.
- **The i18n fallback resolved no plural key at all.** `t("x", {count})` looks for
  `x.one`/`x.other`; the no-provider fallback did a bare lookup and rendered the key.

**Also built:** field help text from `params.description`, live character counters against
`maxLength`, min/max/minLength/maxLength/pattern constraints, a 12-column container grid
that honours the model's `colspan`, model-read-only fields shown as values instead of
greyed-out controls, a real `<form>` (Enter submits; the out-of-form Complete button
targets it with `form=`), a drag-and-drop upload with client-side type and size checks and
a remove action, wheel-guarded number inputs, and touch-sized controls.

**Closes:** the §14.1/§14.3 bar for every form screen; D2 and D3 for forms only; and the
§7.4.6 requirement that the builder preview with the same renderer Work uses at runtime —
Design's canvas had been a list of field names, and now has a Fields/Preview switch where
required fields, visibility rules and validation all behave as they will on a task.

**Verification:** 279 tests in `togetherflow-common` (up from 242), 85 in Work, 493 in
Design; lint, typecheck, production build and bundle budgets pass for all four apps. Not
covered: no e2e or visual-regression case exercises a form yet, so G1 still applies —
Work's baselines do not include a form-bearing task.

## I. Gap analysis against Flowable's Enterprise React Design

Sources read 2026-08-27: [React Modeler introduction](https://documentation.flowable.com/latest/reactmodel/react-modeler-introduction),
[General Concepts](https://documentation.flowable.com/latest/reactmodel/general-design-concepts),
[Form Editor](https://documentation.flowable.com/latest/reactmodel/user/design/form-editor),
[App Editor](https://documentation.flowable.com/latest/reactmodel/user/design/app-editor),
[Git Panel](https://documentation.flowable.com/latest/reactmodel/git-connectivity/reference/git-panel),
[Model Templates](https://documentation.flowable.com/latest/reactmodel/model-templates),
[Design introduction](https://documentation.flowable.com/latest/reactmodel/user/design/introduction).

REQUIREMENTS.md §2 already treats the Enterprise product as the requirements source. This
section does that for Design specifically, and sorts what it finds by whether this fork
can actually build it — the distinction §9 draws for Hub/Engage/Inspect, applied here.

### I.1 Buildable on this repo's existing REST surface

**I1 — Two people editing one model silently overwrite each other.** *(highest priority
in this section.)* Enterprise has model locking, plus an "Unlock Models" app action.
`ModelApi.saveSource` PUTs unconditionally, and [BpmnEditor.tsx](modules/togetherflow-design/src/main/frontend/src/features/bpmn/BpmnEditor.tsx)
autosaves every 4 idle seconds — so a second editor does not merely overwrite the first,
it does so repeatedly and without either of them touching Save. `ModelResponse` carries
`lastUpdateTime`, which is enough to detect the clash: re-read before each autosave, and
on a change refuse to write and offer reload-or-overwrite. That is a client-side guard,
not a lock, but it converts silent data loss into a visible conflict.

**I2 — The form builder cannot author what the renderer can now read.** After §H the
renderer handles 19 field types; [formDraft.ts](modules/togetherflow-design/src/main/frontend/src/features/forms/formDraft.ts)'s
palette offers 11. Not offered, though the runtime renders them: `upload`, `people`,
`functional-group`, `expression`, `container`, `hyperlink`, `spacer`,
`headline-with-line`. The same asymmetry applies to field configuration — the renderer
reads `description`, `minLength`, `maxLength`, `min`, `max`, `pattern`, `patternMessage`,
`accept`, `maxFileSize` and `layout.colspan` from `params`, and the properties panel can
set none of them. Enterprise groups its palette into Data Entry / Selection / Display /
Container and lays fields out on a twelve-slot row grid, which is the same grid §H built
into the renderer. Closing this is mostly properties-panel work against code that already
exists on the runtime side.

**I3 — No drag-and-drop in the builder.** Palette clicks append to the end; reordering is
Move up / Move down in the properties panel. Enterprise is drag-from-palette-to-canvas.

**I4 — No model relations.** Enterprise shows "Uses" and "Used by" per model and a
"Refresh Relations" action. Nothing here can answer "which processes reference this
form?", and [ModelLibrary.tsx](modules/togetherflow-design/src/main/frontend/src/features/library/ModelLibrary.tsx)
will delete a draft that three processes call without a word. Derivable client-side by
parsing the sources already stored.

**I5 — No model templates.** Enterprise marks any model as a template and offers it when
creating a new one. A flag in `metaInfo` plus a picker in the create dialog.

**I6 — Apps cannot be exported or imported.** Enterprise exports an app as a ZIP and
imports it into another instance, with clash handling (warn/stop, update existing, create
new keys). [AppBuilder.tsx](modules/togetherflow-design/src/main/frontend/src/features/apps/AppBuilder.tsx)
already zips a bundle with `fflate` — but only to POST it to the engine. The same bytes
as a download, and the reverse as an upload, is a small change to code that exists.

**I7 — App editor is thin next to theirs.** Ours: name, key, description, icon, model
selection, publish, published versions. Theirs adds tags, display order, theme, app-level
variables, revisions that can be reverted / copied / published / downloaded independently,
and per-app members and roles.

**I8 — Editor chrome parity** (extends E2). Enterprise's editors share one menu bar:
save, validate, undo/redo, export, runtime preview, debug console, gridlines toggle, model
lock, data-model view, revisions. Ours has save/validate/undo/redo/zoom/minimap/history as
loose buttons — no gridlines or snapping, no export from inside the editor, no shared bar.

**I9 — No library IA beyond a flat list.** Enterprise has workspaces at the top (see I10)
and tags on models. Even without workspaces, `category` and `metaInfo` could carry tags
and grouping, and the library sorts by nothing today.

### I.2 Needs backend surface this fork does not have

Each of these is a real gap, and each is a scoping decision rather than frontend work.

**I10 — Workspaces.** Enterprise's IA is Workspaces → Apps → Models: a default workspace
per user, a shared workspace of reusable models, public/private visibility, and apps
movable between workspaces. Ours is one flat model repository. `/repository/models` has
`category` (already spent on model kind) and `tenantId` (already spent on tenancy), so a
workspace is either a `metaInfo` convention with no server-side enforcement or new
surface. **This is the largest single structural difference between the two products.**

**I11 — Design-time permissions.** Enterprise has workspace- and app-scoped roles
(owner / modeler / reader), tenant-wide global roles, and additive custom roles.
TogetherFlow gates Design with one privilege check in the shell — anyone who can open it
can edit and delete anything in it. §13.1 requires the server to enforce what the UI
hides, and `/repository/models` has no per-model authorization to enforce.

**I12 — Git connectivity.** Absent entirely: commit, pull, revert, branch create/switch,
PR, stash/restore, a per-model changed/added/removed list with diffs, and connection setup
against a provider, repo, branch and sub-path. Models here live only in the engine's
database. After workspaces, this is the feature that most marks the two apart.

**I13 — Data model, app variables, data dictionary.** Enterprise binds form fields to a
data model with `{{expression}}` bindings and scope prefixes, and defines app-level
variables in two modes. Ours names variables as free text and hopes they match.

**I14 — Runtime preview and model testing.** Enterprise previews a model against a
runtime and publishes authored tests to Inspect. §H added a form preview; there is no
"start this process and watch it run" anywhere.

**I15 — Per-model translations.** Enterprise translates labels inside the component
settings and exports/imports translation files per app. ADR 0013's layer translates the
*UI*; nothing translates model content.

### I.3 Explicitly not building — no OSS engine behind them

Extends REQUIREMENTS.md §9 with the model types in the React Modeler's sidebar that this
fork's engines cannot execute: **AI Agent**, **Knowledge Base**, **Service Registry**,
**Master Data**, **SLA**, **Security Policy**, **Sequences**, **Queries**, **Action**,
**Content models**, **Data Objects**, **Variable Extractors**, **Dashboard components**,
**Plugins**, **Pages / FlowApps**, **Palette definitions** (Enterprise's configurable
palette — REQUIREMENTS §4 already rules out porting its format), and the **model generator
/ connectors** (OpenAPI3, Swagger, Salesforce). Listing them is the point: a reader
comparing the two sidebars should be able to tell absence-by-decision from absence-by-
oversight.

### Suggested sequencing for §I

1. **I1** on its own, ahead of everything — it is data loss, not parity.
2. **I2 + I3** next: the runtime half already exists after §H, so this is the cheapest
   real closing of distance, and forms are the surface a citizen developer meets first.
3. **I4, I5, I6** — self-contained, each worth a phase-tail.
4. **I10/I11** as one scoping decision, then **I12** — these are product decisions with
   backend cost, not backlog items to pick up.

## Suggested order

| Wave | Items | Why first |
|---|---|---|
| 1 — Foundations | F1 routing, F5 shell CSS, F3 tokens, F4 font, F2 primitives (first tranche: `Badge`, `Card`, `PageHeader`, `Modal`, `Avatar`, `Tabs`) | Everything below is cheaper afterwards; F1 and F5 are correctness, not taste |
| 2 — Density & scanning | C1 table, C2 pagination, C3 badges, C4 icons + illustrations, B5 layout | The screens users spend all day in |
| 3 — Identity & IA | D1 user chips, B1 nav, B2 page headers, B3 counts, B4 palette, D2/D3/D4 content | Turns "an id and a word" into a product |
| 4 — Authoring | E1 dark canvas, E2 toolbar, E3 panel sections, E4 library cards | Design's own surface, once the shared kit exists |
| 5 — Finish & proof | F6 focus trap (pull earlier if a11y sign-off is near), F7 responsive, F8 motion, F9 toasts, F10 print, G1–G3 | Locks the gains in so they cannot erode |

F6 is listed in wave 5 by dependency (it needs F2's `Modal`) but is an accessibility defect,
not polish — schedule it against G2 rather than against the visual work.

---

## J. Wave 1 — completed

**Done 2026-08-27.** [ENTERPRISE_PARITY_PLAN.md](ENTERPRISE_PARITY_PLAN.md)'s W1.1–W1.5.
Written the way §H is: what changed, and which item above it closes.

### W1.1 — Concurrent-edit guard *(closes I1)*

`ModelApi.saveSource` reads the stored source and compares it with what this browser last
read or wrote before it writes; a difference throws `ConcurrentEditError` and the write is
refused. Six editors autosave every four idle seconds against what was an unconditional
PUT, so before this two people on one model overwrote each other with neither pressing
Save.

- **Not `lastUpdateTime`.** The plan's first draft proposed the timestamp;
  `ModelEntityManagerImpl.insertEditorSourceForModel` calls `updateModel` only when
  `editorSourceValueId` is null — i.e. on the first save — so it is frozen from the second
  save onward. The guard compares source bytes.
- **Fails open.** A read the guard itself could not perform does not block the save:
  turning a transient network error into refused work is worse than the window it closes.
- **Reload-or-overwrite**, in `features/editors/ConflictPrompt.tsx`, shared by all six
  editors. Autosave stops while a conflict is unresolved — a prompt that reappeared every
  four seconds would be worse than none.
- **Still a narrowed window, not a closed one.** The read and the write are two requests.
  Closing it needs a server-side precondition, which is W3.1's model locking, and the code
  says so where the guard lives.

### W1.2 — Routing decision *(ADR 0016)*

An in-house router in `togetherflow-common/src/routing`, ~200 lines, following the
reasoning already recorded in ADR 0001 and ADR 0013. The two things that tipped it past
precedent: the bundle budgets (§13.5) had 4 kB and 5 kB of headroom against React Router's
~12–15 kB, and none of the surface that justifies React Router — nested layout routes,
data loaders, SSR — is wanted in four flat apps. The ADR records the revisit triggers.

### W1.3 — Routing and shell *(closes F1, F5, B5)*

- **F1.** Every screen in all four apps has a URL, and so does every entity that has a
  detail view: `/inbox/:taskId`, `/cases/:caseId`, `/instances/:instanceId`,
  `/deployments/:deploymentId`, `/users/:userId`, `/models/:modelId`. Filters, sort and
  page are in the query string through a shared `useListState`, so a filtered list is a
  link. Nav items and rows are real `<a href>`s — modifier-clicks and middle-clicks are
  left to the browser, which is the half of routing that breaks silently.
- **F5.** The 204 byte-identical lines at the head of `work.css`, `control.css`,
  `identity.css` and `design.css` — 816 lines in all, verified identical before removal —
  are now `togetherflow-common/src/theme/shell.css`. `grep -l "tf-shell__header"
  **/styles/*.css` returns nothing, which was F5's stated acceptance.

  F2's stronger acceptance — *no app stylesheet defines a component class* — needed a
  second pass: the shared definitions were added but the app copies were left shadowing
  them. 70 duplicated base rules are gone, and a check over the four stylesheets confirms
  none redefines a class `theme/` owns. What stayed are genuine contextual overrides
  (`.tf-row-actions .tf-button { padding: 4px 8px }` is Control's density choice, not a
  second copy of Button). The four app stylesheets went from 3,286 lines to 2,014.

  One name collision surfaced and was resolved rather than papered over: Control's and
  Identity's `.tf-card` was a *clickable tile*, a different component that happened to
  share the shared `Card`'s name. It is now `.tf-card--interactive`, a modifier in
  `togetherflow-common`.
- **B5.** `.tf-shell` is `height: 100%` with `overflow: hidden` and the main region as the
  only scroll container, so a page header stays put while its list scrolls. Before, the
  frame was `min-height: 100vh` with the page as the scroller — which is why the old inbox
  baseline showed content in the top 340px of a 900px viewport and grey below.

### W1.4 — Component set *(closes F2, F3, F4, F6, C3, C4)*

- **F2.** Eleven primitives added: `Badge`, `Card`, `PageHeader`, `Modal`, `Tabs`,
  `Avatar`/`UserChip`, `DropdownMenu`, `Breadcrumb`, `SidebarNav`, `Icon`,
  `EmptyIllustration`. Every one is documented in the gallery, enforced by the existing
  filesystem coverage check. The classes each app was re-inventing — `.tf-panel`,
  `.tf-card`, `.tf-chip`, `.tf-badge`, `.tf-banner`, `.tf-toolbar` — have one definition.
- **F3.** Motion, z-index, breakpoints, line-height, font-weight, border-width and a type
  ramp reaching 40px are now tokens, and `theme/tokens.test.ts` reads every stylesheet in
  every module and fails on a raw literal. That is what makes F3's acceptance a rule
  rather than a convention — it was a convention before, which is how `0.12s ease` reached
  five files and 20/30/60/70/100 reached five more.
- **F4.** Inter is shipped: the `latin` and `latin-ext` variable subsets, self-hosted (no
  third-party origin in the CSP), with a metric-matched `Inter Fallback` face so the
  `font-display: swap` costs no layout shift. The four override values are computed from
  the fonts' own OS/2 tables rather than copied — the arithmetic is in `theme/fonts.css`.
- **F6.** One `Modal` owns focus trap, focus restore, body scroll lock and `inert` +
  `aria-hidden` on everything behind. It renders through a portal, which is what makes the
  inert logic correct at all: in place, "everything except the dialog" would include the
  React root the dialog is inside. `ConfirmDialog` is built on it. Twelve tests cover the
  trap, including an axe pass.
- **C3.** One `Badge` with the semantic tones, plus `toneForState`/`toneForPriority` as the
  documented engine-state → tone mapping C3 asks for, so Work and Control cannot disagree
  about what colour a suspended definition is. The word always stays (WCAG 1.4.1). All 30
  hand-rolled `<span className="tf-badge tf-badge--running">` sites across the four apps
  are converted, and the two class-returning helpers (`stateBadgeClass`,
  `planItemBadgeClass`) now return a tone instead — `Badge` owns how a tone is drawn.
- **C4.** ~55 icons on one 24×24 grid and six empty-state illustrations built from the
  brand glyph, drawn in-house for the bundle reason C4 itself flags. `EmptyState` finally
  has callers passing its illustration.

### W1.5 — Tables and navigation *(closes C1, C2, B1, B2, B3; moves G1)*

- **C1.** `DataTable` rebuilt: sortable headers wired to the *server* query (`aria-sort`
  existed nowhere in the repo before), optional selection with a shared bulk-action bar,
  per-row overflow menu, column visibility and density persisted per browser, sticky
  header and first column, and virtualization above 60 rows. `Jobs.tsx`'s hand-rolled
  `useState<Set<string>>` and its own checkbox column are gone — the behaviour is the
  component's, so every other list can have it.
- **C2.** `Pagination` has page numbers, first/last, and a 25/50/100 size control; the
  choice is remembered per list *and* encoded in the URL, so a shared link shows the
  sender's page rather than re-paginating to the recipient's preference.
- **B1.** A collapsible left rail for Control, Design and Identity, with icons, grouped
  sections and a persisted collapsed state; Work keeps the top bar, as B1 specifies.
- **B2.** `PageHeader` on every list screen, owning the screen's single `<h1>`.
- **B3.** Nav counts from `total` on `size=1` queries — Work's inbox depth, Control's
  instance/case counts and its dead-letter count in the danger tone, Identity's three
  section counts, Design's model count. §9 rules out an aggregation API; these are one
  cheap request each and nothing more is claimed for them.
- **G1 — moved here from E8, and honestly incomplete.** Visual-regression suites now exist
  for all four apps, light and dark, desktop and tablet, and CI runs all four. **No
  baseline images are committed**, for the reason set out in
  `togetherflow-work/src/main/frontend/e2e/visual/README.md`: the old Work baselines
  predated this pass and were deleted rather than left to report false regressions, and
  they could not be regenerated on the machine this was written on (macOS 12, which
  Playwright 1.62 refuses to install a browser for). One `--update-snapshots` run on a
  supported platform or in the pinned container completes it.

### Not closed, and not attempted

Still open in §A–C: **B4** (⌘K command palette) and **F7–F10** (designed responsiveness,
motion design, toast affordances, print/export). None was in Wave 1's scope. **D1** has its
primitive and two screens; the rest of Work and Control is W2.1/W2.2.
