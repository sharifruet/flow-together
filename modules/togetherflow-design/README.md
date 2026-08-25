# TogetherFlow Design

Model authoring and deployment across all six model types — BPMN, CMMN, DMN, apps, forms
and events (REQUIREMENTS.md §7.4). Phases 4–6 of
[docs/ui/IMPLEMENTATION_PLAN.md](../../docs/ui/IMPLEMENTATION_PLAN.md).

## Run it locally

```bash
docker run -p 8080:8080 flowable/flowable-rest
cd src/main/frontend && npm install && npm run dev   # http://localhost:5276
```

## What's here

- **Model library** — drafts across every model type, search, create, duplicate, delete.
- **BPMN modeler** — bpmn-js canvas with palette, context pad, undo/redo, zoom, and a
  **Flowable-native properties panel** (assignee, candidate users/groups, form key, due
  date, service-task class/expression/delegate, sequence-flow condition, async).
- **DMN modeler** — dmn-js, giving both the DRD view and the decision-table editor.
- **Deploy** — saves the draft, then uploads the XML to the engine. BPMN goes to
  `/repository/deployments`, DMN to `/dmn-repository/deployments`.

Drafts store **native XML**, not an intermediate editor format, so a model authored
elsewhere opens unchanged and the round trip is lossless.

## Not losing work

Losing modelling work is the fastest way for an editor to feel unprofessional, so:

- **Autosave** four seconds after editing goes idle.
- **Unsaved-changes guard** on both in-app navigation and browser reload/close.
- **Undo/redo** from the canvas command stack (dirty state is derived from it, so the
  indicator cannot disagree with what was actually done).
- **Ctrl/Cmd+S** saves.
- **Deploy saves first**, so deploying after an edit never ships the previous version.

## Known limitations

- **No pre-deploy validation.** The engine has `flowable-process-validation`, but no REST
  endpoint exposes it, so an invalid model fails at deploy time with the engine's message.
- **The moddle descriptor is not exhaustive.** It covers what the panel edits plus common
  attributes; anything outside it survives the round trip but isn't typed or editable.
  Listeners, form properties, multi-instance and boundary-event config aren't exposed yet.
- **No model versioning UI.** The engine's model table has a `version` column; Design
  writes 1 and does not yet increment or show history.

## Bundle

The editors are lazily loaded, so the library screen stays light:

| Chunk | Gzipped |
|---|---|
| entry | ~74 kB |
| BpmnEditor | ~81 kB |
| DmnEditor | ~236 kB |
| CmmnEditor | ~5 kB |
| AppBuilder | ~7 kB |
| FormBuilder | ~2 kB |
| EventEditor | ~2 kB |

`chunkSizeWarningLimit` is raised to 900 kB in this module for dmn-js specifically; the
entry chunk stays well inside the normal budget.

## Container

```bash
cd modules
docker build -f togetherflow-design/docker/Dockerfile -t togetherflow/design:dev .
docker run -p 8080:8080 -e TF_AUTH_MODE=basic togetherflow/design:dev
```

## Case (CMMN) modeler

A hand-built SVG canvas — no maintained CMMN canvas library exists ([ADR 0009](../../docs/ui/adr/0009-cmmn-canvas.md)).

Working: palette, selection, drag with grid snapping, resize, nesting with reparent-on-drop
(stages carry their children), cascading delete that also prunes sentries pointing at
removed elements, undo/redo, entry criteria, properties incl. `flowable:` attributes,
autosave, unsaved-changes guard, save and deploy to `/cmmn-repository/deployments`.

Not yet built, and honestly a foundation rather than a finished modeller: connection
drawing (entry criteria are configured in the panel, not by dragging a line), draggable
sentry placement, exit criteria in the panel, multi-select/align/copy-paste, zoom and pan,
and auto-layout for models that arrive without diagram information.

The model layer (`cmmnModel.ts`) is unit-tested against the engine's own
`examples/employee-onboarding.cmmn`, so producing deployable XML is pinned down
independently of the drawing surface.

## App builder

Composes a deployable app from existing models (§7.4.5). An app is kept as a draft in the
same model repository as everything else (category `togetherflow:app`, JSON source), so it
can be re-opened and republished rather than being write-only.

**Publishing** zips the `.app` descriptor together with each bundled model's source
client-side (via `fflate`) and posts it to `/app-repository/deployments`. Verified against a
running engine: the app definition is created **and every bundled resource is deployed to
its own engine** — a BPMN file in the bundle becomes a process definition, with no separate
call.

File names inside the bundle carry the suffix each engine matches on (`.bpmn20.xml`,
`.cmmn`, `.dmn`); the BPMN and CMMN suffixes are matched case-sensitively.

If a selected model has no saved content, publishing is **refused** rather than silently
shipping a bundle with that model missing.

Not yet built: theme/access (`usersAccess`/`groupsAccess`) fields, and a view of already
published app definitions and their versions.

## Form builder

Authors Flowable's own `SimpleFormModel` JSON — the **same schema the Work app's renderer
consumes** ([ADR 0007](../../docs/ui/adr/0007-flowable-native-form-renderer.md)) — so a form
built here renders there with nothing translated in between. Palette, ordered field list and
a properties panel; option fields (dropdown, radio) manage their own choices.

There is **no Deploy button**, and that is deliberate. Probing a running engine established
that no form REST module exists and the stock `flowable-rest` image does not even initialise
a form engine (`GET /runtime/tasks/{id}/form` answers *"Form engine is not initialized"*).
Forms therefore ship inside an app bundle, and take effect wherever a form engine is actually
configured. The builder says so on screen rather than offering an action that cannot succeed.
See [ADR 0010](../../docs/ui/adr/0010-form-and-event-authoring.md).

Not yet built: outcomes (custom submit buttons), validation rules beyond *required*,
conditional visibility, and layout columns.

## Event Registry editor

Events and channels are configuration rather than diagrams, so this is a structured editor,
not a canvas. One draft can carry an event definition, a channel, or both: the event's
payload fields with a **correlation parameter** (how the engine matches an incoming event to
a waiting instance), and an inbound or outbound channel with its transport, destination and
event-key mapping.

**Deploying sends two separate calls** when a draft holds both — the event registry endpoint
takes a single `.event` or `.channel` file and accepts no archive, unlike the process and app
engines. They are consequently versioned independently in the registry.

Verified against a running engine: an event and channel authored here deploy, appear in
`event-definitions` / `channel-definitions`, and the draft reopens intact.

Not yet built: header payload fields, JSON-pointer event-key detection, outbound serializer
options beyond the default, and a Control-side view of event instances and channel health.

## Drafts are stored as opaque bytes

Every model type — XML for BPMN/CMMN/DMN, JSON for apps, forms and events — is a draft in the
one generic model repository (`/repository/models`), distinguished by a `togetherflow:*`
category. That is what let forms and events ship with no new backend module.

The consequence is worth stating, because it cost a real defect: that endpoint returns
`application/octet-stream` regardless of content, so a client that infers how to read a body
from its shape will hand back a **parsed object** for a JSON draft where the caller expects
text. Every app, form and event draft reopened blank until `ModelApi.getSource` was changed
to read an explicit text response. It is pinned by a regression test.
